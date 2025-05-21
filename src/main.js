import './style.css';
import FHIR from 'fhirclient';
import { fetchResource } from './fhirClient.js';
import { getChatResponse } from './openaiChat.js';
import { summarizePatient, summarizeVitals, summarizeMeds } from './summarizers.js';
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

// --- UI & Chat State ---
let chatHistory = [];
let contextConfig = { 
  vitalsCount: 3, 
  medsCount: 3, 
  includePatient: true, 
  includeVitals: true, 
  includeMeds: true 
};
let expandedSection = 'patient'; // Default expanded section
let showSettings = false;

// --- Initialize Lucide Icons ---
function initializeIcons() {
  // Header icons
  lucide.createIcons({
    icons: {
      'message-square-icon': lucide.icons.messageSquare,
      'settings-icon': lucide.icons.settings,
      'patient-checkbox': lucide.icons.checkSquare,
      'vitals-checkbox': lucide.icons.checkSquare,
      'meds-checkbox': lucide.icons.checkSquare,
      'user-icon': lucide.icons.user,
      'file-icon': lucide.icons.file,
      'pill-icon': lucide.icons.pill,
      'patient-section-icon': lucide.icons.user,
      'vitals-section-icon': lucide.icons.file,
      'medications-section-icon': lucide.icons.pill,
      'patient-chevron': lucide.icons.chevronDown,
      'vitals-chevron': lucide.icons.chevronDown,
      'medications-chevron': lucide.icons.chevronDown,
      'response-icon': lucide.icons.messageSquare,
      'clear-icon': lucide.icons.x,
      'submit-icon': lucide.icons.search,
      'clipboard-icon': lucide.icons.clipboard,
      'user-summary-icon': lucide.icons.user
    }
  });
}

// --- UI Helper Functions ---
function showLoading(isLoading) {
  const loadingElement = document.getElementById('loading');
  if (loadingElement) {
    loadingElement.style.display = isLoading ? 'block' : 'none';
  }
}

function toggleSection(sectionId) {
  const wrapper = document.getElementById(`${sectionId}-info-wrapper`);
  if (wrapper) {
    wrapper.style.display = 'block';
    
    // Toggle the chevron icon when clicking section header
    const headerElement = wrapper.querySelector('.flex.items-center.justify-between');
    if (headerElement) {
      headerElement.addEventListener('click', () => {
        const sectionContent = wrapper.querySelector(`#${sectionId}-info`);
        const chevron = wrapper.querySelector(`#${sectionId}-chevron`);
        
        if (sectionContent.style.display === 'none') {
          sectionContent.style.display = 'block';
          chevron.classList.add('rotate-180');
          expandedSection = sectionId;
        } else {
          sectionContent.style.display = 'none';
          chevron.classList.remove('rotate-180');
          expandedSection = null;
        }
      });
    }
  }
}

function displayPatientData(data) {
  lastPatientData = data;
  toggleSection('patient');
  const list = document.getElementById('patient-data-list');
  list.innerHTML = '';

  const name = data.name?.[0]?.text || `${data.name?.[0]?.given?.join(' ')} ${data.name?.[0]?.family}`;
  const phone = data.telecom?.find(t => t.system === 'phone')?.value;
  const email = data.telecom?.find(t => t.system === 'email')?.value;
  const addr = data.address?.[0];
  const address = addr
    ? `${addr.line?.join(' ')} ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}`
    : '';

  const fields = [
    ['Name:', name],
    ['Gender:', data.gender],
    ['Birth Date:', data.birthDate],
    ['ID:', data.id],
    ['Phone:', phone],
    ['Email:', email],
    ['Address:', address],
  ];

  fields.forEach(([label, value]) => {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'text-gray-500';
    labelDiv.textContent = label;
    
    const valueDiv = document.createElement('div');
    valueDiv.textContent = value || 'N/A';
    
    list.appendChild(labelDiv);
    list.appendChild(valueDiv);
  });
}

function displayVitalSigns(data) {
  lastVitalsData = data;
  toggleSection('vital-signs');
  const element = document.getElementById('vital-signs-data');
  let text = "No vital signs found or an error occurred.";

  if (data?.entry?.length) {
    const vitalsHtml = data.entry.slice(0, contextConfig.vitalsCount).map(entry => {
      const r = entry.resource;
      if (!r) return "Malformed entry: no resource found";
      
      let vitalName = r.code?.text || r.code?.coding?.[0]?.display || "Unknown Vital";
      let valueText = '';
      let dateText = '';
      
      if (r.valueQuantity) {
        valueText = `${r.valueQuantity.value} ${r.valueQuantity.unit||''}`;
      } else if (r.component?.length) {
        valueText = r.component.map(c => {
          const lab = c.code?.text || c.code?.coding?.[0]?.display || "Component";
          const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit||''}` : 'N/A';
          return `${lab}: ${val}`;
        }).join('; ');
      } else {
        valueText = "N/A";
      }
      
      if (r.effectiveDateTime) {
        dateText = new Date(r.effectiveDateTime).toLocaleDateString();
      }
      
      return `<div class="pb-2 border-b border-gray-100 last:border-0">
        <div class="flex justify-between">
          <span class="font-medium">${vitalName}</span>
          <span class="text-gray-500 text-xs">${dateText}</span>
        </div>
        <div class="mt-1">
          <span class="font-medium">${valueText}</span>
        </div>
      </div>`;
    }).join('');
    
    element.innerHTML = vitalsHtml;
  } else if (data?.total === 0) {
    element.textContent = "No vital signs found for this patient.";
  } else {
    element.textContent = text;
  }
}

function displayMedications(data) {
  lastMedicationsData = data;
  toggleSection('medications');
  const container = document.getElementById('medications-container');
  container.innerHTML = '';

  const entries = (data.entry || []).slice(0, contextConfig.medsCount).sort((a, b) => {
    const da = a.resource.authoredOn ? new Date(a.resource.authoredOn) : 0;
    const db = b.resource.authoredOn ? new Date(b.resource.authoredOn) : 0;
    return db - da;
  });

  entries.forEach(({ resource }) => {
    const medItem = document.createElement('div');
    medItem.className = 'med-item';
    
    const medInfo = document.createElement('div');
    
    const medName = document.createElement('div');
    medName.className = 'med-name';
    medName.textContent = resource.medicationCodeableConcept?.text || resource.medicationReference?.display || 'Unknown';
    
    const medDetails = document.createElement('div');
    medDetails.className = 'med-details';
    const dose = resource.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value || '';
    const unit = resource.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.unit || '';
    const frequency = resource.dosageInstruction?.[0]?.timing?.code?.text || '';
    medDetails.textContent = `${dose}${unit} - ${frequency}`;
    
    medInfo.appendChild(medName);
    medInfo.appendChild(medDetails);
    
    const medStatus = document.createElement('span');
    medStatus.className = `med-status ${resource.status === 'active' ? 'status-active' : 'status-inactive'}`;
    medStatus.textContent = resource.status || 'N/A';
    
    medItem.appendChild(medInfo);
    medItem.appendChild(medStatus);
    container.appendChild(medItem);
  });
}

function displayAuthDetails(client) {
  const accessEl = document.getElementById('access-token-display');
  const patientEl = document.getElementById('patient-id-display');
  const serverEl = document.getElementById('fhir-server-display');
  const tokenEl = document.getElementById('token-response-display');

  if (accessEl) {
    const tok = client?.state?.tokenResponse?.access_token;
    accessEl.textContent = tok ? tok.substring(0, 30) + '...' : 'N/A';
  }
  if (patientEl) patientEl.textContent = client?.patient?.id || 'N/A';
  if (serverEl) serverEl.textContent = client?.state?.serverUrl || 'N/A';
  if (tokenEl) tokenEl.textContent = client?.state?.tokenResponse
    ? JSON.stringify(client.state.tokenResponse, null, 2)
    : 'No token response available.';
}

function displayLaunchTokenData(client) {
  const jsonEl = document.getElementById('launch-token-json');
  const token = client?.state?.tokenResponse;
  if (!token) return;

  const filtered = {};
  Object.keys(token).forEach(key => {
    if (!['access_token','token_type','expires_in','scope','id_token'].includes(key)) {
      filtered[key] = token[key];
    }
  });
  if (Object.keys(filtered).length) {
    jsonEl.textContent = JSON.stringify(filtered, null, 2);
  }
}

function displayError(message, errorObj = null) {
  showLoading(false);
  const errWrapper = document.getElementById('error-info-wrapper');
  const errEl = document.getElementById('error-info');
  if (errEl && errWrapper) {
    errWrapper.style.display = 'block';
    errEl.textContent = message + (errorObj ? `
Details: ${errorObj.stack||errorObj}` : '');
  }
  console.error(message, errorObj);
}

// --- Setup UI Event Listeners ---
function setupUIListeners() {
  // Settings toggle
  const settingsBtn = document.getElementById('settings-btn');
  const settingsPanel = document.getElementById('settings-panel');
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', () => {
      showSettings = !showSettings;
      settingsPanel.style.display = showSettings ? 'block' : 'none';
    });
  }
  
  // Data source toggle handlers
  const patientToggle = document.getElementById('toggle-patient');
  const vitalsToggle = document.getElementById('toggle-vitals');
  const medsToggle = document.getElementById('toggle-meds');
  
  if (patientToggle) {
    patientToggle.addEventListener('click', () => {
      contextConfig.includePatient = !contextConfig.includePatient;
      const checkbox = document.getElementById('patient-checkbox');
      if (checkbox) {
        checkbox.innerHTML = contextConfig.includePatient ? 
          lucide.icons.checkSquare.toSvg() : 
          lucide.icons.square.toSvg();
      }
    });
  }
  
  if (vitalsToggle) {
    vitalsToggle.addEventListener('click', () => {
      contextConfig.includeVitals = !contextConfig.includeVitals;
      const checkbox = document.getElementById('vitals-checkbox');
      if (checkbox) {
        checkbox.innerHTML = contextConfig.includeVitals ? 
          lucide.icons.checkSquare.toSvg() : 
          lucide.icons.square.toSvg();
      }
    });
  }
  
  if (medsToggle) {
    medsToggle.addEventListener('click', () => {
      contextConfig.includeMeds = !contextConfig.includeMeds;
      const checkbox = document.getElementById('meds-checkbox');
      if (checkbox) {
        checkbox.innerHTML = contextConfig.includeMeds ? 
          lucide.icons.checkSquare.toSvg() : 
          lucide.icons.square.toSvg();
      }
    });
  }
  
  // Clear response button
  const clearResponseBtn = document.getElementById('clear-response');
  if (clearResponseBtn) {
    clearResponseBtn.addEventListener('click', () => {
      const responseArea = document.getElementById('chat-response');
      if (responseArea) responseArea.style.display = 'none';
    });
  }
}

// --- Data Fetchers ---
async function fetchPatientData(client) {
  showLoading(true);
  try {
    const data = await fetchResource({ client, path: `Patient/${client.patient.id}`, backendUrl: BACKEND_PROXY_URL });
    lastPatientData = data;
    displayPatientData(data);
    console.log("Patient summary:\n", summarizePatient(lastPatientData));
  } catch (e) {
    displayError(`Failed to fetch patient data: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

async function fetchVitalSigns(client) {
  showLoading(true);
  try {
    const data = await fetchResource({ client, path: 'Observation?category=vital-signs&_sort=-date&_count=10', backendUrl: BACKEND_PROXY_URL });
    lastVitalsData = data;
    displayVitalSigns(data);
    console.log("Vitals summary:\n", summarizeVitals(lastVitalsData));
  } catch (e) {
    displayError(`Failed to fetch vital signs: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

async function fetchMedications(client) {
  showLoading(true);
  try {
    const data = await fetchResource({ client, path: 'MedicationRequest?_sort=-authoredon&_count=10', backendUrl: BACKEND_PROXY_URL });
    lastMedicationsData = data;
    displayMedications(data);
    console.log("Meds summary:\n", summarizeMeds(lastMedicationsData));
  } catch (e) {
    displayError(`Failed to fetch medications: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

// --- Chat Integration ---
function setupChat() {
  const chatForm = document.querySelector('.flex.items-center.relative');
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  
  if (!chatForm || !chatInput || !chatSubmit) return;
  
  const handleSubmit = async () => {
    const message = chatInput.value.trim();
    if (!message) return;
    
    chatInput.value = '';
    chatSubmit.innerHTML = lucide.icons.refreshCw.toSvg({ 'class': 'animate-spin' });
    
    // Show typing indicator
    const responseArea = document.getElementById('chat-response');
    const responseText = document.getElementById('chat-response-text');
    responseArea.style.display = 'block';
    responseText.textContent = 'Thinking...';
    
    try {
      const aiResp = await getChatResponse({
        chatHistory: [{ role: 'user', content: message }],
        patient: contextConfig.includePatient ? lastPatientData : null,
        vitals: contextConfig.includeVitals ? lastVitalsData : null,
        meds: contextConfig.includeMeds ? lastMedicationsData : null,
        config: contextConfig,
        openAiKey: OPENAI_API_KEY
      });
      
      responseText.innerHTML = marked.parse(aiResp.content);
    } catch (error) {
      responseText.textContent = `Error: ${error.message}`;
    } finally {
      chatSubmit.innerHTML = lucide.icons.search.toSvg();
    }
  };
  
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  });
  
  chatSubmit.addEventListener('click', handleSubmit);
  
  // Adjust textarea height as content grows
  chatInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight < 150) ? this.scrollHeight + 'px' : '150px';
  });
}

// --- SMART Launch/EHR Auth Logic ---
function isAbsoluteUrl(url) {
  return typeof url === 'string' && (url.includes('://') || url.startsWith('//'));
}

// --- Main Initialization ---
function init() {
  initializeIcons();
  setupUIListeners();
  
  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get('launch');
  const iss = params.get('iss');

  if (sessionStorage.getItem('SMART_KEY')) {
    FHIR.oauth2.ready()
      .then(async client => {
        window.smartClient = client;
        await fetchPatientData(client);
        displayAuthDetails(client);
        displayLaunchTokenData(client);
        if (client.patient?.id) {
          await fetchVitalSigns(client);
          await fetchMedications(client);
        }
        setupChat();
      })
      .catch(err => displayError(`SMART init error: ${err.message}`, err));
  } else if (launchToken && iss) {
    if (!isAbsoluteUrl(iss)) {
      displayError(`Invalid 'iss' parameter: ${iss}`);
    } else {
      showLoading(true);
      FHIR.oauth2.authorize({
        client_id: CLIENT_ID,
        scope: 'launch launch/patient patient/*.read observation/*.read openid fhirUser context-user context-fhirUser context-enc_date context-user_ip context-syslogin context-user_timestamp context-workstation_id',
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