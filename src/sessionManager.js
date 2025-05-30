// src/sessionManager.js
// Enhanced session manager for Epic workspace embedded apps

export class SessionManager {
  constructor() {
    // In embedded workspace, we need to rely more on context clues than URL
    this.instanceKey = this.determineInstanceKey();
    console.log('SessionManager initialized with key:', this.instanceKey);
  }

  determineInstanceKey() {
    // Priority order for determining instance key:
    
    // 1. Try to get from URL (works for external browser)
    const urlParams = new URLSearchParams(window.location.search);
    const urlInstanceKey = urlParams.get('instanceKey');
    if (urlInstanceKey) {
      console.log('Using instance key from URL:', urlInstanceKey);
      return urlInstanceKey;
    }

    // 2. Try to get from OAuth state parameter (stored during auth)
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (smartKey) {
      try {
        const smartData = JSON.parse(sessionStorage.getItem(smartKey));
        if (smartData?.state) {
          console.log('Using instance key from SMART state:', smartData.state);
          return smartData.state;
        }
      } catch (e) {
        console.warn('Failed to parse SMART data:', e);
      }
    }

    // 3. Try to detect from Epic context tokens
    // In embedded mode, Epic may provide context through different means
    const tokenResponse = this.getTokenResponseFromStorage();
    if (tokenResponse) {
      // Use combination of patient ID and CSN for embedded context
      if (tokenResponse.pat_id && tokenResponse.csn) {
        const contextKey = `ctx_${tokenResponse.pat_id}_${tokenResponse.csn}`;
        console.log('Using context-based instance key:', contextKey);
        return contextKey;
      }
    }

    // 4. Check if we're in an iframe (embedded mode)
    if (window.self !== window.top) {
      console.log('Detected iframe context, generating frame-specific key');
      // In embedded mode, generate key based on current timestamp and random
      // This ensures each embedded instance gets a unique key
      return `embed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 5. Fallback: generate new instance key
    const newKey = `inst_${crypto.randomUUID()}`;
    console.log('Generated new instance key:', newKey);
    return newKey;
  }

  getTokenResponseFromStorage() {
    // Look through sessionStorage for token response data
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('fhirclient')) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data?.tokenResponse) {
            return data.tokenResponse;
          }
        } catch (e) {
          // Continue searching
        }
      }
    }
    return null;
  }

  // Enhanced method to store SMART state with better embedded support
  storeSMARTState(smartKey, smartData) {
    // Store the SMART key globally as it's needed for oauth2.ready()
    sessionStorage.setItem('SMART_KEY', smartKey);
    
    // Extract context information for embedded mode
    if (smartData?.tokenResponse) {
      const { pat_id, csn, encounter } = smartData.tokenResponse;
      
      // If we have patient context, update our instance key to be context-based
      if (pat_id && csn && this.instanceKey.startsWith('embed_')) {
        const oldKey = this.instanceKey;
        this.instanceKey = `ctx_${pat_id}_${csn}`;
        console.log('Updated instance key from embed to context:', this.instanceKey);
        
        // Migrate any data from old key to new key
        this.migrateInstanceData(oldKey, this.instanceKey);
      }
      
      // Store context markers
      this.setItem('context_pat_id', pat_id);
      this.setItem('context_csn', csn);
      this.setItem('context_encounter', encounter);
    }
    
    // Store the instance-specific SMART data
    this.setItem('SMART_DATA', smartData);
    
    // Also store under the original key for compatibility
    sessionStorage.setItem(smartKey, JSON.stringify(smartData));
  }

  migrateInstanceData(oldKey, newKey) {
    console.log('Migrating data from', oldKey, 'to', newKey);
    const keysToMigrate = [];
    
    // Find all keys with old instance prefix
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(oldKey + '_')) {
        keysToMigrate.push(key);
      }
    }
    
    // Migrate each key
    keysToMigrate.forEach(oldFullKey => {
      const value = sessionStorage.getItem(oldFullKey);
      const keyPart = oldFullKey.substring(oldKey.length + 1);
      const newFullKey = `${newKey}_${keyPart}`;
      sessionStorage.setItem(newFullKey, value);
      sessionStorage.removeItem(oldFullKey);
    });
    
    console.log(`Migrated ${keysToMigrate.length} keys`);
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

  // Check if this is a new instance
  isNewInstance() {
    return !this.getItem('initialized');
  }

  // Mark instance as initialized
  markInitialized() {
    this.setItem('initialized', true);
    this.setItem('initialized_at', new Date().toISOString());
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
    this.setItem('last_updated', new Date().toISOString());
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
      contextData: this.getItem('context_data'),
      lastUpdated: this.getItem('last_updated')
    };
  }

  // Enhanced validation for patient context
  hasValidPatientContext() {
    const context = this.getPatientContext();
    
    // For embedded mode, also check if context is stale
    if (context.patientId && context.patientData) {
      // Check if we're in embedded mode and context might have changed
      if (window.self !== window.top) {
        const currentTokenResponse = this.getTokenResponseFromStorage();
        if (currentTokenResponse) {
          // Verify context still matches
          if (currentTokenResponse.pat_id && context.patId !== currentTokenResponse.pat_id) {
            console.warn('Patient context mismatch detected, clearing instance');
            this.clearInstance();
            return false;
          }
        }
      }
      return true;
    }
    return false;
  }

  // Get SMART state for this instance
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

  // Store chat history for this instance
  storeChatHistory(chatHistory) {
    this.setItem('chat_history', chatHistory);
    this.setItem('chat_history_updated', new Date().toISOString());
  }

  // Get chat history for this instance
  getChatHistory() {
    return this.getItem('chat_history') || [];
  }

  // Store data cache for this instance
  storeDataCache(dataCache) {
    this.setItem('data_cache', dataCache);
    this.setItem('data_cache_updated', new Date().toISOString());
  }

  // Get data cache for this instance
  getDataCache() {
    return this.getItem('data_cache') || {};
  }

  // Get instance metadata
  getInstanceMetadata() {
    return {
      instanceKey: this.instanceKey,
      initialized: this.getItem('initialized') || false,
      initializedAt: this.getItem('initialized_at'),
      patientId: this.getItem('patient_id'),
      patientName: this.getItem('patient_name'),
      encounterContext: this.getItem('encounter_context'),
      csn: this.getItem('csn'),
      patId: this.getItem('pat_id'),
      lastUpdated: this.getItem('last_updated'),
      isEmbedded: window.self !== window.top
    };
  }

  // Utility to detect and handle context changes in embedded mode
  detectContextChange() {
    if (window.self !== window.top) {
      const currentTokenResponse = this.getTokenResponseFromStorage();
      if (currentTokenResponse) {
        const storedPatId = this.getItem('pat_id');
        const storedCsn = this.getItem('csn');
        
        if (currentTokenResponse.pat_id !== storedPatId || 
            currentTokenResponse.csn !== storedCsn) {
          console.log('Context change detected in embedded mode');
          return {
            changed: true,
            oldContext: { patId: storedPatId, csn: storedCsn },
            newContext: { patId: currentTokenResponse.pat_id, csn: currentTokenResponse.csn }
          };
        }
      }
    }
    return { changed: false };
  }

  // Clean up stale instances
  cleanupStaleInstances(maxAgeHours = 24) {
    const now = new Date();
    const keysToRemove = [];
    const contextKeys = new Set();

    // First pass: identify all context-based keys and their age
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('_last_updated')) {
        const instanceKey = key.split('_last_updated')[0];
        const lastUpdated = sessionStorage.getItem(key);
        
        if (lastUpdated) {
          const age = now - new Date(lastUpdated);
          const ageInHours = age / (1000 * 60 * 60);
          
          // For context-based keys, be more aggressive with cleanup
          if (instanceKey.startsWith('ctx_') && ageInHours > 1) {
            contextKeys.add(instanceKey);
          } else if (ageInHours > maxAgeHours) {
            contextKeys.add(instanceKey);
          }
        }
      }
    }

    // Second pass: collect all keys for removal
    contextKeys.forEach(instanceKey => {
      for (let j = 0; j < sessionStorage.length; j++) {
        const key = sessionStorage.key(j);
        if (key && key.startsWith(instanceKey + '_')) {
          keysToRemove.push(key);
        }
      }
    });

    // Remove the keys
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
    
    if (keysToRemove.length > 0) {
      console.log(`Cleaned up ${keysToRemove.length} keys from ${contextKeys.size} stale instances`);
    }
  }
}