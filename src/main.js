// src/main.js - Updated with multi-instance SMART storage and complete logic

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
  CLIENT_ID: import.meta.env.VITE_CLIENT_ID,
  OPENAI_API_KEY: import.meta.env.VITE_OPENAI_API_KEY,
  DEFAULT_RESOURCE_COUNT: 50,
  CACHE_TIMEOUT: 300000 // 5 minutes
};

// --- Application Class ---
class EHRAssistantApp {
  constructor() {
    this.sessionManager = new SessionManager();
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
      this.sessionManager.cleanupOldInstances();

      this.configManager = new ConfigManager();
      this.uiManager = new UIManager(this.configManager);
      this.chatManager = new ChatManager(this.uiManager, APP_CONFIG.OPENAI_API_KEY);
      this.setupEventListeners();

      if (this.sessionManager.hasValidPatientContext()) {
        await this.restoreInstanceState();
      } else {
        this.uiManager.displayWelcomeMessage();
        const params = new URLSearchParams(window.location.search);
        const launchToken = params.get('launch');
        const iss = params.get('iss');

        if (this.sessionManager.getItem('SMART_KEY')) {
          await this.initializeWithSMARTClient();
        } else if (launchToken && iss) {
          await this.authorizeWithEHR(launchToken, iss);
        } else {
          this.uiManager.showLoading(false);
          this.uiManager.displayError("This app requires an EHR launch or manual configuration.");
          this.chatManager.setupChatInterface();
        }
      }

      this.sessionManager.markInitialized();
    } catch (error) {
      console.error('Failed to initialize app:', error);
      throw error;
    }
  }

  async restoreInstanceState() {
    const patientContext = this.sessionManager.getPatientContext();
    if (patientContext.patientData) {
      this.uiManager.displayPatientHeaderInfo(
        patientContext.patientData,
        { state: { tokenResponse: patientContext.contextData } }
      );
    }
    this.dataCache = this.sessionManager.getDataCache();

    const chatHistory = this.sessionManager.getChatHistory();
    if (chatHistory?.length) {
      this.chatManager.chatHistory = chatHistory;
      chatHistory.forEach(msg => {
        this.uiManager.addChatMessage(msg.role, msg.content, msg.toolCalls);
      });
    }

    const smartState = this.sessionManager.getSMARTState();
    if (smartState) {
      await this.initializeWithSMARTClient();
    }

    this.chatManager.setupChatInterface();
  }

  async initializeWithSMARTClient() {
    const client = await FHIR.oauth2.ready({ storage: this.storage });
    this.smartClient = client;
    window.smartClient = client;

    console.log('✅ SMART OAuth Scopes:', client.state.tokenResponse.scope);
    console.log('🧠 Context:', {
      patient: client.getPatientId(),
      user: client.getUserId(),
      instanceKey: this.sessionManager.instanceKey
    });

    const smartKey = this.sessionManager.getItem('SMART_KEY');
    if (smartKey) {
      this.sessionManager.storeSMARTState(smartKey, client.state);
    }

    this.dataFetcher = new DataFetcherService(client, APP_CONFIG.BACKEND_PROXY_URL);
    if (APP_CONFIG.OPENAI_API_KEY) {
      this.enhancedChat = new EnhancedFHIRChat(
        APP_CONFIG.OPENAI_API_KEY,
        client,
        APP_CONFIG.BACKEND_PROXY_URL
      );
      this.chatManager.setEnhancedChat(this.enhancedChat);
    }

    await this.loadInitialData();
    this.chatManager.setupChatInterface();
    this.chatManager.setDataContext(this.dataCache);
  }

  async authorizeWithEHR(launchToken, iss) {
    if (!this.isAbsoluteUrl(iss)) {
      this.uiManager.displayError(`Invalid 'iss' parameter: ${iss}`);
      return;
    }

    let clientId = APP_CONFIG.CLIENT_ID;
    try {
      const payload = JSON.parse(atob(launchToken.split('.')[1]));
      if (payload.client_id) clientId = payload.client_id;
    } catch {}

    this.uiManager.showLoading(true);
    try {
      const stateParam = crypto.randomUUID();
      this.storage.setItem('oauth_state', stateParam);
      await FHIR.oauth2.authorize({
        client_id: clientId,
        scope: this.buildAuthScope(),
        redirect_uri: APP_CONFIG.REDIRECT_URI,
        iss,
        launch: launchToken,
        state: stateParam,
        storage: this.storage
      });
    } catch (err) {
      this.uiManager.displayError(`Auth error: ${err.message}`);
    }
  }

  buildAuthScope() {
    return [
      'launch', 'launch/patient', 'patient/*.read',
      'openid', 'fhirUser',
      'context-pat_id', 'context-csn'
    ].join(' ');
  }

  async loadInitialData() {
    this.uiManager.showLoading(true);
    try {
      await this.loadPatientData();
      const encounterBundle = await this.dataFetcher.fetchData('Encounter', { count: 1, useCache: true });
      this.processBatchResults([{ type: 'Encounters', data: encounterBundle, success: true }]);
      this.sessionManager.storeDataCache(this.dataCache);
    } catch (err) {
      this.uiManager.displayError(`Failed to load initial data: ${err.message}`);
    } finally {
      this.uiManager.showLoading(false);
    }
  }

  async loadPatientData() {
    const patientData = await this.dataFetcher.fetchData('Patient');
    this.dataCache.patient = patientData;
    const name = patientData.name?.[0]?.text ||
      `${patientData.name?.[0]?.given.join(' ')} ${patientData.name?.[0]?.family}`;
    this.sessionManager.storePatientContext(
      { id: patientData.id, name, ...patientData },
      this.smartClient.state.tokenResponse
    );
    this.uiManager.displayPatientHeaderInfo(patientData, this.smartClient);
  }

  processBatchResults(results) {
    results.forEach(({ type, data, success }) => {
      this.dataCache[type.toLowerCase()] = success ? data : { entry: [] };
    });
    this.sessionManager.storeDataCache(this.dataCache);
  }

  setupEventListeners() {
    this.uiManager.setupUIListeners();
    this.chatManager.on('searchPerformed', data => this.uiManager.addToSearchHistory(data));
    this.chatManager.on('dataRequested', async type => {
      if (!this.dataCache[type.toLowerCase()]) {
        const data = await this.dataFetcher.fetchData(type);
        this.dataCache[type.toLowerCase()] = data;
        this.sessionManager.storeDataCache(this.dataCache);
        return data;
      }
      return this.dataCache[type.toLowerCase()];
    });
    this.uiManager.on('chatMessageAdded', () => this.sessionManager.storeChatHistory(this.chatManager.chatHistory));
    this.uiManager.on('refreshData', async () => { this.dataFetcher.clearCache(); await this.loadInitialData(); });
    this.uiManager.on('exportRequested', type => {
      const timestamp = new Date().toISOString().split('T')[0];
      const exportData = type === 'chat'
        ? this.chatManager.exportChatHistory()
        : { patient: this.dataCache.patient, dataSnapshot: this.dataCache, timestamp, instanceKey: this.sessionManager.instanceKey };
      this.downloadJSON(exportData, `ehr-${type}-${timestamp}.json`);
    });
    this.uiManager.on('chatCleared', () => { this.chatManager.clearConversation(); this.sessionManager.storeChatHistory([]); });
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
  app.init().catch(err => console.error('Failed to initialize app:', err));
});
