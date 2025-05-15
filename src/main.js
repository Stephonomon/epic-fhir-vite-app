import './style.css'; // Import CSS
// Make sure fhirclient is installed: npm install fhirclient
import FHIR from 'fhirclient';

// --- Configuration ---
const CLIENT_ID = '023dda75-b5e9-4f99-9c0b-dc5704a04164'; // Your provided client_id
const APP_REDIRECT_URI = window.location.origin + window.location.pathname;
const BACKEND_PROXY_URL = 'https://snp-vite-backend.onrender.com/api/fhir-proxy';

// --- UI Helper Functions ---
function showLoading(isLoading, section = 'loading') {
  const loadingElement = document.getElementById(section);
  if (loadingElement) {
    loadingElement.style.display = isLoading ? 'block' : 'none';
  } else {
    console.warn(`UI element '${section}' not found.`);
  }
}

// Toggle collapsible sections by wrapper ID prefix
function toggleSection(sectionId, show) {
  const wrapper = document.getElementById(`${sectionId}-wrapper`);
  if (wrapper) wrapper.style.display = show ? 'block' : 'none';
}

// --- Display Functions ---

// Render patient details as a list
function displayPatientData(data) {
  toggleSection('patient-info', true);
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
    ['Name', name],
    ['Gender', data.gender],
    ['Birth Date', data.birthDate],
    ['ID', data.id],
    ['Phone', phone],
    ['Email', email],
    ['Address', address],
  ];

  fields.forEach(([label, value]) => {
    const li = document.createElement('li');
    li.textContent = `${label}: ${value || 'N/A'}`;
    list.appendChild(li);
  });
}

// Render recent vital signs in a <pre>
function displayVitalSigns(data) {
  toggleSection('vital-signs-info', true);
  const element = document.getElementById('vital-signs-data');
  let text = "No vital signs found or an error occurred.";

  if (data?.entry?.length) {
    text = data.entry.map(entry => {
      const r = entry.resource;
      if (!r) return "Malformed entry: no resource found";

      let line = r.code?.text || r.code?.coding?.[0]?.display || "Unknown Vital";
      if (r.valueQuantity) {
        line += `: ${r.valueQuantity.value} ${r.valueQuantity.unit||''}`;
      } else if (r.component?.length) {
        line += ':' + r.component.map(c => {
          const lab = c.code?.text || c.code?.coding?.[0]?.display || "Component";
          const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit||''}` : 'N/A';
          return `
  - ${lab}: ${val}`;
        }).join('');
      } else {
        line += ": N/A";
      }
      if (r.effectiveDateTime) {
        line += ` (Recorded: ${new Date(r.effectiveDateTime).toLocaleString()})`;
      }
      return line;
    }).join('');
  } else if (data?.total === 0) {
    text = "No vital signs found for this patient.";
  }

  element.textContent = text;
}

// Auth details display
function displayAuthDetails(client) {
  toggleSection('auth-details', true);
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

// Launch token display
function displayLaunchTokenData(client) {
  const wrapper = document.getElementById('launch-token-data-wrapper');
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
    wrapper.style.display = 'block';
    jsonEl.textContent = JSON.stringify(filtered, null, 2);
  }
}

// Error display
function displayError(message, errorObj = null) {
  showLoading(false);
  toggleSection('error-info', true);
  const errEl = document.getElementById('error-info');
  if (errEl) {
    errEl.textContent = message + (errorObj ? `
Details: ${errorObj.stack||errorObj}` : '');
  }
  console.error(message, errorObj);
}

// --- FHIR Fetch Helpers ---
async function fetchResource(path) {
  const client = window.smartClient;
  const serverUrl = client.state.serverUrl;
  // Build URL, preserving any existing query parameters
  let url = `${BACKEND_PROXY_URL}/${path}`;
  const sep = url.includes('?') ? '&' : '?';
  url += `${sep}patient=${client.patient.id}&targetFhirServer=${encodeURIComponent(serverUrl)}`;
  
  // Request JSON explicitly to avoid XML responses
  const resp = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${client.state.tokenResponse.access_token}`,
      'Accept': 'application/fhir+json'
    }
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`FHIR ${path} error ${resp.status}: ${text}`);
  }
  return resp.json();
}

// Fetch and display patient
async function fetchPatientData(client) {
  showLoading(true);
  if (!client.patient?.id) {
    displayError('No patient context');
    return;
  }
  try {
    const data = await fetchResource(`Patient/${client.patient.id}`);
    displayPatientData(data);
  } catch (e) {
    displayError(`Failed to fetch patient data: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

// Fetch and display vitals
async function fetchVitalSigns(client) {
  showLoading(true);
  try {
    // Search vital signs without manual patient param (fetchResource appends it)
    const data = await fetchResource('Observation?category=vital-signs&_sort=-date&_count=10');
    displayVitalSigns(data);
  } catch (e) {
    displayError(`Failed to fetch vital signs: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

// --- Medications Section ---
function displayMedications(data) {
  toggleSection('medications-info', true);
  const tbody = document.querySelector('#medications-table tbody');
  tbody.innerHTML = '';

  // Sort by authoredOn descending
  const entries = (data.entry || []).slice().sort((a, b) => {
    const da = a.resource.authoredOn ? new Date(a.resource.authoredOn) : 0;
    const db = b.resource.authoredOn ? new Date(b.resource.authoredOn) : 0;
    return db - da;
  });

  entries.forEach(({ resource }) => {
    const tr = document.createElement('tr');
    const med = resource.medicationCodeableConcept?.text || resource.medicationReference?.display || 'Unknown';
    const status = resource.status || 'N/A';
    const date = resource.authoredOn?.split('T')[0] || 'N/A';
    const provider = resource.requester?.display || resource.requester?.reference || 'N/A';
    // Use dosageInstruction.text for patient instructions
// inside displayMedications:
const instructions = (resource.dosageInstruction || [])
  .map(di => {
    // 1) take the clean, patient‐facing string if it exists…
    if (di.patientInstruction) {
      return di.patientInstruction;
    }
    // 2) otherwise fall back to slicing off everything after the first comma:
    if (di.text && di.text.includes(',')) {
      return di.text.split(',')[0].trim() + '.';
    }
    // 3) last resort, grab whatever `text` was there
    return di.text || 'N/A';
  })
  .join('; ');



    [med, status, date, provider, instructions].forEach(text => {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

async function fetchMedications(client) {
  showLoading(true);
  try {
    // Search medication requests without manual patient param (fetchResource appends it)
    const data = await fetchResource('MedicationRequest?_sort=-authoredon&_count=10');
    displayMedications(data);
  } catch (e) {
    displayError(`Failed to fetch medications: ${e.message}`, e);
  } finally {
    showLoading(false);
  }
}

// --- Initialization ---
function isAbsoluteUrl(url) {
  return typeof url === 'string' && (url.includes('://') || url.startsWith('//'));
}

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
}