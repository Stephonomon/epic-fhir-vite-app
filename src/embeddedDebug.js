// src/embeddedDebug.js
// Debug utility for Epic embedded workspace issues

export class EmbeddedDebugger {
  constructor() {
    this.isEmbedded = window.self !== window.top;
    this.debugInfo = {
      timestamp: new Date().toISOString(),
      isEmbedded: this.isEmbedded,
      windowLocation: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      sessionStorageKeys: [],
      epicContext: null,
      smartContext: null
    };
  }

  collectDebugInfo() {
    // Collect sessionStorage keys
    this.debugInfo.sessionStorageKeys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      this.debugInfo.sessionStorageKeys.push(key);
    }

    // Try to find Epic context
    this.debugInfo.epicContext = this.findEpicContext();
    
    // Try to find SMART context
    this.debugInfo.smartContext = this.findSmartContext();

    // Check parent window access (might be blocked by same-origin policy)
    if (this.isEmbedded) {
      try {
        this.debugInfo.parentLocationHref = window.parent.location.href;
      } catch (e) {
        this.debugInfo.parentLocationError = 'Cannot access parent location (cross-origin)';
      }
    }

    // Check for Epic-specific globals
    this.debugInfo.epicGlobals = this.checkEpicGlobals();

    return this.debugInfo;
  }

  findEpicContext() {
    const context = {};
    
    // Look for Epic-specific items in sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      const value = sessionStorage.getItem(key);
      
      if (key && (key.includes('epic') || key.includes('Epic') || 
                  key.includes('csn') || key.includes('pat_id') ||
                  key.includes('context'))) {
        try {
          context[key] = JSON.parse(value);
        } catch {
          context[key] = value;
        }
      }
    }

    // Look for token response
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('fhirclient')) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          if (data?.tokenResponse) {
            context.tokenResponse = {
              pat_id: data.tokenResponse.pat_id,
              csn: data.tokenResponse.csn,
              encounter: data.tokenResponse.encounter,
              user: data.tokenResponse.user,
              context_user: data.tokenResponse.context_user
            };
          }
        } catch (e) {
          console.warn('Failed to parse fhirclient data:', e);
        }
      }
    }

    return context;
  }

  findSmartContext() {
    const smartKey = sessionStorage.getItem('SMART_KEY');
    if (!smartKey) return null;

    try {
      const smartData = JSON.parse(sessionStorage.getItem(smartKey));
      return {
        key: smartKey,
        serverUrl: smartData?.serverUrl,
        clientId: smartData?.clientId,
        patientId: smartData?.tokenResponse?.patient,
        scope: smartData?.tokenResponse?.scope,
        state: smartData?.state
      };
    } catch {
      return { error: 'Failed to parse SMART context' };
    }
  }

  checkEpicGlobals() {
    const globals = {};
    
    // Check for known Epic global variables
    const epicGlobalNames = [
      'Epic', 'EPIC', 'epicContext', 'EpicContext',
      'epicSmartApp', 'epicFhir', 'epicOAuth'
    ];

    epicGlobalNames.forEach(name => {
      if (typeof window[name] !== 'undefined') {
        globals[name] = typeof window[name];
      }
    });

    return globals;
  }

  // Create a visual debug panel
  createDebugPanel() {
    if (document.getElementById('epic-debug-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'epic-debug-panel';
    panel.innerHTML = `
      <div style="
        position: fixed;
        bottom: 10px;
        right: 10px;
        background: rgba(0, 0, 0, 0.9);
        color: #0f0;
        padding: 15px;
        border-radius: 8px;
        font-family: monospace;
        font-size: 11px;
        max-width: 400px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 99999;
        border: 1px solid #0f0;
      ">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <strong>🔍 Epic Debug Info</strong>
          <button onclick="document.getElementById('epic-debug-panel').remove()" 
                  style="background: none; border: none; color: #0f0; cursor: pointer;">✕</button>
        </div>
        <div id="debug-content"></div>
        <div style="margin-top: 10px;">
          <button onclick="window.epicDebugger.refresh()" 
                  style="background: #0f0; color: #000; border: none; padding: 5px 10px; cursor: pointer; margin-right: 5px;">
            Refresh
          </button>
          <button onclick="window.epicDebugger.copyToClipboard()" 
                  style="background: #0f0; color: #000; border: none; padding: 5px 10px; cursor: pointer;">
            Copy
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(panel);
    this.updateDebugPanel();
  }

  updateDebugPanel() {
    const content = document.getElementById('debug-content');
    if (!content) return;

    const info = this.collectDebugInfo();
    
    content.innerHTML = `
      <div><strong>Embedded:</strong> ${info.isEmbedded ? 'YES' : 'NO'}</div>
      <div><strong>URL:</strong> ${info.windowLocation.substring(0, 50)}...</div>
      <div><strong>Storage Keys:</strong> ${info.sessionStorageKeys.length}</div>
      ${info.epicContext?.tokenResponse ? `
        <div><strong>Patient ID:</strong> ${info.epicContext.tokenResponse.pat_id || 'N/A'}</div>
        <div><strong>CSN:</strong> ${info.epicContext.tokenResponse.csn || 'N/A'}</div>
        <div><strong>User:</strong> ${info.epicContext.tokenResponse.user || 'N/A'}</div>
      ` : '<div><strong>Epic Context:</strong> Not found</div>'}
      ${info.smartContext ? `
        <div><strong>SMART Patient:</strong> ${info.smartContext.patientId || 'N/A'}</div>
        <div><strong>SMART State:</strong> ${info.smartContext.state || 'N/A'}</div>
      ` : '<div><strong>SMART Context:</strong> Not found</div>'}
      <div><strong>Epic Globals:</strong> ${Object.keys(info.epicGlobals).length || 'None'}</div>
      <div><strong>Time:</strong> ${new Date().toLocaleTimeString()}</div>
    `;
  }

  refresh() {
    this.updateDebugPanel();
  }

  copyToClipboard() {
    const info = this.collectDebugInfo();
    const text = JSON.stringify(info, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      alert('Debug info copied to clipboard!');
    });
  }

  // Log session storage in a structured way
  logSessionStorage() {
    console.group('📦 SessionStorage Analysis');
    
    const analysis = {
      total: sessionStorage.length,
      byPrefix: {},
      smartKeys: [],
      epicKeys: [],
      instanceKeys: []
    };

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      
      // Categorize by prefix
      const prefix = key.split('_')[0];
      if (!analysis.byPrefix[prefix]) {
        analysis.byPrefix[prefix] = [];
      }
      analysis.byPrefix[prefix].push(key);

      // Identify specific types
      if (key.includes('fhirclient') || key === 'SMART_KEY') {
        analysis.smartKeys.push(key);
      }
      if (key.includes('epic') || key.includes('Epic')) {
        analysis.epicKeys.push(key);
      }
      if (key.startsWith('inst_') || key.startsWith('ctx_') || key.startsWith('embed_')) {
        analysis.instanceKeys.push(key);
      }
    }

    console.log('Total keys:', analysis.total);
    console.log('By prefix:', analysis.byPrefix);
    console.log('SMART keys:', analysis.smartKeys);
    console.log('Epic keys:', analysis.epicKeys);
    console.log('Instance keys:', analysis.instanceKeys);

    // Show values for important keys
    console.group('🔑 Key Values');
    [...analysis.smartKeys, ...analysis.epicKeys].forEach(key => {
      try {
        const value = sessionStorage.getItem(key);
        console.log(`${key}:`, JSON.parse(value));
      } catch {
        console.log(`${key}:`, sessionStorage.getItem(key));
      }
    });
    console.groupEnd();

    console.groupEnd();
    return analysis;
  }

  // Monitor for context changes
  startContextMonitoring(callback) {
    let lastContext = this.findEpicContext();
    
    this.contextMonitor = setInterval(() => {
      const currentContext = this.findEpicContext();
      
      if (JSON.stringify(currentContext) !== JSON.stringify(lastContext)) {
        console.log('🔄 Context change detected!', {
          old: lastContext,
          new: currentContext
        });
        
        if (callback) {
          callback(lastContext, currentContext);
        }
        
        lastContext = currentContext;
      }
    }, 2000);

    return () => clearInterval(this.contextMonitor);
  }

  // Helper to find instance keys for a specific patient
  findInstanceKeysForPatient(patId) {
    const keys = [];
    
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.includes('_pat_id')) {
        const value = sessionStorage.getItem(key);
        if (value === patId) {
          const instanceKey = key.replace('_pat_id', '');
          keys.push(instanceKey);
        }
      }
    }
    
    return keys;
  }

  // Clean up orphaned instances
  cleanupOrphanedInstances() {
    const currentContext = this.findEpicContext();
    const currentPatId = currentContext?.tokenResponse?.pat_id;
    
    if (!currentPatId) {
      console.warn('No current patient ID found, skipping cleanup');
      return;
    }

    const instancesToKeep = this.findInstanceKeysForPatient(currentPatId);
    const keysToRemove = [];

    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key.startsWith('inst_') || key.startsWith('ctx_') || key.startsWith('embed_'))) {
        const instanceKey = key.split('_').slice(0, 3).join('_');
        
        if (!instancesToKeep.includes(instanceKey)) {
          // This is an orphaned instance
          for (let j = 0; j < sessionStorage.length; j++) {
            const checkKey = sessionStorage.key(j);
            if (checkKey && checkKey.startsWith(instanceKey + '_')) {
              keysToRemove.push(checkKey);
            }
          }
        }
      }
    }

    console.log(`🧹 Cleaning up ${keysToRemove.length} orphaned keys`);
    keysToRemove.forEach(key => sessionStorage.removeItem(key));
  }
}

// Create global instance for debugging
window.epicDebugger = new EmbeddedDebugger();

// Export for use in other modules
export default EmbeddedDebugger;