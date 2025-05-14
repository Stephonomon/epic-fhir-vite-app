// src/main.js
import './style.css'; // Import CSS
// Make sure fhirclient is installed: npm install fhirclient
import FHIR from 'fhirclient';

// --- Configuration ---
const CLIENT_ID = '023dda75-b5e9-4f99-9c0b-dc5704a04164'; // Your provided client_id

// This will dynamically set the redirect URI based on where the app is hosted.
// For your Netlify deployment, it will correctly be https://snpvite.netlify.app/
// Ensure this exact URL (including http/https and trailing slash if present)
// is registered as a Redirect URI in your Epic App Orchard configuration.
const APP_REDIRECT_URI = window.location.origin + window.location.pathname; 

// URL for your backend proxy.
// If your backend is still running locally for testing with the Netlify frontend:
//const BACKEND_PROXY_URL = 'http://localhost:3001/api/fhir-proxy'; 
// IF YOUR BACKEND IS DEPLOYED TO A PUBLIC URL, REPLACE THE LINE ABOVE WITH:
const BACKEND_PROXY_URL = 'https://snp-vite-backend.onrender.com/api/fhir-proxy'; // Updated to your Render backend


// --- UI Helper Functions ---
function showLoading(isLoading, section = 'loading') {
    const loadingElement = document.getElementById(section);
    if (loadingElement) {
        loadingElement.style.display = isLoading ? 'block' : 'none';
    } else {
        console.warn(`UI element '${section}' not found.`);
    }
}

function displayPatientData(data) {
    const patientInfoElement = document.getElementById('patient-info');
    const patientDataElement = document.getElementById('patient-data');

    if (patientInfoElement) {
        patientInfoElement.style.display = 'block';
    } else {
        console.warn("UI element 'patient-info' not found.");
    }
    if (patientDataElement) {
        patientDataElement.textContent = JSON.stringify(data, null, 2);
    } else {
        console.warn("UI element 'patient-data' not found.");
    }
}

function displayVitalSigns(data) {
    const vitalSignsInfoElement = document.getElementById('vital-signs-info');
    const vitalSignsDataElement = document.getElementById('vital-signs-data');

    if (vitalSignsInfoElement) {
        vitalSignsInfoElement.style.display = 'block';
    } else {
        console.warn("UI element 'vital-signs-info' not found.");
    }

    if (vitalSignsDataElement) {
        let vitalSignsText = "No vital signs found or an error occurred.";
        if (data && data.entry && data.entry.length > 0) {
            vitalSignsText = data.entry.map(entry => {
                const resource = entry.resource;
                if (!resource) return "Malformed entry: no resource found";

                let display = resource.code && resource.code.text ? resource.code.text : 
                              (resource.code && resource.code.coding && resource.code.coding[0] ? resource.code.coding[0].display : "Unknown Vital");
                
                if (resource.valueQuantity) {
                    display += `: ${resource.valueQuantity.value} ${resource.valueQuantity.unit || ''}`;
                } else if (resource.component && resource.component.length > 0) {
                    const componentsText = resource.component.map(comp => {
                        let compDisplay = comp.code && comp.code.text ? comp.code.text : 
                                          (comp.code && comp.code.coding && comp.code.coding[0] ? comp.code.coding[0].display : "Unknown Component");
                        if (comp.valueQuantity) {
                            return `\n    - ${compDisplay}: ${comp.valueQuantity.value} ${comp.valueQuantity.unit || ''}`;
                        }
                        return `\n    - ${compDisplay}: N/A`;
                    }).join('');
                    display += `:${componentsText}`;
                } else {
                    display += ": N/A";
                }

                if (resource.effectiveDateTime) {
                    display += ` (Recorded: ${new Date(resource.effectiveDateTime).toLocaleString()})`;
                }
                return display;
            }).join('\n\n');
        } else if (data && data.hasOwnProperty('total') && data.total === 0) {
            vitalSignsText = "No vital signs found for this patient.";
        }
        vitalSignsDataElement.textContent = vitalSignsText;
    } else {
        console.warn("UI element 'vital-signs-data' not found.");
    }
}


function displayAuthDetails(client) {
    const authDetailsElement = document.getElementById('auth-details');
    const accessTokenDisplayElement = document.getElementById('access-token-display');
    const patientIdDisplayElement = document.getElementById('patient-id-display');

    const fhirServerDisplayElement = document.getElementById('fhir-server-display');
    const tokenResponseDisplayElement = document.getElementById('token-response-display');

    if (authDetailsElement) authDetailsElement.style.display = 'block'; else console.warn("UI element 'auth-details' not found.");
    if (accessTokenDisplayElement) accessTokenDisplayElement.textContent = (client?.state?.tokenResponse?.access_token) ? client.state.tokenResponse.access_token.substring(0, 30) + "..." : "N/A"; else console.warn("UI element 'access-token-display' not found.");
    if (patientIdDisplayElement) patientIdDisplayElement.textContent = client?.patient?.id || "N/A"; else console.warn("UI element 'patient-id-display' not found.");
    if (fhirServerDisplayElement) fhirServerDisplayElement.textContent = client?.state?.serverUrl || "N/A"; else console.warn("UI element 'fhir-server-display' not found.");
    if (tokenResponseDisplayElement) tokenResponseDisplayElement.textContent = client?.state?.tokenResponse ? JSON.stringify(client.state.tokenResponse, null, 2) : "No token response available."; else console.warn("UI element 'token-response-display' not found.");
}

function displayLaunchTokenData(client) {
    const launchTokenDiv = document.getElementById("launch-token-data");
    const launchTokenJson = document.getElementById("launch-token-json");

    if (!client?.state?.tokenResponse) return;

    const token = client.state.tokenResponse;

    // Filter out standard OAuth fields to focus on Epic-specific ones
    const filtered = {};
    for (const key in token) {
        if (!["access_token", "token_type", "expires_in", "scope", "id_token"].includes(key)) {
            filtered[key] = token[key];
        }
    }

    if (Object.keys(filtered).length > 0) {
        launchTokenDiv.style.display = 'block';
        launchTokenJson.textContent = JSON.stringify(filtered, null, 2);
    }
}



function displayError(message, errorObj = null) {
    showLoading(false); 
    const errorDiv = document.getElementById('error-info');
    if (errorDiv) {
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Error: ' + message;
        if (errorObj) errorDiv.textContent += `\nDetails: ${errorObj.stack || errorObj}`;
    } else {
        console.warn("UI element 'error-info' not found. Error was:", message);
    }
    console.error(message);
    if (errorObj) console.error(errorObj);
}

// --- SMART on FHIR Data Fetching Functions ---
async function fetchPatientData(client) {
    showLoading(true, 'loading');
    
    if (!client.patient || !client.patient.id) {
        displayError('No patient ID found in context. Cannot fetch patient data.');
        displayAuthDetails(client); 
        return null;
    }
    
    const patientId = client.patient.id;
    const epicFhirServerUrl = client.state.serverUrl; 

    if (!epicFhirServerUrl) {
        displayError('FHIR server URL (iss) is missing from client state.');
        displayAuthDetails(client); return null;
    }
    if (!client.state.tokenResponse || !client.state.tokenResponse.access_token) {
        displayError('Access token is missing from client state.');
        displayAuthDetails(client); return null;
    }

    const requestUrl = `${BACKEND_PROXY_URL}/Patient/${patientId}?targetFhirServer=${encodeURIComponent(epicFhirServerUrl)}`;

    try {
        const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${client.state.tokenResponse.access_token}`,
                'Accept': 'application/fhir+json'
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`FHIR server responded with ${response.status}: ${errorData}`);
        }

        const patientData = await response.json();
        displayPatientData(patientData);
        return patientData; 
    } catch (error) {
        displayError(`Failed to fetch patient data: ${error.message}`, error);
        displayAuthDetails(client); 
        return null; 
    } finally {
        showLoading(false, 'loading');
    }
}

async function fetchVitalSigns(client) {
    showLoading(true, 'loading'); 

    if (!client.patient || !client.patient.id) {
        displayError('No patient ID found in context. Cannot fetch vital signs.');
        displayAuthDetails(client);
        return;
    }

    const patientId = client.patient.id;
    const epicFhirServerUrl = client.state.serverUrl;

    if (!epicFhirServerUrl || !client.state.tokenResponse || !client.state.tokenResponse.access_token) {
        displayError('Client state is incomplete (missing serverUrl or access token). Cannot fetch vital signs.');
        displayAuthDetails(client);
        return;
    }
    
    const requestUrl = `${BACKEND_PROXY_URL}/Observation?patient=${patientId}&category=vital-signs&_sort=-date&_count=10&targetFhirServer=${encodeURIComponent(epicFhirServerUrl)}`;
    console.log("Requesting Vitals from:", requestUrl);

    try {
        const response = await fetch(requestUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${client.state.tokenResponse.access_token}`,
                'Accept': 'application/fhir+json'
            }
        });

        if (!response.ok) {
            const errorData = await response.text();
            throw new Error(`FHIR server responded with ${response.status} for vital signs: ${errorData}`);
        }
        const vitalSignsData = await response.json();
        console.log("Vital Signs Data Received:", vitalSignsData);
        displayVitalSigns(vitalSignsData);
    } catch (error) {
        displayError(`Failed to fetch vital signs: ${error.message}`, error);
        displayVitalSigns(null); 
    } finally {
        showLoading(false, 'loading');
    }
}

// --- Application Initialization ---

// Helper function to check if a URL is absolute
function isAbsoluteUrl(url) {
    if (typeof url !== 'string') return false;
    return url.indexOf('://') > 0 || url.indexOf('//') === 0;
}

// Get launch parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const launchToken = urlParams.get('launch');
const iss = urlParams.get('iss');

if (sessionStorage.getItem('SMART_KEY')) { 
    // This means the page is reloading after the redirect from the auth server
    FHIR.oauth2.ready()
        .then(async (client) => { 
            console.log('SMART on FHIR client ready:', client);
            if (client?.state?.tokenResponse) {
                console.log('Full Token Response:', JSON.stringify(client.state.tokenResponse, null, 2));
            } else {
                console.log('Client ready, but no tokenResponse found in client.state.');
            }
            
            window.smartClient = client; 
            
            const patientData = await fetchPatientData(client);
            displayAuthDetails(client);
            displayLaunchTokenData(client); 

            if (client.patient && client.patient.id) {
                await fetchVitalSigns(client);
            }
        })
        .catch(err => {
            displayError(`SMART on FHIR ready error: ${err.message}`, err);
            if (window.FHIR?.oauth2?.client) {
                displayAuthDetails(window.FHIR.oauth2.client);
            }
        });
} else if (launchToken && iss) {
    // This is an EHR launch (iss and launch params are in the URL)
    console.log('EHR Launch detected.');
    console.log('ISS from URL:', iss);
    console.log('Launch token from URL:', launchToken);

    if (!isAbsoluteUrl(iss)) {
        const errorMessage = `Invalid 'iss' parameter: The 'iss' parameter must be an absolute URL. Received: '${iss}'. Please check the launch configuration in the EHR. App cannot proceed.`;
        displayError(errorMessage);
        showLoading(false); // Ensure loading is hidden
    } else {
        console.log('Initiating SMART on FHIR authorization with EHR launch parameters...');
        showLoading(true, 'loading');
        FHIR.oauth2.authorize({
            client_id: CLIENT_ID,
            scope: 'launch launch/patient patient/*.read observation/*.read openid fhirUser', 
            redirect_uri: APP_REDIRECT_URI,
            iss: iss, // Pass the iss from the launch URL
            launch: launchToken, // Pass the launch token
        })
        .catch(err => {
            displayError(`SMART on FHIR authorization initiation error: ${err.message}`, err);
        });
    }
} else {
    // This is a standalone launch (no iss or launch in URL, and no SMART_KEY in session storage)
    console.log('Standalone launch detected (or app opened directly). No iss/launch parameters in URL.');
    showLoading(false); 
    displayError("This app is designed to be launched from an EHR system or requires manual FHIR server configuration for standalone use.");
}
