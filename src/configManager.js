// src/configManager.js
// Configuration management for the EHR Assistant

export class ConfigManager {
  constructor() {
    this.config = {
      // Data inclusion settings
      includePatient: true,
      includeVitals: true,
      includeMeds: true,
      includeEncounters: true,
      includeConditions: true,
      includeAllergies: true,
      includeImmunizations: true,
      includeProcedures: true,
      includeDiagnosticReports: true,
      includeDocuments: true,
      includeAppointments: true,
      includeQuestionnaires: true,
      
      // Feature settings
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
    this.loadFromStorage();
  }

  // Get current configuration
  getConfig() {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(updates) {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...updates };
    
    // Save to storage
    this.saveToStorage();
    
    // Emit change event
    this.emit('configChange', this.config, oldConfig);
    
    // Emit specific events for major changes
    if (oldConfig.useEnhancedChat !== this.config.useEnhancedChat) {
      this.emit('enhancedChatToggled', this.config.useEnhancedChat);
    }
    
    if (oldConfig.theme !== this.config.theme) {
      this.emit('themeChanged', this.config.theme);
    }
  }

  // Get a specific config value
  get(key) {
    return this.config[key];
  }

  // Set a specific config value
  set(key, value) {
    if (this.config.hasOwnProperty(key)) {
      this.updateConfig({ [key]: value });
    } else {
      console.warn(`Unknown config key: ${key}`);
    }
  }

  // Reset to defaults
  resetToDefaults() {
    const defaultConfig = new ConfigManager().config;
    this.updateConfig(defaultConfig);
  }

  // Storage management
  saveToStorage() {
    // Skip localStorage in certain environments
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage not available');
      return;
    }
    
    try {
      localStorage.setItem('ehrAssistantConfig', JSON.stringify(this.config));
    } catch (error) {
      console.warn('Failed to save config to localStorage:', error);
    }
  }

  loadFromStorage() {
    // Skip localStorage in certain environments
    if (typeof localStorage === 'undefined') {
      console.warn('localStorage not available');
      return;
    }
    
    try {
      const stored = localStorage.getItem('ehrAssistantConfig');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new config options
        this.config = { ...this.config, ...parsed };
      }
    } catch (error) {
      console.warn('Failed to load config from localStorage:', error);
    }
  }

  // Event emitter methods
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

  // Export config
  exportConfig() {
    return {
      config: this.config,
      version: '1.0',
      timestamp: new Date().toISOString()
    };
  }

  // Import config
  importConfig(configData) {
    if (configData.config) {
      this.updateConfig(configData.config);
      return true;
    }
    return false;
  }

  // Get resource-specific settings
  getResourceSettings(resourceType) {
    const resourceKey = resourceType.toLowerCase();
    return {
      included: this.config[`include${resourceType}`] ?? true,
      count: this.config[`${resourceKey}Count`] ?? 10
    };
  }

  // Update resource-specific settings
  updateResourceSettings(resourceType, settings) {
    const updates = {};
    
    if (settings.included !== undefined) {
      updates[`include${resourceType}`] = settings.included;
    }
    
    if (settings.count !== undefined) {
      updates[`${resourceType.toLowerCase()}Count`] = settings.count;
    }
    
    if (Object.keys(updates).length > 0) {
      this.updateConfig(updates);
    }
  }

  // Get all enabled resources
  getEnabledResources() {
    const resources = [];
    const resourceTypes = [
      'Patient', 'Vitals', 'Meds', 'Encounters', 'Conditions',
      'Allergies', 'Immunizations', 'Procedures', 'DiagnosticReports',
      'Documents', 'Appointments', 'Questionnaires'
    ];
    
    resourceTypes.forEach(type => {
      if (this.config[`include${type}`]) {
        resources.push(type);
      }
    });
    
    return resources;
  }

  // Validate configuration
  validateConfig() {
    const errors = [];
    
    // Check counts are positive integers
    Object.keys(this.config).forEach(key => {
      if (key.endsWith('Count')) {
        const value = this.config[key];
        if (!Number.isInteger(value) || value < 1) {
          errors.push(`${key} must be a positive integer`);
        }
      }
    });
    
    // Check cache timeout
    if (this.config.cacheTimeout < 0) {
      errors.push('cacheTimeout must be non-negative');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}