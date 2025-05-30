// src/configManager.js
// Simplified configuration management for the EHR Assistant

export class ConfigManager {
  constructor() {
    this.config = {
      // Fixed configuration - no toggles needed
      useEnhancedChat: true,
      enableDataInspector: true,
      enableExport: true,
      
      // Display settings
      vitalsCount: 10,
      medsCount: 10,
      encounterCount: 10,
      conditionCount: 10,
      allergyCount: 10,
      immunizationCount: 10,
      procedureCount: 10,
      reportCount: 10,
      documentCount: 10,
      appointmentCount: 10,
      
      // Cache settings
      enableCache: true,
      cacheTimeout: 300000, // 5 minutes
      
      // UI settings
      theme: 'light',
      compactView: false,
      showTimestamps: true,
      autoExpandResults: false
    };
    
    this.eventHandlers = new Map();
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }

  // Get a specific config value
  get(key) {
    return this.config[key];
  }

  // Event emitter methods (kept for compatibility)
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  off(event, handler) {
    if (this.eventHandlers.has(event)) {
      const handlers = this.eventHandlers.get(event);
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  emit(event, ...args) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => handler(...args));
    }
  }

  // Get resource-specific settings
  getResourceSettings(resourceType) {
    const resourceKey = resourceType.toLowerCase();
    return {
      included: true, // Always included
      count: this.config[`${resourceKey}Count`] ?? 10
    };
  }

  // Get all enabled resources (all are enabled)
  getEnabledResources() {
    return [
      'Patient', 'Vitals', 'Meds', 'Encounters', 'Conditions',
      'Allergies', 'Immunizations', 'Procedures', 'DiagnosticReports',
      'Documents', 'Appointments', 'Questionnaires'
    ];
  }
}