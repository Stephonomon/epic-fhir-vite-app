import './style.css';
import { smartReady, fetchPatient, fetchVitals, fetchMedications } from './fhirClient.js';
import { getChatResponse } from './openaiChat.js';

// --- Config (env)
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

// --- App State ---
let client = null;
let patientData = null;
let vitalsData = null;
let medsData = null;
let chatHistory = [];
let contextConfig = { vitalsCount: 3, medsCount: 3, includePatient: true, includeVitals: true, includeMeds: true };

// --- UI helpers (render, show/hide) ---
function showLoading(isLoading, section = 'loading') {
  const el = document.getElementById(section);
  if (el) el.style.display = isLoading ? 'block' : 'none';
}
function renderList(elementId, items) {
  const el = document.getElementById(elementId);
  el.innerHTML = '';
  items.forEach(txt => {
    const li = document.createElement('li');
    li.textContent = txt;
    el.appendChild(li);
  });
}
function renderChatHistory() {
  const chatDiv = document.getElementById('chat-history');
  if (!chatDiv) return;
  chatDiv.innerHTML = chatHistory.map(
    m => `<div style="margin-bottom:6px;"><b>${m.role === 'user' ? 'You' : 'AI'}:</b> ${m.content}</div>`
  ).join('');
}

// --- Fetch and Display Data ---
async function handleFetchPatient() {
  showLoading(true);
  try {
    patientData = await fetchPatient(client);
    renderList('patient-data-list', [
      `Name: ${patientData.name?.[0]?.text || ''}`,
      `Gender: ${patientData.gender}`,
      `Birth Date: ${patientData.birthDate}`,
      `ID: ${patientData.id}`
    ]);
  } catch (e) {
    alert("Error fetching patient: " + e.message);
  } finally {
    showLoading(false);
  }
}
async function handleFetchVitals() {
  showLoading(true);
  try {
    vitalsData = await fetchVitals(client);
    const element = document.getElementById('vital-signs-data');
    if (vitalsData?.entry?.length) {
      element.textContent = vitalsData.entry.map(e => {
        const r = e.resource;
        let line = r.code?.text || "Vital";
        if (r.valueQuantity) line += `: ${r.valueQuantity.value} ${r.valueQuantity.unit||''}`;
        return line;
      }).join('\n');
    } else {
      element.textContent = "No vital signs found.";
    }
  } catch (e) {
    alert("Error fetching vitals: " + e.message);
  } finally {
    showLoading(false);
  }
}
async function handleFetchMeds() {
  showLoading(true);
  try {
    medsData = await fetchMedications(client);
    const tbody = document.querySelector('#medications-table tbody');
    tbody.innerHTML = '';
    (medsData.entry || []).forEach(({ resource }) => {
      const tr = document.createElement('tr');
      const med = resource.medicationCodeableConcept?.text || resource.medicationReference?.display || 'Unknown';
      const status = resource.status || 'N/A';
      const date = resource.authoredOn?.split('T')[0] || 'N/A';
      [med, status, date].forEach(text => {
        const td = document.createElement('td');
        td.textContent = text;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  } catch (e) {
    alert("Error fetching meds: " + e.message);
  } finally {
    showLoading(false);
  }
}

// --- Chat Handler ---
async function handleChatSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  chatHistory.push({ role: 'user', content: msg });
  renderChatHistory();

  // Placeholder while waiting for OpenAI
  chatHistory.push({ role: 'assistant', content: '...' });
  renderChatHistory();

  const aiResp = await getChatResponse({
    chatHistory: chatHistory.filter(m => m.role !== 'assistant' || m.content !== '...'),
    patient: contextConfig.includePatient ? patientData : null,
    vitals: contextConfig.includeVitals ? vitalsData : null,
    meds: contextConfig.includeMeds ? medsData : null,
    config: contextConfig,
    openAiKey: OPENAI_API_KEY
  });

  chatHistory.pop(); // remove placeholder
  chatHistory.push(aiResp);
  renderChatHistory();
}

// --- User Customization UI (Simple Example) ---
function setupContextControls() {
  // Example: expose sliders and checkboxes for counts
  const vitalsSlider = document.getElementById('vitals-count');
  const medsSlider = document.getElementById('meds-count');
  const includeVitals = document.getElementById('include-vitals');
  const includeMeds = document.getElementById('include-meds');
  const includePatient = document.getElementById('include-patient');

  if (vitalsSlider) vitalsSlider.oninput = e => contextConfig.vitalsCount = parseInt(e.target.value);
  if (medsSlider) medsSlider.oninput = e => contextConfig.medsCount = parseInt(e.target.value);
  if (includeVitals) includeVitals.onchange = e => contextConfig.includeVitals = e.target.checked;
  if (includeMeds) includeMeds.onchange = e => contextConfig.includeMeds = e.target.checked;
  if (includePatient) includePatient.onchange = e => contextConfig.includePatient = e.target.checked;
}

// --- Main App Startup ---
async function startApp() {
  showLoading(true);
  try {
    client = await smartReady();
    await handleFetchPatient();
    await handleFetchVitals();
    await handleFetchMeds();
    document.getElementById('fetch-patient-btn').onclick = handleFetchPatient;
    document.getElementById('fetch-vitals-btn').onclick = handleFetchVitals;
    document.getElementById('fetch-meds-btn').onclick = handleFetchMeds;
    document.getElementById('chat-form').onsubmit = handleChatSubmit;
    setupContextControls();
    showLoading(false);
  } catch (e) {
    showLoading(false);
    alert("EHR launch error: " + e.message);
  }
}
startApp();
