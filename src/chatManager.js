// src/chatManager.js
// Centralized chat management for the EHR Assistant

export class ChatManager {
  constructor(uiManager, openAiKey) {
    this.uiManager = uiManager;
    this.openAiKey = openAiKey;
    this.enhancedChat = null;
    this.chatHistory = [];
    this.dataContext = {};
    this.eventHandlers = new Map();
  }

  setEnhancedChat(enhancedChat) {
    this.enhancedChat = enhancedChat;
  }

  setDataContext(dataContext) {
    this.dataContext = dataContext;
  }

  setupChatInterface() {
    const chatInput = document.getElementById('chat-input');
    const chatSubmit = document.getElementById('chat-submit');
    
    if (!chatInput || !chatSubmit) return;
    
    // Input event listeners
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleChatSubmit();
      }
    });
    
    chatSubmit.addEventListener('click', () => this.handleChatSubmit());
    
    // Auto-resize textarea
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // Listen for suggested questions
    this.uiManager.on('suggestedQuestionClicked', () => {
      this.handleChatSubmit();
    });

    // Set global reference for UI manager
    window.uiManager = this.uiManager;
  }

  async handleChatSubmit() {
    const chatInput = document.getElementById('chat-input');
    const chatSubmit = document.getElementById('chat-submit');
    const message = chatInput.value.trim();
    
    if (!message) return;
    
    // Add user message
    this.uiManager.addChatMessage('user', message);
    this.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });
    
    // Clear input and show loading
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSubmit.disabled = true;
    chatSubmit.innerHTML = '⌛';
    
    try {
      let aiResp;
      
      // Always use enhanced chat mode
      if (this.enhancedChat) {
        console.log('Using enhanced chat mode');
        
        // Patch the enhanced chat to capture search data
        const originalExecuteTool = this.enhancedChat.fhirTools.executeTool.bind(this.enhancedChat.fhirTools);
        this.enhancedChat.fhirTools.executeTool = async (toolName, parameters) => {
          // Emit search event
          this.emit('searchPerformed', {
            function: toolName,
            parameters: parameters,
            status: 'pending'
          });
          
          try {
            const result = await originalExecuteTool(toolName, parameters);
            
            // Update search with results
            this.emit('searchPerformed', {
              function: toolName,
              parameters: parameters,
              status: 'completed',
              result: result
            });
            
            return result;
          } catch (error) {
            // Update search status on error
            this.emit('searchPerformed', {
              function: toolName,
              parameters: parameters,
              status: 'error',
              error: error.message
            });
            throw error;
          }
        };
        
        aiResp = await this.enhancedChat.getChatResponse(message, true);
        this.uiManager.addChatMessage('assistant', aiResp.content, aiResp.toolCalls);
        this.chatHistory.push({ 
          role: 'assistant', 
          content: aiResp.content, 
          toolCalls: aiResp.toolCalls,
          timestamp: new Date().toISOString() 
        });
      } else {
        // No enhanced chat available
        this.uiManager.addChatMessage('assistant', 'Enhanced chat mode is not available. Please ensure the OpenAI API key is configured.');
      }
      
    } catch (error) {
      console.error('Chat error:', error);
      this.uiManager.addChatMessage('assistant', `**Error:** ${error.message}`);
    } finally {
      chatSubmit.disabled = false;
      chatSubmit.innerHTML = '🔍';
      chatInput.focus();
    }
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

  clearConversation() {
    this.chatHistory = [];
    if (this.enhancedChat) {
      this.enhancedChat.clearConversation();
    }
  }

  exportChatHistory() {
    return {
      patient: this.dataContext.patient ? extractPatientInfo(this.dataContext.patient, window.smartClient) : null,
      chatHistory: this.chatHistory,
      timestamp: new Date().toISOString()
    };
  }
}