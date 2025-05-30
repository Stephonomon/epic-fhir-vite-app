// src/instanceSessionManager.js
// Manages instance-specific storage to support multiple concurrent app instances

export class InstanceSessionManager {
  constructor() {
    // Try to get instance ID from URL params first (for page reloads)
    const urlParams = new URLSearchParams(window.location.search);
    this.instanceId = urlParams.get('instanceId') || this.generateInstanceId();
    
    // Ensure instance ID is in URL for future navigation
    if (!urlParams.get('instanceId')) {
      this.updateUrlWithInstanceId();
    }
  }

  generateInstanceId() {
    // Generate a unique ID for this instance
    return `inst_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  updateUrlWithInstanceId() {
    const url = new URL(window.location.href);
    url.searchParams.set('instanceId', this.instanceId);
    window.history.replaceState({}, '', url.toString());
  }

  // Prefix key with instance ID
  getInstanceKey(key) {
    return `${this.instanceId}_${key}`;
  }

  // Instance-aware sessionStorage methods
  setItem(key, value) {
    const instanceKey = this.getInstanceKey(key);
    sessionStorage.setItem(instanceKey, value);
  }

  getItem(key) {
    const instanceKey = this.getInstanceKey(key);
    return sessionStorage.getItem(instanceKey);
  }

  removeItem(key) {
    const instanceKey = this.getInstanceKey(key);
    sessionStorage.removeItem(instanceKey);
  }

  // Get all keys for this instance
  getInstanceKeys() {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.instanceId)) {
        keys.push(key.substring(this.instanceId.length + 1));
      }
    }
    return keys;
  }

  // Clear all data for this instance
  clearInstance() {
    const instanceKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith(this.instanceId)) {
        instanceKeys.push(key);
      }
    }
    instanceKeys.forEach(key => sessionStorage.removeItem(key));
  }

  // Check if a key exists for this instance
  hasItem(key) {
    return this.getItem(key) !== null;
  }

  // Get the instance ID
  getInstanceId() {
    return this.instanceId;
  }

  // Store OAuth state with instance prefix
  setOAuthState(state) {
    this.setItem('oauth_state', state);
  }

  getOAuthState() {
    return this.getItem('oauth_state');
  }

  // Store SMART context with instance prefix
  setSMARTContext(context) {
    this.setItem('SMART_KEY', JSON.stringify(context));
  }

  getSMARTContext() {
    const context = this.getItem('SMART_KEY');
    return context ? JSON.parse(context) : null;
  }

  // Clean up old instances (optional - call periodically)
  cleanupOldInstances(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const instancesToRemove = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('inst_')) {
        // Extract timestamp from instance ID
        const match = key.match(/inst_(\d+)_/);
        if (match) {
          const timestamp = parseInt(match[1]);
          if (now - timestamp > maxAgeMs) {
            instancesToRemove.push(key);
          }
        }
      }
    }
    
    // Remove old instance data
    instancesToRemove.forEach(key => {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const storageKey = sessionStorage.key(i);
        if (storageKey && storageKey.startsWith(key.split('_')[0] + '_' + key.split('_')[1])) {
          sessionStorage.removeItem(storageKey);
        }
      }
    });
  }
}

// Create singleton instance
let instanceManager = null;

export function getInstanceManager() {
  if (!instanceManager) {
    instanceManager = new InstanceSessionManager();
  }
  return instanceManager;
}

// React hook for using instance manager
export function useInstanceSession() {
  const manager = getInstanceManager();
  
  return {
    setItem: (key, value) => manager.setItem(key, value),
    getItem: (key) => manager.getItem(key),
    removeItem: (key) => manager.removeItem(key),
    clearInstance: () => manager.clearInstance(),
    hasItem: (key) => manager.hasItem(key),
    instanceId: manager.getInstanceId()
  };
}