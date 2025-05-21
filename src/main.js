import './style.css';
import FHIR from 'fhirclient';
import { fetchResource } from './fhirClient.js';
import { getChatResponse } from './openaiChat.js';
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
let smartClientContext = null; // Store the SMART client context

// --- UI & Chat State ---
let chatHistory = [];
let contextConfig = { 
  vitalsCount: 3, 
  medsCount: 3, 
  encounterCount: 3,
  conditionCount: 3,
  includePatient: true, 
  includeVitals: true, 
  includeMeds: true,
  includeEncounters: true,
  includeConditions: true
};
let expandedSection = 'patient'; // Default expanded section
let showSettings = false;

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
    
    // Toggle the section collapse/expand
    const headerElement = wrapper.querySelector('.flex.items-center.justify-between');
    const contentElement = wrapper.querySelector(`#${sectionId}-info`);
    const chevronElement = headerElement.querySelector('.text-gray-500');
    
    headerElement.addEventListener('click', () => {
      if (contentElement.style.display === 'none') {
        contentElement.style.display = 'block';
        chevronElement.classList.add('rotate-180');
      } else {
        contentElement.style.display = 'none';
        chevronElement.classList.remove('rotate-180');
      }
    });
  }
}

function displayPatientData(data, clientContext) {
  lastPatientData = data;
  toggleSection('patient');
  const list = document.getElementById('patient-data-list');
  list.innerHTML = '';
  
  const patientInfo = extractPatientInfo(data, clientContext);
  
  const fields = [
    ['Name:', patientInfo.name],
    ['Gender:', patientInfo.gender],
    ['Birth Date:', patientInfo.birthDate],
    ['Patient ID:', patientInfo.patId], // Show PAT_ID instead of FHIR ID
    ['CSN:', patientInfo.csn], // Show CSN
    ['Phone:', patientInfo.phone],
    ['Email:', patientInfo.email],
    ['Address:', patientInfo.address],
  ];

  fields.forEach(([label, value]) => {
    const labelDiv = document.createElement('div');
    labelDiv.className = 'text-gray-500';
    labelDiv.textContent = label;
    
    const valueDiv = document.createElement('div');
    valueDiv.textContent = value;
    
    list.appendChild(labelDiv);
    list.appendChild(valueDiv);
  });
}

function displayVitalSigns(data) {
  lastVitalsData = data;
  toggleSection('vital-signs');
  const element = document.getElementById('vital-signs-data');
  
  if (!data?.entry?.length) {
    element.textContent = data?.total === 0 
      ? "No vital signs found for this patient." 
      : "No vital signs found or an error occurred.";
    return;
  }
  
  const processedVitals = processVitalSigns(data, contextConfig.vitalsCount);
  
  const vitalsHtml = processedVitals.map(vital => {
    if (vital.error) return vital.error;
    
    return `<div class="pb-2 border-b border-gray-100 last:border-0">
      <div class="flex justify-between">
        <span class="font-medium">${vital.name}</span>
        <span class="text-gray-500 text-xs">${vital.date}</span>
      </div>
      <div class="mt-1">
        <span class="font-medium">${vital.value}</span>
      </div>
    </div>`;
  }).join('');
  
  element.innerHTML = vitalsHtml;
}

function displayMedications(data) {
  lastMedicationsData = data;
  toggleSection('medications');
  const container = document.getElementById('medications-container');
  container.innerHTML = '';

  if (!data?.entry?.length) {
    container.textContent = "No medications found for this patient.";
    return;
  }
  
  const processedMeds = processMedications(data, contextConfig.medsCount);
  
  processedMeds.forEach(med => {
    const medItem = document.createElement('div');
    medItem.className = 'med-item';
    
    const medInfo = document.createElement('div');
    
    const medName = document.createElement('div');
    medName.className = 'med-name';
    medName.textContent = med.name;
    
    const medDetails = document.createElement('div');
    medDetails.className = 'med-details';
    medDetails.textContent = med.dosage.formatted;
    
    medInfo.appendChild(medName);
    medInfo.appendChild(medDetails);
    
    const medStatus = document.createElement('span');
    medStatus.className = `med-status ${med.status === 'active' ? 'status-active' : 'status-inactive'}`;
    medStatus.textContent = med.status;
    
    medItem.appendChild(medInfo);
    medItem.appendChild(medStatus);
    container.appendChild(medItem);
  });
}

function displayEncounters(data) {
  lastEncounterData = data;
  toggleSection('encounters');
  const container = document.getElementById('encounters-container');
  container.innerHTML = '';

  if (!data?.entry?.length) {
    container.textContent = "No encounter data found for this patient.";
    return;
  }
  
  const processedEncounters = processEncounters(data, contextConfig.encounterCount);
  
  processedEncounters.forEach(encounter => {
    const encounterItem = document.createElement('div');
    encounterItem.className = 'encounter-item';
    
    const encounterInfo = document.createElement('div');
    
    const encounterType = document.createElement('div');
    encounterType.className = 'encounter-type';
    encounterType.textContent = encounter.type;
    
    const encounterDetails = document.createElement('div');
    encounterDetails.className = 'encounter-details';
    encounterDetails.textContent = `${encounter.period.formatted} | ${encounter.location}`;
    
    encounterInfo.appendChild(encounterType);
    encounterInfo.appendChild(encounterDetails);
    
    const encounterStatus = document.createElement('span');
    encounterStatus.className = `encounter-status ${encounter.status === 'finished' ? 'status-complete' : 'status-active'}`;
    encounterStatus.textContent = encounter.status;
    
    encounterItem.appendChild(encounterInfo);
    encounterItem.appendChild(encounterStatus);
    container.appendChild(encounterItem);
  });
}

function displayConditions(data) {
  lastConditionData = data;
  toggleSection('conditions');
  const container = document.getElementById('conditions-container');
  container.innerHTML = '';

  if (!data?.entry?.length) {
    container.innerHTML = `
      <div class="info-message">
        <p>No problem list items available for this patient.</p>
        <p class="text-xs text-gray-500">
          Problem list data may be restricted or unavailable in your current Epic configuration.
          Ensure "Condition.Read (Problems) (R4)" is enabled in your Epic App Orchard setup.
        </p>
      </div>
    `;
    return;
  }
  
  const processedConditions = processConditions(data, contextConfig.conditionCount);
  
  processedConditions.forEach(condition => {
    const conditionItem = document.createElement('div');
    conditionItem.className = 'condition-item';
    
    const conditionInfo = document.createElement('div');
    
    const conditionName = document.createElement('div');
    conditionName.className = 'condition-name';
    conditionName.textContent = condition.code;
    
    const conditionDetails = document.createElement('div');
    conditionDetails.className = 'condition-details';
    // Include both onset and recorded date if available
    const dateInfo = condition.onsetDate !== 'Unknown' ? 
                    `Onset: ${condition.onsetDate}` : 
                    `Recorded: ${condition.recordedDate}`;
    conditionDetails.textContent = `${dateInfo} | ${condition.category}`;
    
    conditionInfo.appendChild(conditionName);
    conditionInfo.appendChild(conditionDetails);
    
    const conditionStatus = document.createElement('span');
    const isActive = condition.clinicalStatus.toLowerCase().includes('active');
    conditionStatus.className = `condition-status ${isActive ? 'status-active' : 'status-inactive'}`;
    conditionStatus.textContent = condition.clinicalStatus;
    
    conditionItem.appendChild(conditionInfo);
    conditionItem.appendChild(conditionStatus);
    container.appendChild(conditionItem);
  });
}

function displayAuthDetails(client) {
  smartClientContext = client; // Store client context globally
  
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
  
  // Log context information for debugging
  console.log("SMART Client Context:", client);
  if (client?.state?.tokenResponse) {
    console.log("Patient ID:", client.patient?.id);
    console.log("PAT_ID:", client.state.tokenResponse.pat_id);
    console.log("CSN:", client.state.tokenResponse.csn);
  }
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
  
  // Data source toggle handlers - using simple emoji checkboxes
  function updateCheckboxDisplay() {
    const patientCheckbox = document.getElementById('patient-checkbox');
    const vitalsCheckbox = document.getElementById('vitals-checkbox');
    const medsCheckbox = document.getElementById('meds-checkbox');
    const encountersCheckbox = document.getElementById('encounters-checkbox');
    const conditionsCheckbox = document.getElementById('conditions-checkbox');
    
    if (patientCheckbox) patientCheckbox.textContent = contextConfig.includePatient ? '☑️' : '☐';
    if (vitalsCheckbox) vitalsCheckbox.textContent = contextConfig.includeVitals ? '☑️' : '☐';
    if (medsCheckbox) medsCheckbox.textContent = contextConfig.includeMeds ? '☑️' : '☐';
    if (encountersCheckbox) encountersCheckbox.textContent = contextConfig.includeEncounters ? '☑️' : '☐';
    if (conditionsCheckbox) conditionsCheckbox.textContent = contextConfig.includeConditions ? '☑️' : '☐';
  }
  
  const patientToggle = document.getElementById('toggle-patient');
  const vitalsToggle = document.getElementById('toggle-vitals');
  const medsToggle = document.getElementById('toggle-meds');
  const encountersToggle = document.getElementById('toggle-encounters');
  const conditionsToggle = document.getElementById('toggle-conditions');
  
  if (patientToggle) {
    patientToggle.addEventListener('click', () => {
      contextConfig.includePatient = !contextConfig.includePatient;
      updateCheckboxDisplay();
    });
  }
  
  if (vitalsToggle) {
    vitalsToggle.addEventListener('click', () => {
      contextConfig.includeVitals = !contextConfig.includeVitals;
      updateCheckboxDisplay();
    });
  }
  
  if (medsToggle) {
    medsToggle.addEventListener('click', () => {
      contextConfig.includeMeds = !contextConfig.includeMeds;
      updateCheckboxDisplay();
    });
  }
  
  if (encountersToggle) {
    encountersToggle.addEventListener('click', () => {
      contextConfig.includeEncounters = !contextConfig.includeEncounters;
      updateCheckboxDisplay();
    });
  }
  
  if (conditionsToggle) {
    conditionsToggle.addEventListener('click', () => {
      contextConfig.includeConditions = !contextConfig.includeConditions;
      updateCheckboxDisplay();
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
    displayPatientData(data, client);
    console.log("Patient summary:\n", summarizePatient(lastPatientData, client));
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

async function fetchEncounters(client) {
  showLoading(true);
  try {
    const data = await fetchResource({ client, path: 'Encounter?_sort=-date&_count=10', backendUrl: BACKEND_PROXY_URL });
    lastEncounterData = data;
    displayEncounters(data);
    console.log("Encounters summary:\n", summarizeEncounters(lastEncounterData));
  } catch (e) {
    displayError(`Failed to fetch encounters: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

async function fetchConditions(client) {
  showLoading(true);
  try {
    // Based on Epic documentation, we need to use correct path for problem list
    // We'll try several approaches in order of likelihood to work
    
    // 1. First try: Standard FHIR approach with category parameter
    const data = await fetchResource({ 
      client, 
      path: 'Condition?category=problem-list-item&_count=10', 
      backendUrl: BACKEND_PROXY_URL 
    }).catch(async (firstError) => {
      console.warn("First attempt failed:", firstError.message);
      
      // 2. Second try: With explicit system as shown in sample
      try {
        return await fetchResource({ 
          client, 
          path: 'Condition?category=http://terminology.hl7.org/CodeSystem/condition-category|problem-list-item&_count=10', 
          backendUrl: BACKEND_PROXY_URL 
        });
      } catch (secondError) {
        console.warn("Second attempt failed:", secondError.message);
        
        // 3. Third try: Just a basic Condition query
        try {
          return await fetchResource({ 
            client, 
            path: 'Condition?_count=10', 
            backendUrl: BACKEND_PROXY_URL 
          });
        } catch (thirdError) {
          console.warn("Third attempt failed:", thirdError.message);
          
          // 4. Fourth try: Using clinical-status filter
          try {
            return await fetchResource({ 
              client, 
              path: 'Condition?clinical-status=active&_count=10', 
              backendUrl: BACKEND_PROXY_URL 
            });
          } catch (fourthError) {
            console.warn("Fourth attempt failed:", fourthError.message);
            throw firstError; // Re-throw original error if all attempts fail
          }
        }
      }
    });
    
    lastConditionData = data;
    displayConditions(data);
    console.log("Conditions summary:\n", summarizeConditions(lastConditionData));
  } catch (e) {
    console.error(`Failed to fetch problem list: ${e.message}`, e);
    
    // Create an empty conditions bundle instead of showing an error
    lastConditionData = { entry: [] };
    displayConditions(lastConditionData);
    
    // Show a more informative message in console
    console.log("Problem List feature unavailable. This may be due to permissions or API configuration.");
    console.log("Check that 'Condition.Read (Problems) (R4)' is properly configured in your Epic App Orchard setup.");
  } finally {
    showLoading(false);
  }
}

// --- Chat Integration ---
function setupChat() {
  const chatInput = document.getElementById('chat-input');
  const chatSubmit = document.getElementById('chat-submit');
  
  if (!chatInput || !chatSubmit) return;
  
  const handleSubmit = async () => {
    const message = chatInput.value.trim();
    if (!message) return;
    
    chatInput.value = '';
    chatSubmit.innerHTML = '⌛'; // Loading indicator
    
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
        encounters: contextConfig.includeEncounters ? lastEncounterData : null,
        conditions: contextConfig.includeConditions ? lastConditionData : null,
        config: contextConfig,
        openAiKey: OPENAI_API_KEY,
        smartContext: smartClientContext // Pass SMART context to chat
      });
      
      responseText.innerHTML = marked.parse(aiResp.content);
    } catch (error) {
      responseText.textContent = `Error: ${error.message}`;
    } finally {
      chatSubmit.innerHTML = '🔍'; // Reset to search icon
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
  setupUIListeners();
  
  const params = new URLSearchParams(window.location.search);
  const launchToken = params.get('launch');
  const iss = params.get('iss');

  if (sessionStorage.getItem('SMART_KEY')) {
    FHIR.oauth2.ready()
      .then(async client => {
        window.smartClient = client;
        
        // Store client context globally
        smartClientContext = client;
        
        await fetchPatientData(client);
        displayAuthDetails(client);
        displayLaunchTokenData(client);
        if (client.patient?.id) {
          await fetchVitalSigns(client);
          await fetchMedications(client);
          await fetchEncounters(client);
          await fetchConditions(client);
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
        scope: 'launch launch/patient patient/*.read observation/*.read medication/*.read encounter/*.read condition/*.read openid fhirUser ' +
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