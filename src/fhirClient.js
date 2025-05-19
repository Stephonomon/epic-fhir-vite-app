import FHIR from 'fhirclient';

const BACKEND_PROXY_URL = 'https://snp-vite-backend.onrender.com/api/fhir-proxy';

// SMART on FHIR auth/launch
export async function smartReady() {
  return FHIR.oauth2.ready();
}

// Fetch Patient, Vitals, Medications
export async function fetchPatient(client) {
  return fetchResource(client, `Patient/${client.patient.id}`);
}

export async function fetchVitals(client) {
  return fetchResource(client, 'Observation?category=vital-signs&_sort=-date&_count=10');
}

export async function fetchMedications(client) {
  return fetchResource(client, 'MedicationRequest?_sort=-authoredon&_count=10');
}

// Generic FHIR resource fetch
async function fetchResource(client, path) {
  const serverUrl = client.state.serverUrl;
  let url = `${BACKEND_PROXY_URL}/${path}`;
  const sep = url.includes('?') ? '&' : '?';
  url += `${sep}patient=${client.patient.id}&targetFhirServer=${encodeURIComponent(serverUrl)}`;

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
