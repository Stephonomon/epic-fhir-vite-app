import './style.css';
import FHIR from 'fhirclient';
import { fetchResource } from './fhirClient.js';
import { getChatResponse } from './openaiChat.js';
import { summarizePatient, summarizeVitals, summarizeMeds } from './summarizers.js';
import { marked } from 'marked';

// --- Configuration (unchanged FHIR/OAuth settings) ---
const CLIENT_ID = '023dda75-b5e9-4f99-9c0b-dc5704a04164';
const APP_REDIRECT_URI = window.location.origin + window.location.pathname;
const BACKEND_PROXY_URL = 'https://snp-vite-backend.onrender.com/api/fhir-proxy';
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// --- Chat & Context State ---
let chatHistory = [];
let lastPatientData = null;
let lastVitalsData = null;
let lastMedicationsData = null;

// Default contextConfig
const contextConfig = {
  includePatient: true,
  includeVitals: true,
  vitalsCount: 3,
  includeMeds: true,
  medsCount: 3,
};

// ——————————————————
//  UI: CONTEXT PREVIEW
// ——————————————————
/**
 * Reads the current contextConfig and last*Data, builds the
 * same strings you send to the LLM, and displays them in the preview.
 */
function updateContextPreview() {
  const parts = [];

  if (contextConfig.includePatient && lastPatientData) {
    parts.push(summarizePatient(lastPatientData));
  }
  if (contextConfig.includeVitals && lastVitalsData) {
    parts.push(summarizeVitals(lastVitalsData, contextConfig.vitalsCount));
  }
  if (contextConfig.includeMeds && lastMedicationsData) {
    parts.push(summarizeMeds(lastMedicationsData, contextConfig.medsCount));
  }

  const previewEl = document.getElementById('context-preview');
  previewEl.textContent = parts.length
    ? parts.join('\n\n')
    : 'No context selected or data not yet loaded.';
}

// Wire up the controls to contextConfig and live preview
function setupContextControls() {
  // Patient checkbox
  document
    .getElementById('include-patient')
    .addEventListener('change', e => {
      contextConfig.includePatient = e.target.checked;
      updateContextPreview();
    });

  // Vitals checkbox + slider
  document
    .getElementById('include-vitals')
    .addEventListener('change', e => {
      contextConfig.includeVitals = e.target.checked;
      updateContextPreview();
    });
  document
    .getElementById('vitals-count')
    .addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      contextConfig.vitalsCount = v;
      document.getElementById('vitals-count-label').textContent = v;
      updateContextPreview();
    });

  // Medications checkbox + slider
  document
    .getElementById('include-meds')
    .addEventListener('change', e => {
      contextConfig.includeMeds = e.target.checked;
      updateContextPreview();
    });
  document
    .getElementById('meds-count')
    .addEventListener('input', e => {
      const v = parseInt(e.target.value, 10);
      contextConfig.medsCount = v;
      document.getElementById('meds-count-label').textContent = v;
      updateContextPreview();
    });
}

// ——————————————————
//  UI: CHAT INTEGRATION (unchanged, aside from using contextConfig)
// ——————————————————
function renderChatHistory() {
  const chatDiv = document.getElementById('chat-history');
  chatDiv.innerHTML = chatHistory
    .map(m =>
      m.role === 'user'
        ? `<div><b>You:</b> ${m.content}</div>`
        : `<div><b>AI:</b> ${marked.parse(m.content)}</div>`
    )
    .join('');
}

async function sendChatMessage(msg) {
  // add user message
  chatHistory.push({ role: 'user', content: msg });
  renderChatHistory();

  // show typing indicator
  chatHistory.push({ role: 'assistant', content: '...' });
  renderChatHistory();

  // get AI response (passes contextConfig & last*Data under the hood)
  const aiResp = await getChatResponse({
    chatHistory: chatHistory.filter(m => m.content !== '...'),
    patient: contextConfig.includePatient ? lastPatientData : null,
    vitals: contextConfig.includeVitals ? lastVitalsData : null,
    meds: contextConfig.includeMeds ? lastMedicationsData : null,
    config: contextConfig,
    openAiKey: OPENAI_API_KEY,
  });

  // replace typing indicator with real AI message
  chatHistory.pop();
  chatHistory.push(aiResp);
  renderChatHistory();
}

function setupChat() {
  const chatForm = document.getElementById('chat-form');
  chatForm.onsubmit = async e => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    await sendChatMessage(text);
  };
}

// ——————————————————
//  FHIR DATA FETCHING (unchanged, but now calls updateContextPreview())
// ——————————————————
async function fetchPatientData(client) {
  try {
    const data = await fetchResource({
      client,
      path: `Patient/${client.patient.id}`,
      backendUrl: BACKEND_PROXY_URL,
    });
    lastPatientData = data;
    displayPatientData(data);
    console.log('Patient summary:\n', summarizePatient(data));
    updateContextPreview();
  } catch (e) {
    displayError(`Failed to fetch patient data: ${e.message}`, e);
  }
}

async function fetchVitalSigns(client) {
  try {
    const data = await fetchResource({
      client,
      path: 'Observation?category=vital-signs&_sort=-date&_count=10',
      backendUrl: BACKEND_PROXY_URL,
    });
    lastVitalsData = data;
    displayVitalSigns(data);
    console.log('Vitals summary:\n', summarizeVitals(data));
    updateContextPreview();
  } catch (e) {
    displayError(`Failed to fetch vital signs: ${e.message}`, e);
  }
}

async function fetchMedications(client) {
  try {
    const data = await fetchResource({
      client,
      path: 'MedicationRequest?_sort=-authoredon&_count=10',
      backendUrl: BACKEND_PROXY_URL,
    });
    lastMedicationsData = data;
    displayMedications(data);
    console.log('Meds summary:\n', summarizeMeds(data));
    updateContextPreview();
  } catch (e) {
    displayError(`Failed to fetch medications: ${e.message}`, e);
  }
}

// ——————————————————
//  APP INITIALIZATION
// ——————————————————
function initSmartApp() {
  setupContextControls();  // wire up the new UI
  FHIR.oauth2.ready()
    .then(async client => {
      window.smartClient = client;
      await fetchPatientData(client);
      await fetchVitalSigns(client);
      await fetchMedications(client);
      addFetchButtons(client);
      setupChat();
    })
    .catch(err => displayError(`SMART init error: ${err.message}`, err));
}

const params = new URLSearchParams(window.location.search);
if (sessionStorage.getItem('SMART_KEY')) {
  initSmartApp();
} else if (params.get('launch') && params.get('iss')) {
  FHIR.oauth2.authorize({ /* unchanged */ });
} else {
  displayError('This app requires an EHR launch or manual configuration.');
}
