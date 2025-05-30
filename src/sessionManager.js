// src/sessionManager.js
// Handles multi-instance support for Epic Hyperspace embedded browser

export class SessionManager {
  constructor() {
    // Try to get instance key from URL params first
    const urlParams = new URLSearchParams(window.location.search);
    this.instanceKey = urlParams.get('instanceKey') || this.getStoredInstanceKey() || this.generateInstanceKey();
    
    // Ensure instance key is in URL for future navigation
    this.ensureInstanceKeyInUrl();
    
    // Store the instance key for this session
    this.storeInstanceKey();
  }

  generateInstanceKey() {
    // Generate a UUID for this instance
    return 'inst_' + crypto.randomUUID();
  }

  getStoredInstanceKey() {
    // Try to retrieve from multiple sources in order of preference
    // 1. URL parameter (already checked in constructor)
    // 2. SMART launch state parameter
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (smartKey) {
      try {
        const smartData = JSON.parse(sessionStorage.getItem(smartKey));
        if (smartData?.state) {
          return smartData.state;
        }
      } catch (e) {
        console.warn('Failed to parse SMART data:', e);
      }
    }
    
    return null;
  }

  storeInstanceKey() {
    // Store instance key in a way that won't conflict with other instances
    sessionStorage.setItem(`current_instance_${window.location.pathname}`, this.instanceKey);
  }

  ensureInstanceKeyInUrl() {
    const url = new URL(window.location);
    if (!url.searchParams.has('instanceKey')) {
      url.searchParams.set('instanceKey', this.instanceKey);
      window.history.replaceState({}, '', url);
    }
  }

  // Prefix any key with the instance key to ensure isolation
  prefixKey(key) {
    return `${this.instanceKey}_${key}`;
  }

  // Wrapper methods for sessionStorage
  setItem(key, value) {
    const prefixedKey = this.prefixKey(key);
    sessionStorage.setItem(prefixedKey, typeof value === 'object' ? JSON.stringify(value) : value);
  }

  getItem(key) {
    const prefixedKey = this.prefixKey(key);
    const value = sessionStorage.getItem(prefixedKey);
    
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }
    return null;
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
  }

  // Get all keys for this instance
  getInstanceKeys() {
    const instanceKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.instanceKey + '_')) {
        instanceKeys.push(key.substring(this.instanceKey.length + 1));
      }
    }
    return instanceKeys;
  }

  // Store SMART client state with instance isolation
  storeSMARTState(smartKey, smartData) {
    // Store the SMART key globally as it's needed for oauth2.ready()
    sessionStorage.setItem('SMART_KEY', smartKey);
    
    // But store the actual data with instance prefix
    this.setItem('SMART_DATA', smartData);
    
    // Also store under the original key for compatibility
    sessionStorage.setItem(smartKey, JSON.stringify(smartData));
  }

  // Retrieve SMART state for this instance
  getSMARTState() {
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (!smartKey) return null;

    // First try to get instance-specific data
    const instanceData = this.getItem('SMART_DATA');
    if (instanceData) return { key: smartKey, data: instanceData };

    // Fallback to global data if available
    try {
      const globalData = JSON.parse(sessionStorage.getItem(smartKey));
      return { key: smartKey, data: globalData };
    } catch {
      return null;
    }
  }

  // Check if this is a new instance
  isNewInstance() {
    return !this.getItem('initialized');
  }

  // Mark instance as initialized
  markInitialized() {
    this.setItem('initialized', true);
    this.setItem('initialized_at', new Date().toISOString());
  }

  // Get instance metadata
  getInstanceMetadata() {
    return {
      instanceKey: this.instanceKey,
      initialized: this.getItem('initialized') || false,
      initializedAt: this.getItem('initialized_at'),
      patientId: this.getItem('patient_id'),
      patientName: this.getItem('patient_name'),
      encounterContext: this.getItem('encounter_context')
    };
  }

  // Store patient context for this instance
  storePatientContext(patientData, contextData = {}) {
    this.setItem('patient_id', patientData.id);
    this.setItem('patient_name', patientData.name);
    this.setItem('patient_data', patientData);
    
    if (contextData.encounterId) {
      this.setItem('encounter_id', contextData.encounterId);
    }
    
    if (contextData.csn) {
      this.setItem('csn', contextData.csn);
    }
    
    if (contextData.patId) {
      this.setItem('pat_id', contextData.patId);
    }
    
    this.setItem('context_data', contextData);
  }

  // Get patient context for this instance
  getPatientContext() {
    return {
      patientId: this.getItem('patient_id'),
      patientName: this.getItem('patient_name'),
      patientData: this.getItem('patient_data'),
      encounterId: this.getItem('encounter_id'),
      csn: this.getItem('csn'),
      patId: this.getItem('pat_id'),
      contextData: this.getItem('context_data')
    };
  }

  // Check if we have valid patient context
  hasValidPatientContext() {
    const context = this.getPatientContext();
    return !!(context.patientId && context.patientData);
  }

  // Store chat history for this instance
  storeChatHistory(chatHistory) {
    this.setItem('chat_history', chatHistory);
  }

  // Get chat history for this instance
  getChatHistory() {
    return this.getItem('chat_history') || [];
  }

  // Store data cache for this instance
  storeDataCache(dataCache) {
    this.setItem('data_cache', dataCache);
  }

  // Get data cache for this instance
  getDataCache() {
    return this.getItem('data_cache') || {};
  }

  // Utility to clean up old instances (optional)
  cleanupOldInstances(maxAgeHours = 24) {
    const now = new Date();
    const keysToRemove = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('_initialized_at')) {
        const instanceKey = key.split('_initialized_at')[0];
        const initializedAt = sessionStorage.getItem(key);
        
        if (initializedAt) {
          const age = now - new Date(initializedAt);
          const ageInHours = age / (1000 * 60 * 60);
          
          if (ageInHours > maxAgeHours) {
            // Find all keys for this old instance
            for (let j = 0; j < sessionStorage.length; j++) {
              const checkKey = sessionStorage.key(j);
              if (checkKey && checkKey.startsWith(instanceKey + '_')) {
                keysToRemove.push(checkKey);
              }
            }
          }
        }
      }
    }

    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} keys from old instances`);
    }
  }
}