// src/fhirClient.js
export async function fetchResource({ client, path, backendUrl }) {
  if (!client?.state?.serverUrl || !client?.state?.tokenResponse?.access_token) {
    throw new Error("No valid SMART client state for fetching FHIR resource.");
  }
  const serverUrl = client.state.serverUrl;
  let url = `${backendUrl}/${path}`;
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
