// src/uiManager.js
// Centralized UI management for the EHR Assistant

import { extractPatientInfo } from './fhirUtils.js';
import { marked } from 'marked';

export class UIManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.searchHistory = [];
    this.rawDataCache = {};
    this.eventHandlers = new Map();
    this.setupDOMReferences();
    
    // Configure marked options for better table rendering
    marked.setOptions({
      breaks: true,
      gfm: true,
      tables: true,
      sanitize: false,
      smartLists: true,
      smartypants: true
    });
  }

  setupDOMReferences() {
    // Cache DOM references for performance
    this.dom = {
      loading: document.getElementById('loading'),
      dataInspector: document.getElementById('data-inspector'),
      inspectorToggle: document.getElementById('data-inspector-toggle'),
      inspectorClose: document.getElementById('inspector-close'),
      chatHistory: document.getElementById('chat-history'),
      chatInput: document.getElementById('chat-input'),
      chatSubmit: document.getElementById('chat-submit'),
      clearChatBtn: document.getElementById('clear-chat'),
      exportChatBtn: document.getElementById('export-chat'),
      searchHistoryContainer: document.getElementById('search-history'),
      searchHistoryContent: document.getElementById('search-history-content'),
      rawDataContent: document.getElementById('raw-data-content'),
      dataViewerSelect: document.getElementById('data-viewer-select'),
      rawDataViewer: document.getElementById('raw-data-viewer'),
      copyRawDataBtn: document.getElementById('copy-raw-data'),
      // Patient info elements
      patientNameEl: document.querySelector('.patient-name'),
      patientAgeGenderEl: document.getElementById('patient-age-gender'),
      patientMrnEl: document.getElementById('patient-mrn'),
      patientCsnEl: document.getElementById('patient-csn')
    };
  }

  setupUIListeners() {
    // Data inspector toggle
    this.dom.inspectorToggle?.addEventListener('click', () => this.toggleDataInspector());
    
    // Inspector close button
    this.dom.inspectorClose?.addEventListener('click', () => {
      this.dom.dataInspector.style.display = 'none';
    });
    
    // Clear chat
    this.dom.clearChatBtn?.addEventListener('click', () => {
      this.clearChat();
      this.emit('chatCleared');
    });
    
    // Export chat
    this.dom.exportChatBtn?.addEventListener('click', () => {
      this.emit('exportRequested', 'chat');
    });
    
    // Collapsible section headers
    document.querySelectorAll('.section-header.collapsible').forEach(header => {
      header.addEventListener('click', (e) => {
        const section = e.currentTarget.dataset.section;
        this.toggleSection(section, header);
      });
    });
    
    // Data viewer dropdown
    this.dom.dataViewerSelect?.addEventListener('change', (e) => {
      if (e.target.value) {
        this.showRawData(e.target.value);
      }
    });
    
    // Copy raw data button
    this.dom.copyRawDataBtn?.addEventListener('click', () => {
      const searchId = this.dom.dataViewerSelect.value;
      if (searchId && this.rawDataCache[searchId]) {
        navigator.clipboard.writeText(JSON.stringify(this.rawDataCache[searchId], null, 2));
        this.dom.copyRawDataBtn.innerHTML = '✓';
        setTimeout(() => this.dom.copyRawDataBtn.innerHTML = '📋', 1000);
      }
    });
  }

  // Event emitter methods
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  emit(event, ...args) {
    if (this.eventHandlers.has(event)) {
      this.eventHandlers.get(event).forEach(handler => handler(...args));
    }
  }

  // UI State Management
  showLoading(isLoading) {
    if (this.dom.loading) {
      this.dom.loading.style.display = isLoading ? 'flex' : 'none';
    }
  }

  toggleDataInspector() {
    const isVisible = this.dom.dataInspector.style.display === 'block';
    this.dom.dataInspector.style.display = isVisible ? 'none' : 'block';
  }

  toggleSection(sectionName, headerElement) {
    const content = document.getElementById(`${sectionName}-content`);
    if (!content) return;
    
    const isCollapsed = content.classList.contains('collapsed');
    
    if (isCollapsed) {
      content.classList.remove('collapsed');
      headerElement.classList.add('expanded');
    } else {
      content.classList.add('collapsed');
      headerElement.classList.remove('expanded');
    }
  }

  // Patient Information Display
  displayPatientHeaderInfo(data, clientContext) {
    const patientInfo = extractPatientInfo(data, clientContext);
    
    if (this.dom.patientNameEl) {
      this.dom.patientNameEl.textContent = patientInfo.name;
    }
    if (this.dom.patientAgeGenderEl) {
      this.dom.patientAgeGenderEl.textContent = `${this.calculateAge(patientInfo.birthDate)} / ${patientInfo.gender}`;
    }
    if (this.dom.patientMrnEl) {
      this.dom.patientMrnEl.textContent = `PAT ID: ${patientInfo.patId}`;
    }
    if (this.dom.patientCsnEl) {
      this.dom.patientCsnEl.textContent = `CSN: ${patientInfo.csn}`;
    }
  }

  calculateAge(birthDate) {
    if (!birthDate || birthDate === 'N/A') return 'Unknown';
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  // Chat Interface
  displayWelcomeMessage() {
    const welcomeHTML = `
      <div class="welcome-message">
        <div class="welcome-header">
          <span class="icon">🤖</span>
          <h3>Welcome to EHR Assistant</h3>
        </div>
        <p>I can help you analyze patient data, answer questions about medications, vitals, conditions, and more. Ask me anything about this patient!</p>
        <div class="quick-start">
          <div class="suggested-questions">
            <button class="suggested-question">What are the most recent vital signs?</button>
            <button class="suggested-question">Show me all active medications</button>
            <button class="suggested-question">What problems are currently active?</button>
            <button class="suggested-question">Summarize recent visits</button>
            <button class="suggested-question">Are there any concerning trends?</button>
            <button class="suggested-question">Show lab results from the last year</button>
          </div>
        </div>
      </div>
    `;
    
    this.dom.chatHistory.innerHTML = welcomeHTML;
    this.attachSuggestedQuestionListeners();
  }

  attachSuggestedQuestionListeners() {
    const suggestedQuestions = document.querySelectorAll('.suggested-question');
    suggestedQuestions.forEach(btn => {
      btn.addEventListener('click', () => {
        const question = btn.textContent.trim();
        this.dom.chatInput.value = question;
        this.emit('suggestedQuestionClicked', question);
      });
    });
  }

  addChatMessage(role, content, toolCalls = []) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    
    const timestamp = new Date().toLocaleTimeString();
    
    let toolInfo = '';
    if (toolCalls && toolCalls.length > 0) {
      const tools = toolCalls.map(call => call.function).join(', ');
      toolInfo = `<div class="tool-usage">🔍 Searched: ${tools}</div>`;
    }
    
    // Parse markdown content for assistant messages
    const messageContent = role === 'assistant' ? marked.parse(content) : this.escapeHtml(content);
    
    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-role">${role === 'user' ? 'You' : 'Assistant'}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      ${toolInfo}
      <div class="message-content">${messageContent}</div>
      <div class="message-actions">
        <button onclick="window.uiManager.copyMessage(this)" title="Copy message">📋</button>
        ${role === 'assistant' ? '<button onclick="window.uiManager.askFollowUp(this)" title="Ask follow-up">💬</button>' : ''}
      </div>
    `;
    
    this.dom.chatHistory.appendChild(messageDiv);
    this.dom.chatHistory.scrollTop = this.dom.chatHistory.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  clearChat() {
    this.dom.chatHistory.innerHTML = '';
    this.searchHistory = [];
    this.rawDataCache = {};
    this.updateSearchHistoryDisplay();
    this.displayWelcomeMessage();
  }

  displayError(message, errorObj = null) {
    this.showLoading(false);
    this.addChatMessage('assistant', `**Error:** ${message}${errorObj ? `\n\nDetails: ${errorObj.message}` : ''}`);
    console.error(message, errorObj);
  }

  // Search History and Data Inspector
  addToSearchHistory(searchData) {
    const timestamp = new Date().toLocaleTimeString();
    const searchId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const searchEntry = {
      id: searchId,
      timestamp,
      function: searchData.function,
      parameters: searchData.parameters || {},
      status: searchData.status || 'pending',
      result: searchData.result || null
    };
    
    this.searchHistory.unshift(searchEntry);
    
    // Cache raw data if available
    if (searchData.result) {
      this.rawDataCache[searchId] = searchData.result;
    }
    
    this.updateSearchHistoryDisplay();
    
    return searchId;
  }

  updateSearchHistoryDisplay() {
    if (this.searchHistory.length === 0) {
      this.dom.searchHistoryContainer.innerHTML = '<div class="no-searches">No searches yet. Ask the AI a question to see FHIR queries here.</div>';
      return;
    }
    
    this.dom.searchHistoryContainer.innerHTML = this.searchHistory.slice(0, 10).map(search => `
      <div class="search-entry ${search.status}" data-search-id="${search.id}">
        <div class="search-header">
          <span class="search-function">${search.function}</span>
          <span class="search-time">${search.timestamp}</span>
        </div>
        <div class="search-params">${Object.keys(search.parameters).length ? 
          Object.entries(search.parameters).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(', ') : 
          'No parameters'}</div>
        <div class="search-status">${search.status}</div>
      </div>
    `).join('');
    
    this.updateDataViewerOptions();
  }

  updateDataViewerOptions() {
    const completedSearches = this.searchHistory.filter(s => s.status === 'completed');
    
    this.dom.dataViewerSelect.innerHTML = '<option value="">Select a search result to view</option>';
    
    completedSearches.forEach(search => {
      const option = document.createElement('option');
      option.value = search.id;
      option.textContent = `${search.function} (${search.timestamp})`;
      this.dom.dataViewerSelect.appendChild(option);
    });
  }

  showRawData(searchId) {
    const search = this.searchHistory.find(s => s.id === searchId);
    const rawData = this.rawDataCache[searchId];
    
    if (!search || !rawData) {
      this.dom.rawDataViewer.innerHTML = '<div class="no-data">No data available for this search</div>';
      return;
    }
    
    this.dom.rawDataViewer.innerHTML = `
      <div class="raw-data-header">
        <h5>${search.function}</h5>
        <div class="data-meta">
          <span>Time: ${search.timestamp}</span>
          <span>Entries: ${rawData.entry?.length || rawData.count || 0}</span>
          <span>Total: ${rawData.total || 'Unknown'}</span>
        </div>
      </div>
      <pre class="json-viewer">${JSON.stringify(rawData, null, 2)}</pre>
    `;
  }

  // Global functions for message actions
  copyMessage(button) {
    const messageContent = button.closest('.chat-message').querySelector('.message-content');
    navigator.clipboard.writeText(messageContent.textContent);
    button.innerHTML = '✓';
    setTimeout(() => button.innerHTML = '📋', 1000);
  }

  askFollowUp(button) {
    this.dom.chatInput.value = 'Can you elaborate on that? ';
    this.dom.chatInput.focus();
  }
}

// Make UI manager globally accessible for onclick handlers
window.uiManager = null; // Will be set by the app