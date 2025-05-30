// src/epicEmbeddedHandler.js
// Special handling for Epic embedded workspace behavior

export class EpicEmbeddedHandler {
  constructor() {
    this.isEmbedded = window.self !== window.top;
    this.contextCheckInterval = null;
    this.lastKnownContext = null;
  }

  // Initialize embedded handling
  init() {
    if (!this.isEmbedded) {
      console.log('Not in embedded mode, skipping Epic embedded handler');
      return;
    }

    console.log('🏥 Initializing Epic embedded workspace handler');
    
    // Set up message listener for parent window communication
    this.setupMessageListener();
    
    // Set up visibility change detection
    this.setupVisibilityListener();
    
    // Set up focus detection
    this.setupFocusListener();
    
    // Try to detect Epic-specific events
    this.detectEpicEvents();
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      console.log('📨 Received message in embedded app:', event);
      
      // Check if this is an Epic context message
      if (event.data && (event.data.type === 'epic-context' || 
                        event.data.type === 'context-change' ||
                        event.data.epic)) {
        console.log('Epic context message detected:', event.data);
        this.handleContextMessage(event.data);
      }
    });
  }

  setupVisibilityListener() {
    document.addEventListener('visibilitychange', () => {
      console.log('👁️ Visibility changed:', document.visibilityState);
      
      if (document.visibilityState === 'visible') {
        // App became visible, check for context changes
        this.checkForContextChange();
      }
    });
  }

  setupFocusListener() {
    window.addEventListener('focus', () => {
      console.log('🎯 Window gained focus');
      this.checkForContextChange();
    });

    window.addEventListener('blur', () => {
      console.log('💤 Window lost focus');
    });
  }

  detectEpicEvents() {
    // Try to detect Epic-specific DOM events
    const epicEventNames = [
      'epic-context-change',
      'epicContextChange',
      'patient-context-change',
      'workspace-context-change'
    ];

    epicEventNames.forEach(eventName => {
      document.addEventListener(eventName, (event) => {
        console.log(`🎉 Epic event detected: ${eventName}`, event);
        this.handleEpicEvent(event);
      });
    });

    // Also listen on window
    epicEventNames.forEach(eventName => {
      window.addEventListener(eventName, (event) => {
        console.log(`🎉 Epic event on window: ${eventName}`, event);
        this.handleEpicEvent(event);
      });
    });
  }

  handleContextMessage(data) {
    // Handle Epic context messages
    if (data.patientId || data.pat_id) {
      const newContext = {
        patientId: data.patientId || data.pat_id,
        csn: data.csn || data.encounterCsn,
        encounterId: data.encounterId || data.encounter,
        userId: data.userId || data.user
      };

      console.log('📋 New context from message:', newContext);
      
      // Notify the app of context change
      this.notifyContextChange(newContext);
    }
  }

  handleEpicEvent(event) {
    // Handle Epic-specific events
    const detail = event.detail || event.data || {};
    console.log('🏥 Processing Epic event:', detail);
    
    if (detail.patient || detail.patientId) {
      this.notifyContextChange({
        patientId: detail.patient || detail.patientId,
        csn: detail.csn,
        encounterId: detail.encounter
      });
    }
  }

  checkForContextChange() {
    // Look for context changes in sessionStorage
    const currentContext = this.getCurrentContext();
    
    if (currentContext && this.lastKnownContext) {
      if (currentContext.patientId !== this.lastKnownContext.patientId ||
          currentContext.csn !== this.lastKnownContext.csn) {
        console.log('🔄 Context change detected on focus/visibility');
        this.notifyContextChange(currentContext);
      }
    }
    
    this.lastKnownContext = currentContext;
  }

  getCurrentContext() {
    // Try multiple methods to get current context
    let context = {};

    // Method 1: Check token response in sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('fhirclient')) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data?.tokenResponse) {
            context = {
              patientId: data.tokenResponse.pat_id || data.tokenResponse.patient,
              csn: data.tokenResponse.csn,
              encounterId: data.tokenResponse.encounter,
              userId: data.tokenResponse.user
            };
            break;
          }
        } catch (e) {
          // Continue searching
        }
      }
    }

    // Method 2: Check for Epic-specific storage items
    const epicPatId = sessionStorage.getItem('epic_patient_id');
    const epicCsn = sessionStorage.getItem('epic_csn');
    
    if (epicPatId) {
      context.patientId = context.patientId || epicPatId;
    }
    if (epicCsn) {
      context.csn = context.csn || epicCsn;
    }

    return Object.keys(context).length > 0 ? context : null;
  }

  notifyContextChange(newContext) {
    // Dispatch a custom event that the app can listen to
    const event = new CustomEvent('epic-embedded-context-change', {
      detail: newContext,
      bubbles: true
    });
    
    window.dispatchEvent(event);
    console.log('📢 Dispatched context change event:', newContext);
  }

  // Start periodic context checking (more aggressive than the main app)
  startContextPolling(interval = 2000) {
    if (this.contextCheckInterval) {
      clearInterval(this.contextCheckInterval);
    }

    this.lastKnownContext = this.getCurrentContext();
    
    this.contextCheckInterval = setInterval(() => {
      this.checkForContextChange();
    }, interval);

    console.log(`⏰ Started context polling every ${interval}ms`);
  }

  stopContextPolling() {
    if (this.contextCheckInterval) {
      clearInterval(this.contextCheckInterval);
      this.contextCheckInterval = null;
      console.log('⏹️ Stopped context polling');
    }
  }

  // Try to communicate with parent window (Epic)
  sendToParent(message) {
    if (!this.isEmbedded) return;

    try {
      window.parent.postMessage({
        source: 'epic-fhir-app',
        ...message
      }, '*'); // In production, use specific origin
      
      console.log('📤 Sent message to parent:', message);
    } catch (e) {
      console.error('Failed to send message to parent:', e);
    }
  }

  // Request context from parent
  requestContext() {
    this.sendToParent({
      type: 'request-context',
      timestamp: new Date().toISOString()
    });
  }

  // Clean up
  destroy() {
    this.stopContextPolling();
    // Remove event listeners if needed
  }
}

// Create singleton instance
export const epicEmbeddedHandler = new EpicEmbeddedHandler();