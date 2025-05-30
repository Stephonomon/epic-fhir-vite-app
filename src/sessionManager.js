// src/sessionManager.js
// Session manager aligned with Epic's documentation for embedded workspace support

export class SessionManager {
  constructor() {
    // Get instance key from OAuth state parameter or generate one
    this.instanceKey = this.getInstanceKeyFromOAuthState() || this.generateInstanceKey();
    console.log('SessionManager initialized with instance key:', this.instanceKey);
    
    // Store instance key for navigation across pages
    this.persistInstanceKey();
  }

  getInstanceKeyFromOAuthState() {
    // Priority 1: Check URL for OAuth state parameter (post-auth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const stateParam = urlParams.get('state');
    if (stateParam) {
      console.log('Found OAuth state parameter in URL:', stateParam);
      return stateParam;
    }

    // Priority 2: Check if we stored the state during authorization
    const storedState = sessionStorage.getItem('oauth_state');
    if (storedState) {
      console.log('Found stored OAuth state:', storedState);
      return storedState;
    }

    // Priority 3: Look for state in SMART client data
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (smartKey) {
      try {
        const smartData = JSON.parse(sessionStorage.getItem(smartKey));
        if (smartData?.state) {
          console.log('Found state in SMART data:', smartData.state);
          return smartData.state;
        }
      } catch (e) {
        console.warn('Failed to parse SMART data:', e);
      }
    }

    // Priority 4: Check if we have it in the URL as instanceKey (for cross-page navigation)
    const instanceKey = urlParams.get('instanceKey');
    if (instanceKey) {
      console.log('Found instanceKey in URL:', instanceKey);
      return instanceKey;
    }

    return null;
  }

  generateInstanceKey() {
    // Generate UUID as Epic recommends
    return crypto.randomUUID();
  }

  persistInstanceKey() {
    // Store for cross-page navigation
    sessionStorage.setItem('oauth_state', this.instanceKey);
    
    // Ensure it's in the URL for page navigation
    this.ensureInstanceKeyInUrl();
  }

  ensureInstanceKeyInUrl() {
    const url = new URL(window.location);
    if (!url.searchParams.has('instanceKey') && !url.searchParams.has('state')) {
      url.searchParams.set('instanceKey', this.instanceKey);
      window.history.replaceState({}, '', url);
    }
  }

  // Prefix any key with the instance key as Epic recommends
  prefixKey(key) {
    return `${this.instanceKey}_${key}`;
  }

  // Wrapper methods for sessionStorage following Epic's pattern
  setItem(key, value) {
    const prefixedKey = this.prefixKey(key);
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    sessionStorage.setItem(prefixedKey, stringValue);
  }

  getItem(key) {
    const prefixedKey = this.prefixKey(key);
    const value = sessionStorage.getItem(prefixedKey);
    
    if (value === null) return null;
    
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  removeItem(key) {
    const prefixedKey = this.prefixKey(key);
    sessionStorage.removeItem(prefixedKey);
  }

  // Clear only items for this instance
  clearInstance() {
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.instanceKey + '_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    console.log(`Cleared ${keysToRemove.length} keys for instance ${this.instanceKey}`);
  }

  // Store patient name following Epic's example
  setPatientName(patientName) {
    // Exactly as Epic shows in their example
    sessionStorage.setItem(`${this.instanceKey}_patientName`, patientName);
  }

  getPatientName() {
    // Exactly as Epic shows in their example
    return sessionStorage.getItem(`${this.instanceKey}_patientName`);
  }

  // Store SMART state with instance isolation
  storeSMARTState(smartKey, smartData) {
    // Store the SMART key globally (needed for oauth2.ready())
    sessionStorage.setItem('SMART_KEY', smartKey);
    
    // Store instance-specific SMART data
    this.setItem('SMART_DATA', smartData);
    
    // Also store under original key for SMART client compatibility
    sessionStorage.setItem(smartKey, JSON.stringify(smartData));
    
    // Extract and store launch parameters
    if (smartData?.tokenResponse) {
      this.setItem('launch_params', {
        patient: smartData.tokenResponse.patient,
        pat_id: smartData.tokenResponse.pat_id,
        csn: smartData.tokenResponse.csn,
        encounter: smartData.tokenResponse.encounter,
        user: smartData.tokenResponse.user
      });
    }
  }

  // Get SMART state for this instance
  getSMARTState() {
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (!smartKey) return null;

    // Try instance-specific data first
    const instanceData = this.getItem('SMART_DATA');
    if (instanceData) {
      return { key: smartKey, data: instanceData };
    }

    // Fallback to global data
    try {
      const globalData = JSON.parse(sessionStorage.getItem(smartKey));
      return { key: smartKey, data: globalData };
    } catch {
      return null;
    }
  }

  // Store patient context
  storePatientContext(patientData, tokenResponse = {}) {
    // Store patient name as Epic shows
    this.setPatientName(patientData.name);
    
    // Store other patient data
    this.setItem('patient_id', patientData.id);
    this.setItem('patient_data', patientData);
    
    // Store Epic-specific IDs
    if (tokenResponse.pat_id) {
      this.setItem('pat_id', tokenResponse.pat_id);
    }
    if (tokenResponse.csn) {
      this.setItem('csn', tokenResponse.csn);
    }
    if (tokenResponse.encounter) {
      this.setItem('encounter_id', tokenResponse.encounter);
    }
    
    this.setItem('context_stored_at', new Date().toISOString());
  }

  // Get patient context
  getPatientContext() {
    return {
      patientName: this.getPatientName(),
      patientId: this.getItem('patient_id'),
      patientData: this.getItem('patient_data'),
      patId: this.getItem('pat_id'),
      csn: this.getItem('csn'),
      encounterId: this.getItem('encounter_id'),
      contextStoredAt: this.getItem('context_stored_at')
    };
  }

  // Check if we have valid patient context
  hasValidPatientContext() {
    const context = this.getPatientContext();
    return !!(context.patientName && context.patientId);
  }

  // Mark instance as initialized
  markInitialized() {
    this.setItem('initialized', true);
    this.setItem('initialized_at', new Date().toISOString());
  }

  // Check if this is a new instance
  isNewInstance() {
    return !this.getItem('initialized');
  }

  // Store and retrieve chat history
  storeChatHistory(chatHistory) {
    this.setItem('chat_history', chatHistory);
  }

  getChatHistory() {
    return this.getItem('chat_history') || [];
  }

  // Store and retrieve data cache
  storeDataCache(dataCache) {
    this.setItem('data_cache', dataCache);
  }

  getDataCache() {
    return this.getItem('data_cache') || {};
  }

  // Get instance metadata
  getInstanceMetadata() {
    return {
      instanceKey: this.instanceKey,
      initialized: this.getItem('initialized') || false,
      initializedAt: this.getItem('initialized_at'),
      patientName: this.getPatientName(),
      patientId: this.getItem('patient_id'),
      patId: this.getItem('pat_id'),
      csn: this.getItem('csn'),
      isEmbedded: window.self !== window.top
    };
  }

  // Helper to check if we're dealing with the same patient
  isSamePatient(patId, csn) {
    const currentPatId = this.getItem('pat_id');
    const currentCsn = this.getItem('csn');
    
    return currentPatId === patId && currentCsn === csn;
  }

  // Clean up old instances (more conservative approach)
  cleanupOldInstances(maxAgeHours = 24) {
    const now = new Date();
    const keysToRemove = [];
    const instancesFound = new Set();

    // Find all instance keys
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('_initialized_at')) {
        const instanceKey = key.replace('_initialized_at', '');
        instancesFound.add(instanceKey);
      }
    }

    // Check age of each instance
    instancesFound.forEach(instanceKey => {
      // Don't clean up current instance
      if (instanceKey === this.instanceKey) return;
      
      const initializedAt = sessionStorage.getItem(`${instanceKey}_initialized_at`);
      if (initializedAt) {
        const age = now - new Date(initializedAt);
        const ageInHours = age / (1000 * 60 * 60);
        
        if (ageInHours > maxAgeHours) {
          // Collect all keys for this old instance
          for (let i = 0; i < sessionStorage.length; i++) {
            const key = sessionStorage.key(i);
            if (key && key.startsWith(instanceKey + '_')) {
              keysToRemove.push(key);
            }
          }
        }
      }
    });

    // Remove old keys
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} keys from old instances`);
    }
  }
}