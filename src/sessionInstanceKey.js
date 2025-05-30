// src/sessionInstanceKey.js
// Utility to get a unique instance key for sessionStorage namespacing in Epic Hyperspace

// Returns a launch-unique key for prefixing all sessionStorage keys
export function getInstanceKey() {
  const params = new URLSearchParams(window.location.search);
  // Use 'state' (SMART OAuth), or 'instanceKey', or fallback to UUID
  if (params.has('state')) return params.get('state');
  if (params.has('instanceKey')) return params.get('instanceKey');
  if (window.__EPIC_INSTANCE_KEY__) return window.__EPIC_INSTANCE_KEY__;
  // Fallback: Generate a UUID and (optionally) update the URL
  if (window.crypto && window.crypto.randomUUID) {
    const uuid = window.crypto.randomUUID();
    // Optional: update URL so reloads preserve it
    window.history.replaceState({}, '', window.location.pathname + '?instanceKey=' + uuid);
    window.__EPIC_INSTANCE_KEY__ = uuid;
    return uuid;
  }
  // Last resort: timestamp + Math.random
  const fallback = String(Date.now()) + Math.floor(Math.random() * 10000);
  window.__EPIC_INSTANCE_KEY__ = fallback;
  return fallback;
}

// Namespaced sessionStorage wrapper
export function sessionSet(key, value) {
  const instanceKey = getInstanceKey();
  sessionStorage.setItem(`${instanceKey}_${key}`, value);
}

export function sessionGet(key) {
  const instanceKey = getInstanceKey();
  return sessionStorage.getItem(`${instanceKey}_${key}`);
}
