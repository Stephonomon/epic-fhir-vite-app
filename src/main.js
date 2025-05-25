// src/main.js - Refactored with modular architecture
import './style.css';
import FHIR from 'fhirclient';
import { DataFetcherService } from './dataFetcher.js';
import { EnhancedFHIRChat } from './openaiChatEnhanced.js';
import { UIManager } from './uiManager.js';
import { ChatManager } from './chatManager.js';
import { ConfigManager } from './configManager.js';
import { marked } from 'marked';

// --- Configuration ---
const APP_CONFIG = {
  CLIENT_ID: '023dda75-b5e9-4f99-9c0b-dc5704a04164',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  BACKEND_PROXY_URL: 'https://snp-vite-backend.onrender.com/api/fhir-proxy',
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY,
  DEFAULT_RESOURCE_COUNT: 50,
  CACHE_TIMEOUT: 300000 // 5 minutes
};

// --- Application Class ---
class EHRAssistantApp {
  constructor() {
    this.smartClient = null;
    this.dataFetcher = null;
    this.enhancedChat = null;
    this.uiManager = null;
    this.chatManager = null;
    this.configManager = null;
    this.dataCache = {};
  }

  async init() {
    try {
      console.log('Initializing EHR Assistant App...');
      
      // Initialize managers
      this.configManager = new ConfigManager();
      console.log('ConfigManager initialized');
      
      this.uiManager = new UIManager(this.configManager);
      console.log('UIManager initialized');
      
      this.chatManager = new ChatManager(this.uiManager, APP_CONFIG.OPENAI_API_KEY);
      console.log('ChatManager initialized');

      // Setup UI event listeners
      this.setupEventListeners();
      console.log('Event listeners setup');

      // Initialize welcome message
      this.uiManager.displayWelcomeMessage();
      console.log('Welcome message displayed');

      // Check for SMART launch parameters
      const params = new URLSearchParams(window.location.search);
      const launchToken = params.get('launch');
      const iss = params.get('iss');
      
      console.log('Launch params:', { launchToken: !!launchToken, iss: !!iss, hasSmartKey: !!sessionStorage.getItem('SMART_KEY') });

      if (sessionStorage.getItem('SMART_KEY')) {
        await this.initializeWithSMARTClient();
      } else if (launchToken && iss) {
        await this.authorizeWithEHR(launchToken, iss);
      } else {
        this.uiManager.showLoading(false);
        this.uiManager.displayError("This app requires an EHR launch or manual configuration.");
        this.chatManager.setupChatInterface();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  async initializeWithSMARTClient() {
    try {
      const client = await FHIR.oauth2.ready();
      this.smartClient = client;
      window.smartClient = client; // For debugging

      // Initialize services
      this.dataFetcher = new DataFetcherService(client, APP_CONFIG.BACKEND_PROXY_URL);
      
      if (this.configManager.getConfig().useEnhancedChat && APP_CONFIG.OPENAI_API_KEY) {
        this.enhancedChat = new EnhancedFHIRChat(APP_CONFIG.OPENAI_API_KEY, client, APP_CONFIG.BACKEND_PROXY_URL);
        this.chatManager.setEnhancedChat(this.enhancedChat);
        console.log('Enhanced FHIR chat initialized');
      }

      // Load initial data
      await this.loadInitialData();

      // Setup chat interface
      this.chatManager.setupChatInterface();
      this.chatManager.setDataContext(this.dataCache);

      console.log("All patient data loaded successfully");
    } catch (err) {
      this.uiManager.displayError(`SMART init error: ${err.message}`, err);
    }
  }

  async authorizeWithEHR(launchToken, iss) {
    if (!this.isAbsoluteUrl(iss)) {
      this.uiManager.displayError(`Invalid 'iss' parameter: ${iss}`);
      return;
    }

    this.uiManager.showLoading(true);
    
    try {
      await FHIR.oauth2.authorize({
        client_id: APP_CONFIG.CLIENT_ID,
        scope: this.buildAuthScope(),
        redirect_uri: APP_CONFIG.REDIRECT_URI,
        iss,
        launch: launchToken,
      });
    } catch (err) {
      this.uiManager.displayError(`Auth error: ${err.message}`, err);
    }
  }

  buildAuthScope() {
    // Use wildcard scopes like the original code
    return 'launch launch/patient patient/*.read observation/*.read medication/*.read encounter/*.read condition/*.read diagnosticreport/*.read documentreference/*.read allergyintolerance/*.read appointment/*.read immunization/*.read procedure/*.read questionnaire/*.read questionnaireresponse/*.read binary/*.read openid fhirUser ' +
           'context-user context-fhirUser context-enc_date context-user_ip context-syslogin ' +
           'context-user_timestamp context-workstation_id context-csn context-pat_id';
  }

  async loadInitialData() {
    this.uiManager.showLoading(true);
    
    try {
      // Load patient data first
      await this.loadPatientData();

      // Define resource loading groups
      const coreResources = ['VitalSigns', 'MedicationRequests', 'Conditions', 'Encounters'];
      const additionalResources = [
        'AllergyIntolerances', 'Immunizations', 'DiagnosticReports', 
        'Procedures', 'DocumentReferences', 'LabResults', 'Binary'
      ];

      // Load core resources in parallel
      const coreResults = await this.dataFetcher.batchFetch(coreResources, { useCache: true });
      this.processBatchResults(coreResults);

      // Load additional resources in background
      this.dataFetcher.batchFetch(additionalResources, { useCache: true })
        .then(results => this.processBatchResults(results))
        .catch(err => console.warn('Failed to load additional resources:', err));

    } catch (error) {
      this.uiManager.displayError(`Failed to load initial data: ${error.message}`, error);
    } finally {
      this.uiManager.showLoading(false);
    }
  }

  async loadPatientData() {
    try {
      const patientData = await this.dataFetcher.fetchData('Patient');
      this.dataCache.patient = patientData;
      this.uiManager.displayPatientHeaderInfo(patientData, this.smartClient);
      console.log("Patient data loaded");
    } catch (error) {
      throw new Error(`Failed to fetch patient data: ${error.message}`);
    }
  }

  processBatchResults(results) {
    results.forEach(({ type, data, success, error }) => {
      if (success) {
        this.dataCache[type.toLowerCase()] = data;
        console.log(`${type} data loaded:`, data?.entry?.length || 0, "entries");
      } else {
        console.error(`Failed to load ${type}:`, error);
        this.dataCache[type.toLowerCase()] = { entry: [] };
      }
    });
  }

  setupEventListeners() {
    // Settings and UI toggles
    this.uiManager.setupUIListeners();

    // Context configuration changes
    this.configManager.on('configChange', (newConfig) => {
      this.uiManager.updateContextIndicators(newConfig);
      this.chatManager.updateConfig(newConfig);
      
      // Reinitialize enhanced chat if toggled
      if (newConfig.useEnhancedChat && !this.enhancedChat && this.smartClient && APP_CONFIG.OPENAI_API_KEY) {
        this.enhancedChat = new EnhancedFHIRChat(APP_CONFIG.OPENAI_API_KEY, this.smartClient, APP_CONFIG.BACKEND_PROXY_URL);
        this.chatManager.setEnhancedChat(this.enhancedChat);
      }
    });

    // Chat interface events
    this.chatManager.on('searchPerformed', (searchData) => {
      this.uiManager.addToSearchHistory(searchData);
    });

    this.chatManager.on('dataRequested', async (resourceType) => {
      // Fetch data on demand if not cached
      if (!this.dataCache[resourceType.toLowerCase()]) {
        try {
          const data = await this.dataFetcher.fetchData(resourceType);
          this.dataCache[resourceType.toLowerCase()] = data;
          return data;
        } catch (error) {
          console.error(`Failed to fetch ${resourceType}:`, error);
          return null;
        }
      }
      return this.dataCache[resourceType.toLowerCase()];
    });

    // Data refresh
    this.uiManager.on('refreshData', async () => {
      this.dataFetcher.clearCache();
      await this.loadInitialData();
    });

    // Export functionality
    this.uiManager.on('exportRequested', (type) => {
      if (type === 'chat') {
        const exportData = this.chatManager.exportChatHistory();
        this.downloadJSON(exportData, `ehr-assistant-chat-${new Date().toISOString().split('T')[0]}.json`);
      } else if (type === 'data') {
        const exportData = {
          patient: this.dataCache.patient,
          dataSnapshot: this.dataCache,
          timestamp: new Date().toISOString()
        };
        this.downloadJSON(exportData, `ehr-data-snapshot-${new Date().toISOString().split('T')[0]}.json`);
      }
    });
  }

  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  isAbsoluteUrl(url) {
    return typeof url === 'string' && (url.includes('://') || url.startsWith('//'));
  }
}

// Initialize the app when the document is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new EHRAssistantApp();
  app.init().catch(err => {
    console.error('Failed to initialize app:', err);
  });
});