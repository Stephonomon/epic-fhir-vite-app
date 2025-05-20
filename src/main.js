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
let contextConfig = { vitalsCount: 3, medsCount: 3, includePatient: true, includeVitals: true, includeMeds: true };

// --- UI Helper Functions ---
function showLoading(isLoading, section = 'loading') {
  const loadingElement = document.getElementById(section);
  if (loadingElement) {
    loadingElement.style.display = isLoading ? 'block' : 'none';
  }
}

function toggleSection(sectionId, show) {
  const wrapper = document.getElementById(`${sectionId}-wrapper`);
  if (wrapper) wrapper.style.display = show ? 'block' : 'none';
}

// --- Display Functions: Render Summarizers Markdown ---
function displayPatientData(data) {
  lastPatientData = data;
  const container = document.getElementById('patient-info-markdown');
  if (container) container.innerHTML = marked.parse(summarizePatient(data));
}

function displayVitalSigns(data) {
  lastVitalsData = data;
  const container = document.getElementById('vitals-info-markdown');
  if (container) container.innerHTML = marked.parse(summarizeVitals(data));
}

function displayMedications(data) {
  lastMedicationsData = data;
  const container = document.getElementById('medications-markdown');
  if (container) container.innerHTML = marked.parse(summarizeMeds(data));
}

// --- Other unchanged helpers (auth, launch data, error, etc) ---
function displayAuthDetails(client) { /* ... unchanged ... */ }
function displayLaunchTokenData(client) { /* ... unchanged ... */ }
function displayError(message, errorObj = null) { /* ... unchanged ... */ }

// --- Data Fetchers (use fetchResource, unchanged) ---
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

// --- Fetch Buttons (unchanged, but make sure IDs match your containers) ---
function addFetchButtons(client) {
  const appDiv = document.getElementById('app');
  if (!document.getElementById('fetch-btns-row')) {
    const fetchBtnDiv = document.createElement('div');
    fetchBtnDiv.id = 'fetch-btns-row';
    fetchBtnDiv.style.margin = "1em 0";
    fetchBtnDiv.innerHTML = `
      <button id="fetch-patient-btn">Fetch Patient</button>
      <button id="fetch-vitals-btn">Fetch Vitals</button>
      <button id="fetch-meds-btn">Fetch Medications</button>
    `;
    appDiv.insertBefore(fetchBtnDiv, appDiv.children[1]);
    document.getElementById('fetch-patient-btn').onclick = () => fetchPatientData(client);
    document.getElementById('fetch-vitals-btn').onclick = () => fetchVitalSigns(client);
    document.getElementById('fetch-meds-btn').onclick = () => fetchMedications(client);
  }
}

// --- Chat Integration ---
function renderChatHistory() {
  const chatDiv = document.getElementById('chat-history');
  if (!chatDiv) return;
  chatDiv.innerHTML = chatHistory.map(m => {
    if (m.role === 'user') {
      return `<div style="margin-bottom:6px;"><b>You:</b> ${m.content}</div>`;
    } else {
      // Safely render AI response as Markdown
      return `<div style="margin-bottom:6px;"><b>AI:</b> ${marked.parse(m.content)}</div>`;
    }
  }).join('');
}
async function sendChatMessage(msg) {
  chatHistory.push({ role: 'user', content: msg });
  renderChatHistory();
  chatHistory.push({ role: 'assistant', content: '...' });
  renderChatHistory();
  const aiResp = await getChatResponse({
    chatHistory: chatHistory.filter(m => m.role !== 'assistant' || m.content !== '...'),
    patient: contextConfig.includePatient ? lastPatientData : null,
    vitals: contextConfig.includeVitals ? lastVitalsData : null,
    meds: contextConfig.includeMeds ? lastMedicationsData : null,
    config: contextConfig,
    openAiKey: OPENAI_API_KEY
  });
  chatHistory.pop();
  chatHistory.push(aiResp);
  renderChatHistory();
}
function setupChat() {
  const chatForm = document.getElementById('chat-form');
  if (!chatForm) return;
  renderChatHistory();
  chatForm.onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;
    input.value = '';
    await sendChatMessage(msg);
  };
}

// --- SMART Launch/EHR Auth Logic (unchanged) ---
function isAbsoluteUrl(url) { /* unchanged */ }
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
      addFetchButtons(client);
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
