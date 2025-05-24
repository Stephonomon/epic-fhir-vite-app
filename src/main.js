// src/main.js - Streamlined layout with data validation sidebar
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
  vitalsCount: 10, 
  medsCount: 10, 
  encounterCount: 10,
  conditionCount: 10,
  includePatient: true, 
  includeVitals: true, 
  includeMeds: true,
  includeEncounters: true,
  includeConditions: true,
  useEnhancedChat: true
};

let chatHistory = [];
let searchHistory = []; // Track FHIR searches for data inspector
let rawDataCache = {}; // Cache raw FHIR responses

// --- UI Helper Functions ---
function showLoading(isLoading) {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = isLoading ? 'flex' : 'none';
  }
}

function toggleSettings() {
  const settingsPanel = document.getElementById('settings-panel');
  const isVisible = settingsPanel.style.display === 'block';
  settingsPanel.style.display = isVisible ? 'none' : 'block';
  
  // Close data inspector if open
  if (!isVisible) {
    document.getElementById('data-inspector').style.display = 'none';
  }
}

function toggleDataInspector() {
  const inspector = document.getElementById('data-inspector');
  const settings = document.getElementById('settings-panel');
  const isVisible = inspector.style.display === 'block';
  
  inspector.style.display = isVisible ? 'none' : 'block';
  
  // Close settings if open
  if (!isVisible) {
    settings.style.display = 'none';
  }
}

function updateContextIndicators() {
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
      indicator.className = `context-indicator ${enabled ? 'enabled' : 'disabled'}`;
    }
  });
}

function displayPatientHeaderInfo(data, clientContext) {
  lastPatientData = data;
  const patientInfo = extractPatientInfo(data, clientContext);
  
  // Update header patient info
  document.getElementById('patient-summary-header').querySelector('.patient-name').textContent = patientInfo.name;
  document.getElementById('patient-age-gender').textContent = `${calculateAge(patientInfo.birthDate)} / ${patientInfo.gender}`;
  document.getElementById('patient-mrn').textContent = `PAT ID: ${patientInfo.patId}`;
  document.getElementById('patient-csn').textContent = `CSN: ${patientInfo.csn}`;
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

function addChatMessage(role, content, toolCalls = []) {
  const chatContainer = document.getElementById('chat-history');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${role}`;
  
  const timestamp = new Date().toLocaleTimeString();
  
  let toolInfo = '';
  if (toolCalls && toolCalls.length > 0) {
    const tools = toolCalls.map(call => call.function).join(', ');
    toolInfo = `<div class="tool-usage">🔍 Searched: ${tools}</div>`;
    
    // Add to search history for data inspector
    toolCalls.forEach(call => {
      addToSearchHistory(call.function, call.parameters || {});
    });
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

function addToSearchHistory(functionName, parameters) {
  const timestamp = new Date().toLocaleTimeString();
  const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const searchEntry = {
    id: searchId,
    timestamp,
    function: functionName,
    parameters,
    status: 'pending'
  };
  
  searchHistory.unshift(searchEntry); // Add to beginning
  updateSearchHistoryDisplay();
  
  return searchId;
}

function updateSearchHistoryDisplay() {
  const historyContainer = document.getElementById('search-history');
  
  if (searchHistory.length === 0) {
    historyContainer.innerHTML = '<div class="no-searches">No searches yet. Ask the AI a question to see FHIR queries here.</div>';
    return;
  }
  
  historyContainer.innerHTML = searchHistory.slice(0, 10).map(search => `
    <div class="search-entry ${search.status}" data-search-id="${search.id}">
      <div class="search-header">
        <span class="search-function">${search.function}</span>
        <span class="search-time">${search.timestamp}</span>
      </div>
      <div class="search-params">${Object.keys(search.parameters).length ? 
        Object.entries(search.parameters).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ') : 
        'No parameters'}</div>
      <div class="search-status">${search.status}</div>
    </div>
  `).join('');
  
  // Update data viewer dropdown
  updateDataViewerOptions();
}

function updateDataViewerOptions() {
  const select = document.getElementById('data-viewer-select');
  const completedSearches = searchHistory.filter(s => s.status === 'completed');
  
  select.innerHTML = '<option value="">Select a search result to view</option>';
  
  completedSearches.forEach(search => {
    const option = document.createElement('option');
    option.value = search.id;
    option.textContent = `${search.function} (${search.timestamp})`;
    select.appendChild(option);
  });
}

function showRawData(searchId) {
  const rawDataViewer = document.getElementById('raw-data-viewer');
  const search = searchHistory.find(s => s.id === searchId);
  const rawData = rawDataCache[searchId];
  
  if (!search || !rawData) {
    rawDataViewer.innerHTML = '<div class="no-data">No data available for this search</div>';
    return;
  }
  
  rawDataViewer.innerHTML = `
    <div class="raw-data-header">
      <h5>${search.function}</h5>
      <div class="data-meta">
        <span>Time: ${search.timestamp}</span>
        <span>Entries: ${rawData.entry?.length || 0}</span>
        <span>Total: ${rawData.total || 'Unknown'}</span>
      </div>
    </div>
    <pre class="json-viewer">${JSON.stringify(rawData, null, 2)}</pre>
  `;
}

function displayError(message, errorObj = null) {
  showLoading(false);
  addChatMessage('assistant', `**Error:** ${message}${errorObj ? `\n\nDetails: ${errorObj.message}` : ''}`);
  console.error(message, errorObj);
}

// --- Setup UI Event Listeners ---
function setupUIListeners() {
  // Settings toggle
  const settingsToggle = document.getElementById('settings-toggle');
  if (settingsToggle) {
    settingsToggle.addEventListener('click', toggleSettings);
  }
  
  // Data inspector toggle
  const inspectorToggle = document.getElementById('data-inspector-toggle');
  if (inspectorToggle) {
    inspectorToggle.addEventListener('click', toggleDataInspector);
  }
  
  // Inspector close button
  const inspectorClose = document.getElementById('inspector-close');
  if (inspectorClose) {
    inspectorClose.addEventListener('click', () => {
      document.getElementById('data-inspector').style.display = 'none';
    });
  }
  
  // Context toggles (checkboxes)
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
      element.addEventListener('change', () => {
        handler();
        updateContextIndicators();
      });
    }
  });
  
  // Clear chat
  const clearChatBtn = document.getElementById('clear-chat');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => {
      document.getElementById('chat-history').innerHTML = '';
      chatHistory = [];
      searchHistory = [];
      rawDataCache = {};
      updateSearchHistoryDisplay();
      if (enhancedChat) enhancedChat.clearConversation();
      
      // Add welcome message back
      addWelcomeMessage();
    });
  }
  
  // Export chat
  const exportChatBtn = document.getElementById('export-chat');
  if (exportChatBtn) {
    exportChatBtn.addEventListener('click', exportChatHistory);
  }
  
  // Data viewer dropdown
  const dataViewerSelect = document.getElementById('data-viewer-select');
  if (dataViewerSelect) {
    dataViewerSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        showRawData(e.target.value);
      }
    });
  }
  
  // Copy raw data button
  const copyRawDataBtn = document.getElementById('copy-raw-data');
  if (copyRawDataBtn) {
    copyRawDataBtn.addEventListener('click', () => {
      const searchId = document.getElementById('data-viewer-select').value;
      if (searchId && rawDataCache[searchId]) {
        navigator.clipboard.writeText(JSON.stringify(rawDataCache[searchId], null, 2));
        copyRawDataBtn.innerHTML = '✓';
        setTimeout(() => copyRawDataBtn.innerHTML = '📋', 1000);
      }
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
  
  // Close dropdowns when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#settings-panel') && !e.target.closest('#settings-toggle')) {
      document.getElementById('settings-panel').style.display = 'none';
    }
  });
}

function addWelcomeMessage() {
  const welcomeHTML = `
    <div class="welcome-message">
      <div class="welcome-header">
        <span class="icon">🤖</span>
        <h3>Welcome to EHR Assistant</h3>
      </div>
      <p>I can help you analyze patient data, answer questions about medications, vitals, conditions, and more. Ask me anything about this patient!</p>
      <div class="quick-start">
        <div class="suggested-questions">
          <button class="suggested-question">What are the most recent vital signs?</button>
          <button class="suggested-question">Show me all active medications</button>
          <button class="suggested-question">What problems are currently active?</button>
          <button class="suggested-question">Summarize recent visits</button>
          <button class="suggested-question">Are there any concerning trends?</button>
          <button class="suggested-question">Show lab results from the last year</button>
        </div>
      </div>
    </div>
  `;
  
  document.getElementById('chat-history').innerHTML = welcomeHTML;
  
  // Re-attach event listeners for suggested questions
  const suggestedQuestions = document.querySelectorAll('.suggested-question');
  suggestedQuestions.forEach(btn => {
    btn.addEventListener('click', () => {
      const question = btn.textContent.trim();
      document.getElementById('chat-input').value = question;
      handleChatSubmit();
    });
  });
}

function exportChatHistory() {
  const exportData = {
    patient: lastPatientData ? extractPatientInfo(lastPatientData, smartClientContext) : null,
    chatHistory: chatHistory,
    searchHistory: searchHistory,
    timestamp: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ehr-assistant-chat-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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
      
      // Patch the enhanced chat to capture search data
      const originalExecuteTool = enhancedChat.fhirTools.executeTool.bind(enhancedChat.fhirTools);
      enhancedChat.fhirTools.executeTool = async function(toolName, parameters) {
        const searchId = addToSearchHistory(toolName, parameters);
        
        try {
          const result = await originalExecuteTool(toolName, parameters);
          
          // Cache the raw data
          rawDataCache[searchId] = result;
          
          // Update search status
          const searchEntry = searchHistory.find(s => s.id === searchId);
          if (searchEntry) {
            searchEntry.status = 'completed';
            searchEntry.resultCount = result.count || result.observations?.length || result.medications?.length || result.encounters?.length || result.conditions?.length || result.reports?.length || 0;
          }
          
          updateSearchHistoryDisplay();
          return result;
        } catch (error) {
          // Update search status on error
          const searchEntry = searchHistory.find(s => s.id === searchId);
          if (searchEntry) {
            searchEntry.status = 'error';
            searchEntry.error = error.message;
          }
          updateSearchHistoryDisplay();
          throw error;
        }
      };
      
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
    displayPatientHeaderInfo(data, client);
    console.log("Patient data loaded");
  } catch (e) {
    displayError(`Failed to fetch patient data: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

async function fetchVitalSigns(client) {
  try {
    const data = await fetchResource({ client, path: 'Observation?category=vital-signs&_sort=-date&_count=50', backendUrl: BACKEND_PROXY_URL });
    lastVitalsData = data;
    console.log("Vitals data loaded:", data?.entry?.length || 0, "entries");
  } catch (e) {
    console.error(`Failed to fetch vital signs: ${e.message}`, e);
  }
}

async function fetchMedications(client) {
  try {
    const data = await fetchResource({ client, path: 'MedicationRequest?_sort=-authoredon&_count=50', backendUrl: BACKEND_PROXY_URL });
    lastMedicationsData = data;
    console.log("Medications data loaded:", data?.entry?.length || 0, "entries");
  } catch (e) {
    console.error(`Failed to fetch medications: ${e.message}`, e);
  }
}

async function fetchEncounters(client) {
  try {
    const data = await fetchResource({ client, path: 'Encounter?_sort=-date&_count=50', backendUrl: BACKEND_PROXY_URL });
    lastEncounterData = data;
    console.log("Encounters data loaded:", data?.entry?.length || 0, "entries");
  } catch (e) {
    console.error(`Failed to fetch encounters: ${e.message}`, e);
  }
}

async function fetchConditions(client) {
  try {
    const patientReference = `Patient/${client.patient.id}`;
    const data = await fetchResource({ 
      client, 
      path: `Condition?patient=${encodeURIComponent(patientReference)}&_count=50`, 
      backendUrl: BACKEND_PROXY_URL 
    }).catch(async (firstError) => {
      console.warn("First attempt failed:", firstError.message);
      try {
        return await fetchResource({ 
          client, 
          path: `Condition?patient=${encodeURIComponent(patientReference)}&category=problem-list-item&_count=50`, 
          backendUrl: BACKEND_PROXY_URL 
        });
      } catch (secondError) {
        console.warn("Second attempt failed:", secondError.message);
        return await fetchResource({ 
          client, 
          path: `Condition?patient=${encodeURIComponent(patientReference)}&clinical-status=active&_count=50`, 
          backendUrl: BACKEND_PROXY_URL 
        });
      }
    });
    
    lastConditionData = data;
    console.log("Conditions data loaded:", data?.entry?.length || 0, "entries");
  } catch (e) {
    console.error(`Failed to fetch conditions: ${e.message}`, e);
    lastConditionData = { entry: [] };
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
  updateContextIndicators();
  addWelcomeMessage();
  
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
        
        // Load all data in background
        await fetchPatientData(client);
        await Promise.all([
          fetchVitalSigns(client),
          fetchMedications(client),
          fetchEncounters(client),
          fetchConditions(client)
        ]);
        
        setupChat();
        
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