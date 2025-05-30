// src/main.js - Updated with multi-instance support
import './style.css';
import FHIR from 'fhirclient';
import { DataFetcherService } from './dataFetcher.js';
import { EnhancedFHIRChat } from './openaiChatEnhanced.js';
import { UIManager } from './uiManager.js';
import { ChatManager } from './chatManager.js';
import { ConfigManager } from './configManager.js';
import { SessionManager } from './sessionManager.js';
import EmbeddedDebugger from './embeddedDebug.js';
import { epicEmbeddedHandler } from './epicEmbeddedHandler.js';
import { marked } from 'marked';

// --- Configuration ---
const APP_CONFIG = {
  REDIRECT_URI: window.location.origin + window.location.pathname,
  BACKEND_PROXY_URL: 'https://snp-vite-backend.onrender.com/api/fhir-proxy',
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY,
  DEFAULT_RESOURCE_COUNT: 50,
  CACHE_TIMEOUT: 300000 // 5 minutes
};

// --- Application Class ---
class EHRAssistantApp {
  constructor() {
    // Initialize session manager first
    this.sessionManager = new SessionManager();
    
    // Initialize debug utility if in embedded mode or dev environment
    if (window.self !== window.top || window.location.hostname === 'localhost') {
      this.debugger = new EmbeddedDebugger();
      this.debugger.createDebugPanel();
      console.log('🔍 Embedded debugger initialized');
    }
    
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
      console.log('Instance Key:', this.sessionManager.instanceKey);
      console.log('Is Embedded:', window.self !== window.top);
      
      // Clean up stale instances (more aggressive in embedded mode)
      this.sessionManager.cleanupStaleInstances();
      
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

      // Check for context changes in embedded mode
      if (window.self !== window.top) {
        const contextChange = this.sessionManager.detectContextChange();
        if (contextChange.changed) {
          console.log('Context change detected:', contextChange);
          // Clear the old instance data
          this.sessionManager.clearInstance();
        }
      }

      // Check if we have existing patient context for this instance
      if (this.sessionManager.hasValidPatientContext()) {
        console.log('Found existing patient context for this instance');
        await this.restoreInstanceState();
      } else {
        // Initialize welcome message
        this.uiManager.displayWelcomeMessage();
        console.log('Welcome message displayed');

        // Check for SMART launch parameters
        const params = new URLSearchParams(window.location.search);
        const launchToken = params.get('launch');
        const iss = params.get('iss');
        
        console.log('Launch params:', { 
          launchToken: !!launchToken, 
          iss: !!iss, 
          hasSmartKey: !!sessionStorage.getItem('SMART_KEY'),
          instanceKey: this.sessionManager.instanceKey,
          isEmbedded: window.self !== window.top
        });

        if (sessionStorage.getItem('SMART_KEY')) {
          await this.initializeWithSMARTClient();
        } else if (launchToken && iss) {
          await this.authorizeWithEHR(launchToken, iss);
        } else {
          this.uiManager.showLoading(false);
          this.uiManager.displayError("This app requires an EHR launch or manual configuration.");
          this.chatManager.setupChatInterface();
        }
      }
      
      // Mark this instance as initialized
      this.sessionManager.markInitialized();
      
      // Set up periodic context check for embedded mode
      if (window.self !== window.top) {
        this.startEmbeddedContextMonitoring();
        
        // Initialize Epic embedded handler
        epicEmbeddedHandler.init();
        epicEmbeddedHandler.startContextPolling();
        
        // Listen for Epic context changes
        window.addEventListener('epic-embedded-context-change', (event) => {
          console.log('🔄 Epic context change event received:', event.detail);
          this.handleEpicContextChange(event.detail);
        });
      }
      
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  async restoreInstanceState() {
    console.log('Restoring instance state...');
    
    // Restore patient context
    const patientContext = this.sessionManager.getPatientContext();
    if (patientContext.patientData) {
      this.uiManager.displayPatientHeaderInfo(patientContext.patientData, {
        state: {
          tokenResponse: patientContext.contextData
        }
      });
    }
    
    // Restore data cache
    this.dataCache = this.sessionManager.getDataCache();
    
    // Restore chat history
    const chatHistory = this.sessionManager.getChatHistory();
    if (chatHistory && chatHistory.length > 0) {
      this.chatManager.chatHistory = chatHistory;
      // Re-display chat messages
      chatHistory.forEach(msg => {
        this.uiManager.addChatMessage(msg.role, msg.content, msg.toolCalls);
      });
    }
    
    // Initialize SMART client if we have the state
    const smartState = this.sessionManager.getSMARTState();
    if (smartState) {
      await this.initializeWithSMARTClient();
    }
    
    this.chatManager.setupChatInterface();
  }

  async initializeWithSMARTClient() {
    function decodeJWT(token) {
      try {
        const payload = token.split('.')[1];
        const decoded = atob(payload);
        return JSON.parse(decoded);
      } catch (err) {
        console.warn('JWT decode error:', err);
        return null;
      }
    }

    try {
      const client = await FHIR.oauth2.ready();
      this.smartClient = client;
      window.smartClient = client; // For debugging

      // --- Enhanced OAuth Debug Logging ---
      const tokenResponse = client.state.tokenResponse || {};
      const accessToken = tokenResponse.access_token || '';

      console.log('✅ SMART OAuth Scopes Granted:', tokenResponse.scope || '[none]');
      console.log('🧠 Context Information:', {
        patient: client.getPatientId(),
        user: client.getUserId(),
        instanceKey: this.sessionManager.instanceKey
      });

      const decoded = decodeJWT(accessToken);
      if (decoded) {
        console.log('🔍 Decoded Access Token Payload:', decoded);
      } else {
        console.log('⚠️ Token is not a decodable JWT or malformed.');
      }

      console.log('📦 Full SMART Client State:', client.state);

      // Store SMART state for this instance
      const smartKey = sessionStorage.getItem('SMART_KEY');
      if (smartKey) {
        this.sessionManager.storeSMARTState(smartKey, client.state);
      }

      // --- Initialize Services ---
      this.dataFetcher = new DataFetcherService(client, APP_CONFIG.BACKEND_PROXY_URL);

      if (APP_CONFIG.OPENAI_API_KEY) {
        this.enhancedChat = new EnhancedFHIRChat(APP_CONFIG.OPENAI_API_KEY, client, APP_CONFIG.BACKEND_PROXY_URL);
        this.chatManager.setEnhancedChat(this.enhancedChat);
        console.log('🧠 Enhanced FHIR chat initialized');
      }

      await this.loadInitialData();
      this.chatManager.setupChatInterface();
      this.chatManager.setDataContext(this.dataCache);

      console.log("Patient data loaded for instance:", this.sessionManager.instanceKey);
    } catch (err) {
      this.uiManager.displayError(`SMART init error: ${err.message}`, err);
    }
  }

  handleEpicContextChange(newContext) {
    console.log('🏥 Handling Epic context change:', newContext);
    
    // Get current context
    const currentContext = this.sessionManager.getPatientContext();
    
    // Check if patient has actually changed
    if (currentContext.patId !== newContext.patientId || 
        currentContext.csn !== newContext.csn) {
      
      console.log('Patient context has changed!');
      console.log('Old:', { patId: currentContext.patId, csn: currentContext.csn });
      console.log('New:', { patId: newContext.patientId, csn: newContext.csn });
      
      // Clear current instance data
      this.sessionManager.clearInstance();
      
      // Update instance key to be context-based
      const oldKey = this.sessionManager.instanceKey;
      this.sessionManager.instanceKey = `ctx_${newContext.patientId}_${newContext.csn}`;
      console.log('Updated instance key:', this.sessionManager.instanceKey);
      
      // Show notification
      this.uiManager.displayError(
        'Patient context has changed. Reloading for new patient...',
        { autoReload: true }
      );
      
      // Auto-reload after a short delay
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    }
  }

  startEmbeddedContextMonitoring() {
    // Monitor for context changes every 5 seconds in embedded mode
    this.contextMonitorInterval = setInterval(() => {
      const contextChange = this.sessionManager.detectContextChange();
      if (contextChange.changed) {
        console.log('Context change detected during monitoring:', contextChange);
        
        // Show a notification to the user
        this.uiManager.displayError(
          'Patient context has changed. Please refresh the page to load the new patient data.',
          { 
            oldPatient: contextChange.oldContext.patId,
            newPatient: contextChange.newContext.patId 
          }
        );
        
        // Stop monitoring to prevent repeated alerts
        clearInterval(this.contextMonitorInterval);
        
        // Optionally, auto-refresh after a delay
        setTimeout(() => {
          if (confirm('The patient context has changed. Would you like to reload with the new patient?')) {
            window.location.reload();
          }
        }, 1000);
      }
    }, 5000);
  }

  async authorizeWithEHR(launchToken, iss) {
    if (!this.isAbsoluteUrl(iss)) {
      this.uiManager.displayError(`Invalid 'iss' parameter: ${iss}`);
      return;
    }

    let clientId = APP_CONFIG.CLIENT_ID;

    // Try to decode launch token to extract dynamic client_id
    try {
      const payload = JSON.parse(atob(launchToken.split('.')[1]));
      if (payload.client_id) {
        clientId = payload.client_id;
        console.log('✅ Extracted client_id from launch token:', clientId);
      } else {
        console.warn('⚠️ client_id not found in launch token payload');
      }
    } catch (err) {
      console.error('❌ Failed to decode launch token:', err);
    }

    this.uiManager.showLoading(true);

    try {
      // For embedded mode, we need to be careful about the state parameter
      let stateParam;
      
      if (window.self !== window.top) {
        // In embedded mode, use a simpler state that Epic can handle
        stateParam = `embed_${Date.now()}`;
      } else {
        // In external browser mode, use the instance key
        stateParam = this.sessionManager.instanceKey;
      }
      
      console.log('Using OAuth state parameter:', stateParam);
      
      await FHIR.oauth2.authorize({
        client_id: clientId,
        scope: this.buildAuthScope(),
        redirect_uri: APP_CONFIG.REDIRECT_URI,
        iss,
        launch: launchToken,
        state: stateParam
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
      // 1) Always fetch demographics
      await this.loadPatientData();

      // 2) Only fetch the single most-recent encounter
      const encounterBundle = await this.dataFetcher.fetchData('Encounters', {
        count: 1,
        useCache: true
      });
      this.processBatchResults([
        { type: 'Encounters', data: encounterBundle, success: true }
      ]);

      // Save data cache to session
      this.sessionManager.storeDataCache(this.dataCache);

      // 3) Defer everything else until the user navigates or asks
    } catch (err) {
      this.uiManager.displayError(`Failed to load initial data: ${err.message}`, err);
    } finally {
      this.uiManager.showLoading(false);
    }
  }

  async loadPatientData() {
    try {
      const patientData = await this.dataFetcher.fetchData('Patient');
      this.dataCache.patient = patientData;
      
      // Extract patient info
      const name = patientData.name?.[0]?.text || 
                  `${patientData.name?.[0]?.given?.join(' ')} ${patientData.name?.[0]?.family}`;
      
      // Store patient context for this instance
      const contextData = this.smartClient?.state?.tokenResponse || {};
      this.sessionManager.storePatientContext(
        {
          id: patientData.id,
          name: name,
          ...patientData
        },
        {
          patId: contextData.pat_id,
          csn: contextData.csn,
          encounterId: contextData.encounter,
          ...contextData
        }
      );
      
      this.uiManager.displayPatientHeaderInfo(patientData, this.smartClient);
      console.log("✅ Patient resource loaded:", patientData);
    } catch (error) {
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
    
    // Save updated cache to session
    this.sessionManager.storeDataCache(this.dataCache);
  }

  setupEventListeners() {
    // UI toggles
    this.uiManager.setupUIListeners();

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
          
          // Save updated cache to session
          this.sessionManager.storeDataCache(this.dataCache);
          
          return data;
        } catch (error) {
          console.error(`Failed to fetch ${resourceType}:`, error);
          return null;
        }
      }
      return this.dataCache[resourceType.toLowerCase()];
    });

    // Save chat history when messages are added
    this.uiManager.on('chatMessageAdded', () => {
      this.sessionManager.storeChatHistory(this.chatManager.chatHistory);
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
          timestamp: new Date().toISOString(),
          instanceKey: this.sessionManager.instanceKey
        };
        this.downloadJSON(exportData, `ehr-data-snapshot-${new Date().toISOString().split('T')[0]}.json`);
      }
    });

    // Clear chat event
    this.uiManager.on('chatCleared', () => {
      this.chatManager.clearConversation();
      this.sessionManager.storeChatHistory([]);
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
  window.ehrApp = app; // For debugging
  app.init().catch(err => {
    console.error('Failed to initialize app:', err);
  });
});