// src/main.js - Enhanced desktop layout with sidebar + main area
import './style.css';
import FHIR from 'fhirclient';
import { fetchResource } from './fhirClient.js';
import { getChatResponse } from './openaiChat.js'; // Keep for fallback
import { EnhancedFHIRChat } from './openaiChatEnhanced.js'; // New enhanced chat
import { 
  summarizePatient, 
  summarizeVitals, 
  summarizeMeds,
  summarizeEncounters,
  summarizeConditions
} from './summarizers.js';
import { 
  extractPatientInfo, 
  processVitalSigns, 
  processMedications,
  processEncounters,
  processConditions
} from './fhirUtils.js';
import { marked } from 'marked';

// --- Configuration ---
const CLIENT_ID = '023dda75-b5e9-4f99-9c0b-dc5704a04164';
const APP_REDIRECT_URI = window.location.origin + window.location.pathname;
const BACKEND_PROXY_URL = 'https://snp-vite-backend.onrender.com/api/fhir-proxy';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// --- FHIR Data Holders for Chat Context ---
let lastPatientData = null;
let lastVitalsData = null;
let lastMedicationsData = null;
let lastEncounterData = null;
let lastConditionData = null;
let smartClientContext = null;
let enhancedChat = null;

// --- UI State ---
let contextConfig = { 
  vitalsCount: 5, 
  medsCount: 5, 
  encounterCount: 5,
  conditionCount: 5,
  includePatient: true, 
  includeVitals: true, 
  includeMeds: true,
  includeEncounters: true,
  includeConditions: true,
  useEnhancedChat: true
};
let sidebarCollapsed = false;
let chatHistory = [];

// --- UI Helper Functions ---
function showLoading(isLoading) {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = isLoading ? 'block' : 'none';
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('patient-sidebar');
  const mainArea = document.getElementById('main-area');
  const toggleBtn = document.getElementById('sidebar-toggle');
  
  sidebarCollapsed = !sidebarCollapsed;
  
  if (sidebarCollapsed) {
    sidebar.classList.add('collapsed');
    mainArea.classList.add('expanded');
    toggleBtn.innerHTML = '▶️';
    toggleBtn.title = 'Show patient data';
  } else {
    sidebar.classList.remove('collapsed');
    mainArea.classList.remove('expanded');
    toggleBtn.innerHTML = '◀️';
    toggleBtn.title = 'Hide patient data';
  }
}

function switchDataTab(tabName) {
  // Hide all tab content
  const tabContents = document.querySelectorAll('.tab-content');
  tabContents.forEach(content => content.style.display = 'none');
  
  // Remove active class from all tabs
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => tab.classList.remove('active'));
  
  // Show selected tab content
  const selectedContent = document.getElementById(`${tabName}-tab`);
  if (selectedContent) selectedContent.style.display = 'block';
  
  // Add active class to selected tab
  const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
  if (selectedTab) selectedTab.classList.add('active');
}

function updateDataSourceIndicators() {
  const indicators = {
    'patient-indicator': contextConfig.includePatient,
    'vitals-indicator': contextConfig.includeVitals,
    'meds-indicator': contextConfig.includeMeds,
    'encounters-indicator': contextConfig.includeEncounters,
    'conditions-indicator': contextConfig.includeConditions,
    'enhanced-indicator': contextConfig.useEnhancedChat
  };
  
  Object.entries(indicators).forEach(([id, enabled]) => {
    const indicator = document.getElementById(id);
    if (indicator) {
      indicator.textContent = enabled ? '✓' : '✗';
      indicator.className = `context-indicator ${enabled ? 'enabled' : 'disabled'}`;
    }
  });
}

function addChatMessage(role, content, toolCalls = []) {
  const chatContainer = document.getElementById('chat-history');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  
  const timestamp = new Date().toLocaleTimeString();
  
  let toolInfo = '';
  if (toolCalls && toolCalls.length > 0) {
    const tools = toolCalls.map(call => call.function).join(', ');
    toolInfo = `<div class="tool-usage">🔍 Searched: ${tools}</div>`;
  }
  
  messageDiv.innerHTML = `
    <div class="message-header">
      <span class="message-role">${role === 'user' ? 'You' : 'Assistant'}</span>
      <span class="message-time">${timestamp}</span>
    </div>
    ${toolInfo}
    <div class="message-content">${role === 'assistant' ? marked.parse(content) : content}</div>
    <div class="message-actions">
      <button onclick="copyMessage(this)" title="Copy message">📋</button>
      ${role === 'assistant' ? '<button onclick="askFollowUp(this)" title="Ask follow-up">💬</button>' : ''}
    </div>
  `;
  
  chatContainer.appendChild(messageDiv);
  chatContainer.scrollTop = chatContainer.scrollHeight;
  
  // Store in history
  chatHistory.push({ role, content, toolCalls, timestamp });
}

function displayPatientSummaryCard(data, clientContext) {
  lastPatientData = data;
  const container = document.getElementById('patient-summary-card');
  const patientInfo = extractPatientInfo(data, clientContext);
  
  container.innerHTML = `
    <div class="summary-header">
      <h3>${patientInfo.name}</h3>
      <span class="patient-id">PAT ID: ${patientInfo.patId}</span>
    </div>
    <div class="summary-grid">
      <div class="summary-item">
        <label>Age/Gender:</label>
        <span>${calculateAge(patientInfo.birthDate)} / ${patientInfo.gender}</span>
      </div>
      <div class="summary-item">
        <label>DOB:</label>
        <span>${patientInfo.birthDate}</span>
      </div>
      <div class="summary-item">
        <label>CSN:</label>
        <span>${patientInfo.csn}</span>
      </div>
      <div class="summary-item">
        <label>Phone:</label>
        <span>${patientInfo.phone}</span>
      </div>
    </div>
  `;
}

function calculateAge(birthDate) {
  if (!birthDate || birthDate === 'N/A') return 'Unknown';
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function displayDataPreview(dataType, data, count) {
  const container = document.getElementById(`${dataType}-preview`);
  if (!container) return;
  
  let previewContent = '';
  
  switch (dataType) {
    case 'vitals':
      const vitals = processVitalSigns(data, 3);
      previewContent = vitals.slice(0, 3).map(v => 
        `<div class="preview-item">${v.name}: <strong>${v.value}</strong></div>`
      ).join('');
      break;
      
    case 'meds':
      const meds = processMedications(data, 3);
      previewContent = meds.slice(0, 3).map(m => 
        `<div class="preview-item">${m.name} <span class="status-${m.status}">${m.status}</span></div>`
      ).join('');
      break;
      
    case 'encounters':
      const encounters = processEncounters(data, 3);
      previewContent = encounters.slice(0, 3).map(e => 
        `<div class="preview-item">${e.type} - ${e.period.start}</div>`
      ).join('');
      break;
      
    case 'conditions':
      const conditions = processConditions(data, 3);
      previewContent = conditions.slice(0, 3).map(c => 
        `<div class="preview-item">${c.code} <span class="status-${c.clinicalStatus.toLowerCase()}">${c.clinicalStatus}</span></div>`
      ).join('');
      break;
  }
  
  container.innerHTML = previewContent || '<div class="preview-item">No data available</div>';
}

function displayFullDataTab(dataType, data) {
  const container = document.getElementById(`${dataType}-full-data`);
  if (!container) return;
  
  let fullContent = '';
  
  switch (dataType) {
    case 'vitals':
      const vitals = processVitalSigns(data, 20);
      fullContent = `
        <div class="data-table">
          ${vitals.map(v => `
            <div class="data-row">
              <div class="data-cell-main">${v.name}</div>
              <div class="data-cell-value">${v.value}</div>
              <div class="data-cell-date">${v.date}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;
      
    case 'meds':
      const meds = processMedications(data, 20);
      fullContent = `
        <div class="data-table">
          ${meds.map(m => `
            <div class="data-row">
              <div class="data-cell-main">${m.name}</div>
              <div class="data-cell-value">${m.dosage.formatted}</div>
              <div class="data-cell-status status-${m.status}">${m.status}</div>
              <div class="data-cell-date">${m.date}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;
      
    case 'encounters':
      const encounters = processEncounters(data, 20);
      fullContent = `
        <div class="data-table">
          ${encounters.map(e => `
            <div class="data-row">
              <div class="data-cell-main">${e.type}</div>
              <div class="data-cell-value">${e.location}</div>
              <div class="data-cell-status status-${e.status}">${e.status}</div>
              <div class="data-cell-date">${e.period.formatted}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;
      
    case 'conditions':
      const conditions = processConditions(data, 20);
      fullContent = `
        <div class="data-table">
          ${conditions.map(c => `
            <div class="data-row">
              <div class="data-cell-main">${c.code}</div>
              <div class="data-cell-value">${c.category}</div>
              <div class="data-cell-status status-${c.clinicalStatus.toLowerCase()}">${c.clinicalStatus}</div>
              <div class="data-cell-date">${c.onsetDate !== 'Unknown' ? c.onsetDate : c.recordedDate}</div>
            </div>
          `).join('')}
        </div>
      `;
      break;
  }
  
  container.innerHTML = fullContent;
}

function displayError(message, errorObj = null) {
  showLoading(false);
  addChatMessage('assistant', `**Error:** ${message}${errorObj ? `\n\nDetails: ${errorObj.message}` : ''}`);
  console.error(message, errorObj);
}

// --- Setup UI Event Listeners ---
function setupUIListeners() {
  // Sidebar toggle
  const sidebarToggle = document.getElementById('sidebar-toggle');
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }
  
  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchDataTab(tabName);
    });
  });
  
  // Context toggles
  const toggles = {
    'toggle-patient': () => { contextConfig.includePatient = !contextConfig.includePatient; },
    'toggle-vitals': () => { contextConfig.includeVitals = !contextConfig.includeVitals; },
    'toggle-meds': () => { contextConfig.includeMeds = !contextConfig.includeMeds; },
    'toggle-encounters': () => { contextConfig.includeEncounters = !contextConfig.includeEncounters; },
    'toggle-conditions': () => { contextConfig.includeConditions = !contextConfig.includeConditions; },
    'toggle-enhanced': () => { 
      contextConfig.useEnhancedChat = !contextConfig.useEnhancedChat;
      if (contextConfig.useEnhancedChat && smartClientContext) {
        enhancedChat = new EnhancedFHIRChat(OPENAI_API_KEY, smartClientContext, BACKEND_PROXY_URL);
      }
    }
  };
  
  Object.entries(toggles).forEach(([id, handler]) => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('click', () => {
        handler();
        updateDataSourceIndicators();
      });
    }
  });
  
  // Clear chat
  const clearChatBtn = document.getElementById('clear-chat');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      document.getElementById('chat-history').innerHTML = '';
      chatHistory = [];
      if (enhancedChat) enhancedChat.clearConversation();
    });
  }
  
  // Suggested questions
  const suggestedQuestions = document.querySelectorAll('.suggested-question');
  suggestedQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.textContent.trim();
      document.getElementById('chat-input').value = question;
      handleChatSubmit();
    });
  });
}

// --- Chat Integration ---
function setupChat() {
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  
  if (!chatInput || !chatSubmit) return;
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleChatSubmit();
    }
  });
  
  chatSubmit.addEventListener('click', handleChatSubmit);
  
  // Auto-resize textarea
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}

async function handleChatSubmit() {
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  const message = chatInput.value.trim();
  
  if (!message) return;
  
  // Add user message
  addChatMessage('user', message);
  
  // Clear input and show loading
  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatSubmit.disabled = true;
  chatSubmit.innerHTML = '⌛';
  
  try {
    let aiResp;
    
    if (contextConfig.useEnhancedChat && enhancedChat) {
      console.log('Using enhanced chat mode');
      aiResp = await enhancedChat.getChatResponse(message, true);
      addChatMessage('assistant', aiResp.content, aiResp.toolCalls);
    } else {
      // Fallback to original static chat
      aiResp = await getChatResponse({
        chatHistory: [{ role: 'user', content: message }],
        patient: contextConfig.includePatient ? lastPatientData : null,
        vitals: contextConfig.includeVitals ? lastVitalsData : null,
        meds: contextConfig.includeMeds ? lastMedicationsData : null,
        encounters: contextConfig.includeEncounters ? lastEncounterData : null,
        conditions: contextConfig.includeConditions ? lastConditionData : null,
        config: contextConfig,
        openAiKey: OPENAI_API_KEY,
        smartContext: smartClientContext
      });
      addChatMessage('assistant', aiResp.content);
    }
    
  } catch (error) {
    console.error('Chat error:', error);
    addChatMessage('assistant', `**Error:** ${error.message}`);
  } finally {
    chatSubmit.disabled = false;
    chatSubmit.innerHTML = '🔍';
    chatInput.focus();
  }
}

// --- Data Fetchers ---
async function fetchPatientData(client) {
  showLoading(true);
  try {
    const data = await fetchResource({ client, path: `Patient/${client.patient.id}`, backendUrl: BACKEND_PROXY_URL });
    displayPatientSummaryCard(data, client);
    console.log("Patient data loaded");
  } catch (e) {
    displayError(`Failed to fetch patient data: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

async function fetchVitalSigns(client) {
  try {
    const data = await fetchResource({ client, path: 'Observation?category=vital-signs&_sort=-date&_count=20', backendUrl: BACKEND_PROXY_URL });
    lastVitalsData = data;
    displayDataPreview('vitals', data);
    displayFullDataTab('vitals', data);
    console.log("Vitals data loaded");
  } catch (e) {
    console.error(`Failed to fetch vital signs: ${e.message}`, e);
  }
}

async function fetchMedications(client) {
  try {
    const data = await fetchResource({ client, path: 'MedicationRequest?_sort=-authoredon&_count=20', backendUrl: BACKEND_PROXY_URL });
    lastMedicationsData = data;
    displayDataPreview('meds', data);
    displayFullDataTab('meds', data);
    console.log("Medications data loaded");
  } catch (e) {
    console.error(`Failed to fetch medications: ${e.message}`, e);
  }
}

async function fetchEncounters(client) {
  try {
    const data = await fetchResource({ client, path: 'Encounter?_sort=-date&_count=20', backendUrl: BACKEND_PROXY_URL });
    lastEncounterData = data;
    displayDataPreview('encounters', data);
    displayFullDataTab('encounters', data);
    console.log("Encounters data loaded");
  } catch (e) {
    console.error(`Failed to fetch encounters: ${e.message}`, e);
  }
}

async function fetchConditions(client) {
  try {
    const patientReference = `Patient/${client.patient.id}`;
    const data = await fetchResource({ 
      client, 
      path: `Condition?patient=${encodeURIComponent(patientReference)}&_count=20`, 
      backendUrl: BACKEND_PROXY_URL 
    }).catch(async (firstError) => {
      console.warn("First attempt failed:", firstError.message);
      try {
        return await fetchResource({ 
          client, 
          path: `Condition?patient=${encodeURIComponent(patientReference)}&category=problem-list-item&_count=20`, 
          backendUrl: BACKEND_PROXY_URL 
        });
      } catch (secondError) {
        console.warn("Second attempt failed:", secondError.message);
        return await fetchResource({ 
          client, 
          path: `Condition?patient=${encodeURIComponent(patientReference)}&clinical-status=active&_count=20`, 
          backendUrl: BACKEND_PROXY_URL 
        });
      }
    });
    
    lastConditionData = data;
    displayDataPreview('conditions', data);
    displayFullDataTab('conditions', data);
    console.log("Conditions data loaded");
  } catch (e) {
    console.error(`Failed to fetch conditions: ${e.message}`, e);
    lastConditionData = { entry: [] };
    displayDataPreview('conditions', lastConditionData);
    displayFullDataTab('conditions', lastConditionData);
  }
}

// --- Global functions for button actions ---
window.copyMessage = function(button) {
  const messageContent = button.closest('.chat-message').querySelector('.message-content');
  navigator.clipboard.writeText(messageContent.textContent);
  button.innerHTML = '✓';
  setTimeout(() => button.innerHTML = '📋', 1000);
};

window.askFollowUp = function(button) {
  const chatInput = document.getElementById('chat-input');
  chatInput.value = 'Can you elaborate on that? ';
  chatInput.focus();
};

// --- SMART Launch/EHR Auth Logic ---
function isAbsoluteUrl(url) {
  return typeof url === 'string' && (url.includes('://') || url.startsWith('//'));
}

// --- Main Initialization ---
function init() {
  setupUIListeners();
  updateDataSourceIndicators();
  
  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get('launch');
  const iss = params.get('iss');

  if (sessionStorage.getItem('SMART_KEY')) {
    FHIR.oauth2.ready()
      .then(async client => {
        window.smartClient = client;
        smartClientContext = client;
        
        if (contextConfig.useEnhancedChat && OPENAI_API_KEY) {
          enhancedChat = new EnhancedFHIRChat(OPENAI_API_KEY, client, BACKEND_PROXY_URL);
          console.log('Enhanced FHIR chat initialized');
        }
        
        // Load all data
        await fetchPatientData(client);
        await Promise.all([
          fetchVitalSigns(client),
          fetchMedications(client),
          fetchEncounters(client),
          fetchConditions(client)
        ]);
        
        setupChat();
        
        // Show overview tab by default
        switchDataTab('overview');
        
        console.log("All patient data loaded successfully");
      })
      .catch(err => displayError(`SMART init error: ${err.message}`, err));
  } else if (launchToken && iss) {
    if (!isAbsoluteUrl(iss)) {
      displayError(`Invalid 'iss' parameter: ${iss}`);
    } else {
      showLoading(true);
      FHIR.oauth2.authorize({
        client_id: CLIENT_ID,
        scope: 'launch launch/patient patient/*.read observation/*.read medication/*.read encounter/*.read condition/*.read diagnosticreport/*.read openid fhirUser ' +
               'context-user context-fhirUser context-enc_date context-user_ip context-syslogin ' +
               'context-user_timestamp context-workstation_id context-csn context-pat_id',
        redirect_uri: APP_REDIRECT_URI,
        iss,
        launch: launchToken,
      }).catch(err => displayError(`Auth error: ${err.message}`, err));
    }
  } else {
    showLoading(false);
    displayError("This app requires an EHR launch or manual configuration.");
    setupChat();
  }
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', init);