// src/main.js - Updated with multi-instance SMART storage and corrected authorizeWithEHR

import './style.css';
import FHIR from 'fhirclient';
import { DataFetcherService } from './dataFetcher.js';
import { EnhancedFHIRChat } from './openaiChatEnhanced.js';
import { UIManager } from './uiManager.js';
import { ChatManager } from './chatManager.js';
import { ConfigManager } from './configManager.js';
import { SessionManager } from './sessionManager.js';
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

    // Build a storage wrapper that prefixes all keys per instance
    this.storage = {
      getItem: key    => this.sessionManager.getItem(key),
      setItem: (k, v) => this.sessionManager.setItem(k, v),
      removeItem: k   => this.sessionManager.removeItem(k)
    };

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

      // Clean up old instances
      this.sessionManager.cleanupOldInstances();

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

      // Check if we have existing patient context for this instance
      if (this.sessionManager.hasValidPatientContext()) {
        console.log('Found existing patient context for this instance');
        await this.restoreInstanceState();
      } else {
        // Initialize welcome message
        this.uiManager.displayWelcomeMessage();
        console.log('Welcome message displayed');

        // Parse SMART launch parameters
        const params = new URLSearchParams(window.location.search);
        const launchToken = params.get('launch');
        const iss = params.get('iss');

        console.log('Launch params:', {
          launchToken: !!launchToken,
          iss: !!iss,
          hasSmartKey: !!this.sessionManager.getItem('SMART_KEY'),
          instanceKey: this.sessionManager.instanceKey,
          isEmbedded: window.self !== window.top
        });

        if (this.sessionManager.getItem('SMART_KEY')) {
          // Already authorized for this instance
          await this.initializeWithSMARTClient();
        } else if (launchToken && iss) {
          // New SMART launch
          await this.authorizeWithEHR(launchToken, iss);
        } else {
          // No SMART context
          this.uiManager.showLoading(false);
          this.uiManager.displayError("This app requires an EHR launch or manual configuration.");
          this.chatManager.setupChatInterface();
        }
      }

      // Mark this instance as initialized
      this.sessionManager.markInitialized();

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
      this.uiManager.displayPatientHeaderInfo(
        patientContext.patientData,
        { state: { tokenResponse: patientContext.contextData } }
      );
    }

    // Restore data cache
    this.dataCache = this.sessionManager.getDataCache();

    // Restore chat history
    const chatHistory = this.sessionManager.getChatHistory();
    if (chatHistory && chatHistory.length > 0) {
      this.chatManager.chatHistory = chatHistory;
      chatHistory.forEach(msg => {
        this.uiManager.addChatMessage(msg.role, msg.content, msg.toolCalls);
      });
    }

    // Initialize SMART client if we have stored state
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
      // Pass in our instance-scoped storage wrapper!
      const client = await FHIR.oauth2.ready({ storage: this.storage });
      this.smartClient = client;
      window.smartClient = client; // For debugging

      // --- Enhanced OAuth Debug Logging ---
      const tokenResponse = client.state.tokenResponse || {};
      console.log('✅ SMART OAuth Scopes Granted:', tokenResponse.scope || '[none]');
      console.log('🧠 Context Information:', {
        patient: client.getPatientId(),
        user: client.getUserId(),
        instanceKey: this.sessionManager.instanceKey
      });

      const decoded = decodeJWT(tokenResponse.access_token || '');
      console.log(
        decoded
          ? { '🔍 Decoded Token Payload': decoded }
          : '⚠️ Token is not a decodable JWT or malformed.'
      );
      console.log('📦 Full SMART Client State:', client.state);

      // Store SMART state for this instance
      const smartKey = this.sessionManager.getItem('SMART_KEY');
      if (smartKey) {
        this.sessionManager.storeSMARTState(smartKey, client.state);
      }

      // --- Initialize Services ---
      this.dataFetcher = new DataFetcherService(client, APP_CONFIG.BACKEND_PROXY_URL);

      if (APP_CONFIG.OPENAI_API_KEY) {
        this.enhancedChat = new EnhancedFHIRChat(
          APP_CONFIG.OPENAI_API_KEY,
          client,
          APP_CONFIG.BACKEND_PROXY_URL
        );
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

    const currentContext = this.sessionManager.getPatientContext();
    if (
      currentContext.patId !== newContext.patientId ||
      currentContext.csn   !== newContext.csn
    ) {
      console.log('Patient context has changed!', { old: currentContext, new: newContext });

      // Clear and re-key this instance
      this.sessionManager.clearInstance();
      this.sessionManager.instanceKey = `ctx_${newContext.patientId}_${newContext.csn}`;
      console.log('Updated instance key:', this.sessionManager.instanceKey);

      this.uiManager.displayError(
        'Patient context has changed. Reloading for new patient...',
        { autoReload: true }
      );
      setTimeout(() => window.location.reload(), 2000);
    }
  }

  startEmbeddedContextMonitoring() {
    this.contextMonitorInterval = setInterval(() => {
      const change = this.sessionManager.detectContextChange();
      if (change.changed) {
        console.log('Context change detected:', change);
        clearInterval(this.contextMonitorInterval);
        this.uiManager.displayError(
          'Patient context has changed. Please refresh to load new data.',
          { oldPatient: change.oldContext.patId, newPatient: change.newContext.patId }
        );
        setTimeout(() => {
          if (confirm('Patient context changed. Reload with new patient?')) {
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
    try {
      const payload = JSON.parse(atob(launchToken.split('.')[1]));
      if (payload.client_id) {
        clientId = payload.client_id;
        console.log('✅ Extracted client_id from launch token:', clientId);
      }
    } catch (err) {
      console.error('❌ Failed to decode launch token:', err);
    }

    this.uiManager.showLoading(true);
    try {
      const stateParam = crypto.randomUUID();
      this.storage.setItem('oauth_state', stateParam);

      console.log('Using OAuth state parameter:', stateParam);
      await FHIR.oauth2.authorize({
        client_id:    clientId,
        scope:        this.buildAuthScope(),
        redirect_uri: APP_CONFIG.REDIRECT_URI,
        iss,
        launch:       launchToken,
        state:        stateParam,
        storage:      this.storage  // fixed: reference instance-scoped storage
      });
    } catch (err) {
      this.uiManager.displayError(`Auth error: ${err.message}`, err);
    }
  }

  buildAuthScope() {
    return [
      'launch', 'launch/patient', 'patient/*.read',
      'observation/*.read', 'medication/*.read', 'encounter/*.read',
      'condition/*.read', 'diagnosticreport/*.read',
      'documentreference/*.read', 'allergyintolerance/*.read',
      'appointment/*.read', 'immunization/*.read', 'procedure/*.read',
      'questionnaire/*.read', 'questionnaireresponse/*.read',
      'binary/*.read', 'openid', 'fhirUser',
      'context-user', 'context-fhirUser', 'context-enc_date',
      'context-user_ip', 'context-syslogin', 'context-user_timestamp',
      'context-workstation_id', 'context-csn', 'context-pat_id'
    ].join(' ');
  }

  async loadInitialData() {
    this.uiManager.showLoading(true);
    try {
      await this.loadPatientData();
      const encounterBundle = await this.dataFetcher.fetchData('Encounters', { count: 1, useCache: true });
      this.processBatchResults([{ type: 'Encounters', data: encounterBundle, success: true }]);
      this.sessionManager.storeDataCache(this.dataCache);
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

      const name = patientData.name?.[0]?.text ||
                   `${patientData.name?.[0]?.given?.join(' ')} ${patientData.name?.[0]?.family}`;

      this.sessionManager.storePatientContext(
        { id: patientData.id, name, ...patientData },
        this.smartClient.state.tokenResponse || {}
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
        if (data?.entry?.length) {
          console.log(`📄 First ${type} resource:`, data.entry[0].resource);
        }
      } else {
        console.error(`Failed to load ${type}:`, error);
        this.dataCache[type.toLowerCase()] = { entry: [] };
      }
    });
    this.sessionManager.storeDataCache(this.dataCache);
  }

  setupEventListeners() {
    this.uiManager.setupUIListeners();

    this.chatManager.on('searchPerformed', searchData => {
      this.uiManager.addToSearchHistory(searchData);
    });

    this.chatManager.on('dataRequested', async resourceType => {
      if (!this.dataCache[resourceType.toLowerCase()]) {
        try {
          const data = await this.dataFetcher.fetchData(resourceType);
          this.dataCache[resourceType.toLowerCase()] = data;
          this.sessionManager.storeDataCache(this.dataCache);
          return data;
        } catch (err) {
          console.error(`Failed to fetch ${resourceType}:`, err);
          return null;
        }
      }
      return this.dataCache[resourceType.toLowerCase()];
    });

    this.uiManager.on('chatMessageAdded', () => {
      this.sessionManager.storeChatHistory(this.chatManager.chatHistory);
    });

    this.uiManager.on('refreshData', async () => {
      this.dataFetcher.clearCache();
      await this.loadInitialData();
    });

    this.uiManager.on('exportRequested', type => {
      const timestamp = new Date().toISOString().split('T')[0];
      if (type === 'chat') {
        const exportData = this.chatManager.exportChatHistory();
        this.downloadJSON(exportData, `ehr-assistant-chat-${timestamp}.json`);
      } else if (type === 'data') {
        const exportData = {
          patient:      this.dataCache.patient,
          dataSnapshot: this.dataCache,
          timestamp:    new Date().toISOString(),
          instanceKey:  this.sessionManager.instanceKey
        };
        this.downloadJSON(exportData, `ehr-data-snapshot-${timestamp}.json`);
      }
    });

    this.uiManager.on('chatCleared', () => {
      this.chatManager.clearConversation();
      this.sessionManager.storeChatHistory([]);
    });
  }

  downloadJSON(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
