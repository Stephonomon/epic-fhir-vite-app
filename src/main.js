// src/main.js - Complete version with OAuth handling and multi-instance support
import './style.css';
import FHIR from 'fhirclient';
import { DataFetcherService } from './dataFetcher.js';
import { EnhancedFHIRChat } from './openaiChatEnhanced.js';
import { UIManager } from './uiManager.js';
import { ChatManager } from './chatManager.js';
import { ConfigManager } from './configManager.js';
import { marked } from 'marked';
import { getInstanceManager } from './instanceSessionManager.js';

// --- Configuration ---
const APP_CONFIG = {
  CLIENT_ID: '023dda75-b5e9-4f99-9c0b-dc5704a04164', // Your Epic client ID
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
    // Initialize instance manager
    this.instanceManager = getInstanceManager();
  }

  async init() {
    try {
      console.log('Initializing EHR Assistant App...');
      console.log('Instance ID:', this.instanceManager.getInstanceId());
      console.log('Current URL:', window.location.href);
      
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

      // Check if we're in an OAuth callback
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const launchToken = params.get('launch');
      const iss = params.get('iss');
      
      console.log('URL Parameters:', {
        hasCode: !!code,
        hasState: !!state,
        hasLaunch: !!launchToken,
        hasIss: !!iss,
        instanceId: params.get('instanceId')
      });

      // Check if this is an OAuth callback
      if (code && state) {
        console.log('OAuth callback detected, handling authentication...');
        await this.handleOAuthCallback();
      } 
      // Check for existing SMART context
      else if (await this.hasValidSmartContext()) {
        console.log('Existing SMART context found');
        await this.initializeWithSMARTClient();
      } 
      // Check for launch parameters
      else if (launchToken && iss) {
        console.log('Launch parameters found, starting authorization...');
        await this.authorizeWithEHR(launchToken, iss);
      } 
      else {
        this.uiManager.showLoading(false);
        this.uiManager.displayError("This app requires an EHR launch. Please launch from within Epic.");
        this.chatManager.setupChatInterface();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      this.uiManager.displayError(`Initialization error: ${error.message}`, error);
    }
  }

  async hasValidSmartContext() {
    // Check multiple possible storage locations
    const checks = [
      () => this.instanceManager.hasItem('SMART_KEY'),
      () => !!sessionStorage.getItem('SMART_KEY'),
      () => !!sessionStorage.getItem(`${this.instanceManager.getInstanceId()}_SMART_KEY`)
    ];
    
    for (const check of checks) {
      if (check()) {
        console.log('Found SMART context in storage');
        return true;
      }
    }
    
    return false;
  }

  async handleOAuthCallback() {
    try {
      console.log('Processing OAuth callback...');
      
      // Create storage adapter that works with both instance and regular storage
      const storageAdapter = {
        get: (key) => {
          // Try multiple locations
          const locations = [
            () => this.instanceManager.getItem(key),
            () => sessionStorage.getItem(key),
            () => sessionStorage.getItem(`${this.instanceManager.getInstanceId()}_${key}`)
          ];
          
          for (const getter of locations) {
            const value = getter();
            if (value) {
              console.log(`Found ${key} in storage`);
              return value;
            }
          }
          return null;
        },
        set: (key, value) => {
          // Set in multiple locations for compatibility
          this.instanceManager.setItem(key, value);
          sessionStorage.setItem(key, value);
          sessionStorage.setItem(`${this.instanceManager.getInstanceId()}_${key}`, value);
        },
        unset: (key) => {
          this.instanceManager.removeItem(key);
          sessionStorage.removeItem(key);
          sessionStorage.removeItem(`${this.instanceManager.getInstanceId()}_${key}`);
        }
      };

      // Complete the OAuth flow
      const client = await FHIR.oauth2.completeAuth({
        storage: storageAdapter
      });
      
      console.log('OAuth completed successfully');
      
      // Store the client for later use
      this.smartClient = client;
      window.smartClient = client;
      
      // Continue with initialization
      await this.continueInitialization();
      
    } catch (error) {
      console.error('OAuth callback error:', error);
      this.uiManager.displayError(`Authentication failed: ${error.message}`, error);
    }
  }

  async initializeWithSMARTClient() {
    try {
      console.log('Initializing with SMART client...');
      
      // Create storage adapter
      const storageAdapter = {
        get: (key) => {
          const locations = [
            () => this.instanceManager.getItem(key),
            () => sessionStorage.getItem(key),
            () => sessionStorage.getItem(`${this.instanceManager.getInstanceId()}_${key}`)
          ];
          
          for (const getter of locations) {
            const value = getter();
            if (value) return value;
          }
          return null;
        },
        set: (key, value) => {
          this.instanceManager.setItem(key, value);
          sessionStorage.setItem(key, value);
        },
        unset: (key) => {
          this.instanceManager.removeItem(key);
          sessionStorage.removeItem(key);
        }
      };

      // Get the ready client
      const client = await FHIR.oauth2.ready({
        storage: storageAdapter
      });
      
      this.smartClient = client;
      window.smartClient = client;
      
      console.log('SMART client ready:', {
        patientId: client.patient?.id,
        userId: client.user?.id,
        instanceId: this.instanceManager.getInstanceId()
      });
      
      await this.continueInitialization();
      
    } catch (err) {
      console.error('SMART initialization error:', err);
      this.uiManager.displayError(`SMART init error: ${err.message}`, err);
    }
  }

  async continueInitialization() {
    try {
      // Validate we have a valid client
      if (!this.smartClient) {
        throw new Error('No SMART client available');
      }
      
      // Store patient ID for this instance
      if (this.smartClient.patient?.id) {
        this.instanceManager.setItem('currentPatientId', this.smartClient.patient.id);
      }

      // Log token information
      const tokenResponse = this.smartClient.state?.tokenResponse || {};
      console.log('Token info:', {
        hasAccessToken: !!tokenResponse.access_token,
        scopes: tokenResponse.scope,
        patient: this.smartClient.patient?.id,
        user: this.smartClient.user?.id,
        csn: tokenResponse.csn,
        pat_id: tokenResponse.pat_id
      });

      // Initialize services
      this.dataFetcher = new DataFetcherService(this.smartClient, APP_CONFIG.BACKEND_PROXY_URL);

      if (APP_CONFIG.OPENAI_API_KEY) {
        this.enhancedChat = new EnhancedFHIRChat(
          APP_CONFIG.OPENAI_API_KEY, 
          this.smartClient, 
          APP_CONFIG.BACKEND_PROXY_URL
        );
        this.chatManager.setEnhancedChat(this.enhancedChat);
        console.log('Enhanced FHIR chat initialized');
      }

      // Load initial data
      await this.loadInitialData();
      this.chatManager.setupChatInterface();
      this.chatManager.setDataContext(this.dataCache);

      console.log('Initialization complete for instance:', this.instanceManager.getInstanceId());
      
    } catch (error) {
      console.error('Continuation error:', error);
      throw error;
    }
  }

  async authorizeWithEHR(launchToken, iss) {
    if (!this.isAbsoluteUrl(iss)) {
      this.uiManager.displayError(`Invalid 'iss' parameter: ${iss}`);
      return;
    }

    // Extract client_id from launch token if possible
    let clientId = APP_CONFIG.CLIENT_ID || '023dda75-b5e9-4f99-9c0b-dc5704a04164';

    try {
      const payload = JSON.parse(atob(launchToken.split('.')[1]));
      if (payload.client_id) {
        clientId = payload.client_id;
        console.log('Extracted client_id from launch token:', clientId);
      }
    } catch (err) {
      console.warn('Could not decode launch token:', err);
    }

    this.uiManager.showLoading(true);

    try {
      // Store the current instance ID for after redirect
      sessionStorage.setItem('currentInstanceId', this.instanceManager.getInstanceId());
      
      // Build redirect URI with instance ID
      const redirectUri = `${APP_CONFIG.REDIRECT_URI}?instanceId=${this.instanceManager.getInstanceId()}`;
      
      console.log('Starting authorization with:', {
        clientId,
        redirectUri,
        iss,
        instanceId: this.instanceManager.getInstanceId()
      });

      // Create storage adapter
      const storageAdapter = {
        get: (key) => {
          return this.instanceManager.getItem(key) || sessionStorage.getItem(key);
        },
        set: (key, value) => {
          this.instanceManager.setItem(key, value);
          sessionStorage.setItem(key, value);
        },
        unset: (key) => {
          this.instanceManager.removeItem(key);
          sessionStorage.removeItem(key);
        }
      };

      await FHIR.oauth2.authorize({
        client_id: clientId,
        scope: this.buildAuthScope(),
        redirect_uri: redirectUri,
        iss,
        launch: launchToken,
        storage: storageAdapter
      });
    } catch (err) {
      this.uiManager.displayError(`Auth error: ${err.message}`, err);
    }
  }

  buildAuthScope() {
    return 'launch launch/patient patient/*.read observation/*.read medication/*.read encounter/*.read condition/*.read diagnosticreport/*.read documentreference/*.read allergyintolerance/*.read appointment/*.read immunization/*.read procedure/*.read questionnaire/*.read questionnaireresponse/*.read binary/*.read openid fhirUser ' +
           'context-user context-fhirUser context-enc_date context-user_ip context-syslogin ' +
           'context-user_timestamp context-workstation_id context-csn context-pat_id';
  }

  async loadInitialData() {
    this.uiManager.showLoading(true);
    try {
      // Validate client state before attempting to fetch
      if (!this.smartClient?.state?.tokenResponse?.access_token) {
        throw new Error('Invalid SMART client state - no access token');
      }
      
      await this.loadPatientData();

      const encounterBundle = await this.dataFetcher.fetchData('Encounters', {
        count: 1,
        useCache: true
      });
      
      this.processBatchResults([
        { type: 'Encounters', data: encounterBundle, success: true }
      ]);

    } catch (err) {
      console.error('Load initial data error:', err);
      this.uiManager.displayError(`Failed to load initial data: ${err.message}`, err);
    } finally {
      this.uiManager.showLoading(false);
    }
  }

  async loadPatientData() {
    try {
      const patientData = await this.dataFetcher.fetchData('Patient');
      this.dataCache.patient = patientData;
      this.instanceManager.setItem('currentPatientId', patientData.id);
      this.uiManager.displayPatientHeaderInfo(patientData, this.smartClient);
      console.log("Patient resource loaded:", patientData);
    } catch (error) {
      console.error('Patient fetch error:', error);
      throw new Error(`Failed to fetch patient data: ${error.message}`);
    }
  }

  processBatchResults(results) {
    results.forEach(({ type, data, success, error }) => {
      if (success) {
        this.dataCache[type.toLowerCase()] = data;
        console.log(`${type} data loaded:`, data?.entry?.length || 0, "entries");
        
        if (data?.entry?.length > 0) {
          console.log(`📄 First ${type} resource:`, data.entry[0].resource);
        }
      } else {
        console.error(`Failed to load ${type}:`, error);
        this.dataCache[type.toLowerCase()] = { entry: [] };
      }
    });
  }

  setupEventListeners() {
    // UI toggles
    this.uiManager.setupUIListeners();

    // Chat interface events
    this.chatManager.on('searchPerformed', (searchData) => {
      this.uiManager.addToSearchHistory(searchData);
    });

    this.chatManager.on('dataRequested', async (resourceType) => {
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
        exportData.instanceId = this.instanceManager.getInstanceId();
        this.downloadJSON(exportData, `ehr-assistant-chat-${new Date().toISOString().split('T')[0]}.json`);
      } else if (type === 'data') {
        const exportData = {
          patient: this.dataCache.patient,
          dataSnapshot: this.dataCache,
          instanceId: this.instanceManager.getInstanceId(),
          timestamp: new Date().toISOString()
        };
        this.downloadJSON(exportData, `ehr-data-snapshot-${new Date().toISOString().split('T')[0]}.json`);
      }
    });

    // Clean up old instances periodically
    setInterval(() => {
      this.instanceManager.cleanupOldInstances();
    }, 60 * 60 * 1000); // Every hour
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