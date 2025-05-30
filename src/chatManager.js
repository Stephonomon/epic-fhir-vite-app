import { sessionSet, sessionGet } from './sessionInstanceKey.js';

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
    
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleChatSubmit();
      }
    });
    chatSubmit.addEventListener('click', () => this.handleChatSubmit());
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    this.uiManager.on('suggestedQuestionClicked', () => {
      this.handleChatSubmit();
    });

    window.uiManager = this.uiManager;
  }

  async handleChatSubmit() {
    const chatInput = document.getElementById('chat-input');
    const chatSubmit = document.getElementById('chat-submit');
    const message = chatInput.value.trim();
    if (!message) return;

    this.uiManager.addChatMessage('user', message);
    this.chatHistory.push({ role: 'user', content: message, timestamp: new Date().toISOString() });

    // Persist chat history for this instance
    sessionSet('chatHistory', JSON.stringify(this.chatHistory));
    
    chatInput.value = '';
    chatInput.style.height = 'auto';
    chatSubmit.disabled = true;
    chatSubmit.innerHTML = '⌛';
    
    try {
      let aiResp;
      if (this.enhancedChat) {
        console.log('Using enhanced chat mode');
        const originalExecuteTool = this.enhancedChat.fhirTools.executeTool.bind(this.enhancedChat.fhirTools);
        this.enhancedChat.fhirTools.executeTool = async (toolName, parameters) => {
          this.emit('searchPerformed', {
            function: toolName,
            parameters: parameters,
            status: 'pending'
          });
          try {
            const result = await originalExecuteTool(toolName, parameters);
            this.emit('searchPerformed', {
              function: toolName,
              parameters: parameters,
              status: 'completed',
              result: result
            });
            return result;
          } catch (error) {
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

        // Persist updated chat history
        sessionSet('chatHistory', JSON.stringify(this.chatHistory));
      } else {
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
    // Clear chat history for this instance
    sessionSet('chatHistory', JSON.stringify([]));
  }

  exportChatHistory() {
    return {
      patient: this.dataContext.patient ? extractPatientInfo(this.dataContext.patient, window.smartClient) : null,
      chatHistory: this.chatHistory,
      timestamp: new Date().toISOString()
    };
  }

  // Restore chat history from sessionStorage (for this instance)
  restoreChatHistory() {
    const history = sessionGet('chatHistory');
    if (history) {
      try {
        this.chatHistory = JSON.parse(history);
        // Optionally, trigger UI re-render
        // this.uiManager.renderChatHistory(this.chatHistory);
      } catch (e) {
        this.chatHistory = [];
      }
    }
  }
}
