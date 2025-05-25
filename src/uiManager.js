// src/uiManager.js
// Updated UI manager with modern design, Lucide icons, and collapsible sections

import { extractPatientInfo } from './fhirUtils.js';
import { marked } from 'marked';

export class UIManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.searchHistory = [];
    this.rawDataCache = {};
    this.eventHandlers = new Map();
    this.collapsedSections = new Set(); // Track collapsed sections
    this.setupDOMReferences();
  }

  setupDOMReferences() {
    // Cache DOM references for performance
    this.dom = {
      loading: document.getElementById('loading'),
      settingsPanel: document.getElementById('settings-panel'),
      settingsToggle: document.getElementById('settings-toggle'),
      dataInspector: document.getElementById('data-inspector'),
      inspectorToggle: document.getElementById('data-inspector-toggle'),
      inspectorClose: document.getElementById('inspector-close'),
      chatHistory: document.getElementById('chat-history'),
      chatInput: document.getElementById('chat-input'),
      chatSubmit: document.getElementById('chat-submit'),
      clearChatBtn: document.getElementById('clear-chat'),
      exportChatBtn: document.getElementById('export-chat'),
      searchHistoryContainer: document.getElementById('search-history'),
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
    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Settings toggle with modern animation
    this.dom.settingsToggle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSettings();
    });
    
    // Data inspector toggle
    this.dom.inspectorToggle?.addEventListener('click', () => this.toggleDataInspector());
    
    // Inspector close button
    this.dom.inspectorClose?.addEventListener('click', () => {
      this.hideDataInspector();
    });
    
    // Context toggles (checkboxes)
    const contextToggles = {
      'toggle-patient': 'includePatient',
      'toggle-vitals': 'includeVitals',
      'toggle-meds': 'includeMeds',
      'toggle-encounters': 'includeEncounters',
      'toggle-conditions': 'includeConditions',
      'toggle-enhanced': 'useEnhancedChat'
    };
    
    Object.entries(contextToggles).forEach(([elementId, configKey]) => {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener('change', (e) => {
          this.configManager.updateConfig({ [configKey]: e.target.checked });
        });
      }
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
        const originalIcon = this.dom.copyRawDataBtn.innerHTML;
        this.dom.copyRawDataBtn.innerHTML = '<i data-lucide="check" size="16"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        setTimeout(() => {
          this.dom.copyRawDataBtn.innerHTML = originalIcon;
          if (typeof lucide !== 'undefined') lucide.createIcons();
        }, 1500);
      }
    });
    
    // Setup collapsible sections
    this.setupCollapsibleSections();
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#settings-panel') && !e.target.closest('#settings-toggle')) {
        this.hideSettings();
      }
    });

    // Chat input auto-resize
    this.dom.chatInput?.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });
  }

  setupCollapsibleSections() {
    // Make toggleSection globally available
    window.toggleSection = (sectionId) => {
      this.toggleSection(sectionId);
    };
  }

  toggleSection(sectionId) {
    const content = document.getElementById(sectionId + '-content');
    const header = content?.previousElementSibling;
    const icon = header?.querySelector('.collapse-icon');
    
    if (!content || !header || !icon) return;

    const isCollapsed = this.collapsedSections.has(sectionId);
    
    if (isCollapsed) {
      // Expand
      content.classList.remove('collapsed');
      header.classList.remove('collapsed');
      this.collapsedSections.delete(sectionId);
    } else {
      // Collapse
      content.classList.add('collapsed');
      header.classList.add('collapsed');
      this.collapsedSections.add(sectionId);
    }
    
    // Update icon rotation with smooth transition
    icon.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
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

  toggleSettings() {
    this.dom.settingsPanel?.classList.toggle('active');
    // Close data inspector if open
    if (this.dom.settingsPanel?.classList.contains('active')) {
      this.hideDataInspector();
    }
  }

  hideSettings() {
    this.dom.settingsPanel?.classList.remove('active');
  }

  toggleDataInspector() {
    const isVisible = this.dom.dataInspector?.classList.contains('active');
    
    if (isVisible) {
      this.hideDataInspector();
    } else {
      this.showDataInspector();
    }
  }

  showDataInspector() {
    this.dom.dataInspector?.classList.add('active');
    this.dom.dataInspector.style.display = 'flex';
    // Close settings if open
    this.hideSettings();
  }

  hideDataInspector() {
    this.dom.dataInspector?.classList.remove('active');
    // Use timeout to allow animation to complete before hiding
    setTimeout(() => {
      if (!this.dom.dataInspector?.classList.contains('active')) {
        this.dom.dataInspector.style.display = 'none';
      }
    }, 300);
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
          <i data-lucide="bot" size="32"></i>
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
    
    // Reinitialize icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
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
      toolInfo = `<div class="tool-usage">
        <i data-lucide="search" size="14"></i>
        Searched: ${tools}
      </div>`;
    }
    
    messageDiv.innerHTML = `
      <div class="message-header">
        <span class="message-role">${role === 'user' ? 'You' : 'Assistant'}</span>
        <span class="message-time">${timestamp}</span>
      </div>
      ${toolInfo}
      <div class="message-content">${role === 'assistant' ? marked.parse(content) : content}</div>
      <div class="message-actions">
        <button onclick="window.uiManager.copyMessage(this)" title="Copy message">
          <i data-lucide="copy" size="12"></i>
        </button>
        ${role === 'assistant' ? `<button onclick="window.uiManager.askFollowUp(this)" title="Ask follow-up">
          <i data-lucide="message-circle" size="12"></i>
        </button>` : ''}
      </div>
    `;
    
    this.dom.chatHistory.appendChild(messageDiv);
    
    // Initialize icons for the new message
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    this.scrollToBottom();
  }

  scrollToBottom() {
    this.dom.chatHistory.scrollTo({
      top: this.dom.chatHistory.scrollHeight,
      behavior: 'smooth'
    });
  }

  clearChat() {
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
        <span class="search-status">${search.status}</span>
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
          <span>Entries: ${rawData.entry?.length || 0}</span>
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
    
    const originalIcon = button.innerHTML;
    button.innerHTML = '<i data-lucide="check" size="12"></i>';
    if (typeof lucide !== 'undefined') lucide.createIcons();
    
    setTimeout(() => {
      button.innerHTML = originalIcon;
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }, 1500);
  }

  askFollowUp(button) {
    this.dom.chatInput.value = 'Can you elaborate on that? ';
    this.dom.chatInput.focus();
  }
}

// Make UI manager globally accessible for onclick handlers
window.uiManager = null; // Will be set by the app