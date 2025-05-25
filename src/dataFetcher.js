// src/dataFetcher.js
// Modular data fetching service for FHIR resources

import { fetchResource } from './fhirClient.js';

// Resource fetching configurations
const FETCH_CONFIGS = {
  Patient: {
    path: (client) => `Patient/${client.patient.id}`,
    transform: null // Use default
  },
  
  VitalSigns: {
    path: () => 'Observation?category=vital-signs&_sort=-date&_count=20',
    fallbacks: [
      () => 'Observation?category=vital-signs&_count=20',
      () => 'Observation?_count=20'
    ]
  },
  
  LabResults: {
    path: () => 'Observation?category=laboratory&_sort=-date&_count=20',
    fallbacks: [
      () => 'Observation?category=laboratory&_count=20',
      () => 'Observation?category=LAB&_count=20'
    ]
  },
  
  SocialHistory: {
    path: () => 'Observation?category=social-history&_sort=-date&_count=20',
    fallbacks: [
      () => 'Observation?category=social-history&_count=20'
    ]
  },
  
  MedicationRequests: {
    path: () => 'MedicationRequest?_sort=-authoredon&_count=20',
    fallbacks: [
      () => 'MedicationRequest?_sort=-date&_count=20',
      () => 'MedicationRequest?_count=20'
    ]
  },
  
  Medications: {
    path: () => 'Medication?_count=20',
    fallbacks: []
  },
  
  Binary: {
    path: () => 'Binary?_count=20',
    fallbacks: []
  },
  
  Conditions: {
    path: (client) => `Condition?patient=${encodeURIComponent(`Patient/${client.patient.id}`)}&_count=20`,
    fallbacks: [
      (client) => `Condition?patient=${encodeURIComponent(`Patient/${client.patient.id}`)}&category=problem-list-item&_count=20`,
      (client) => `Condition?patient=${encodeURIComponent(`Patient/${client.patient.id}`)}&clinical-status=active&_count=20`,
      () => 'Condition?_count=20'
    ]
  },
  
  Encounters: {
    path: () => 'Encounter?_sort=-date&_count=20',
    fallbacks: [
      () => 'Encounter?_sort=-period&_count=20',
      () => 'Encounter?_count=20'
    ]
  },
  
  DiagnosticReports: {
    path: () => 'DiagnosticReport?_sort=-date&_count=20',
    fallbacks: [
      () => 'DiagnosticReport?_sort=-effective-date&_count=20',
      () => 'DiagnosticReport?_count=20'
    ]
  },
  
  AllergyIntolerances: {
    path: () => 'AllergyIntolerance?_count=20',
    fallbacks: []
  },
  
  Immunizations: {
    path: () => 'Immunization?_sort=-date&_count=20',
    fallbacks: [
      () => 'Immunization?_sort=-occurrence&_count=20',
      () => 'Immunization?_count=20'
    ]
  },
  
  Procedures: {
    path: () => 'Procedure?_sort=-date&_count=20',
    fallbacks: [
      () => 'Procedure?_sort=-performed&_count=20',
      () => 'Procedure?_count=20'
    ]
  },
  
  DocumentReferences: {
    path: () => 'DocumentReference?_sort=-date&_count=20',
    fallbacks: [
      () => 'DocumentReference?category=clinical-note&_count=20',
      () => 'DocumentReference?_count=20'
    ]
  },
  
  Appointments: {
    path: () => 'Appointment?_sort=-date&_count=20',
    fallbacks: [
      () => 'Appointment?status=booked,arrived,checked-in&_count=20',
      () => 'Appointment?_count=20'
    ]
  },
  
  Questionnaires: {
    path: () => 'Questionnaire?_count=5',
    fallbacks: []
  },
  
  QuestionnaireResponses: {
    path: () => 'QuestionnaireResponse?_sort=-authored&_count=20',
    fallbacks: [
      () => 'QuestionnaireResponse?_count=20'
    ]
  }
};

// Data fetching service class
export class DataFetcherService {
  constructor(client, backendUrl) {
    this.client = client;
    this.backendUrl = backendUrl;
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  // Generic fetch method with retry logic
  async fetchData(resourceType, options = {}) {
    const cacheKey = `${resourceType}_${JSON.stringify(options)}`;
    
    // Check cache if enabled
    if (options.useCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < (options.cacheTimeout || 300000)) { // 5 min default
        return cached.data;
      }
    }

    // Check if request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // Create new request
    const requestPromise = this._fetchWithFallbacks(resourceType, options);
    this.pendingRequests.set(cacheKey, requestPromise);

    try {
      const data = await requestPromise;
      
      // Cache the result
      if (options.useCache) {
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
      }

      return data;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  // Internal fetch with fallback logic
  async _fetchWithFallbacks(resourceType, options) {
    const config = FETCH_CONFIGS[resourceType];
    if (!config) {
      throw new Error(`Unknown resource type: ${resourceType}`);
    }

    // Try primary path
    try {
      const path = typeof config.path === 'function' ? config.path(this.client) : config.path;
      const data = await fetchResource({
        client: this.client,
        path: this._applyOptions(path, options),
        backendUrl: this.backendUrl
      });

      return config.transform ? config.transform(data) : data;
    } catch (primaryError) {
      console.warn(`Primary fetch failed for ${resourceType}:`, primaryError.message);

      // Try fallbacks
      if (config.fallbacks && config.fallbacks.length > 0) {
        for (let i = 0; i < config.fallbacks.length; i++) {
          try {
            const fallbackPath = typeof config.fallbacks[i] === 'function' 
              ? config.fallbacks[i](this.client) 
              : config.fallbacks[i];
            
            const data = await fetchResource({
              client: this.client,
              path: this._applyOptions(fallbackPath, options),
              backendUrl: this.backendUrl
            });

            console.log(`Fallback ${i + 1} succeeded for ${resourceType}`);
            return config.transform ? config.transform(data) : data;
          } catch (fallbackError) {
            console.warn(`Fallback ${i + 1} failed for ${resourceType}:`, fallbackError.message);
            
            if (i === config.fallbacks.length - 1) {
              // All fallbacks failed
              throw new Error(`All fetch attempts failed for ${resourceType}: ${fallbackError.message}`);
            }
          }
        }
      }

      throw primaryError;
    }
  }

  // Apply additional options to path
  _applyOptions(path, options) {
    if (!options || Object.keys(options).length === 0) return path;

    const separator = path.includes('?') ? '&' : '?';
    const params = [];

    if (options.count) {
      params.push(`_count=${options.count}`);
    }

    if (options.sort) {
      params.push(`_sort=${options.sort}`);
    }

    if (options.dateRange) {
      if (options.dateRange.start) {
        params.push(`date=ge${options.dateRange.start}`);
      }
      if (options.dateRange.end) {
        params.push(`date=le${options.dateRange.end}`);
      }
    }

    if (options.status) {
      params.push(`status=${options.status}`);
    }

    if (options.additionalParams) {
      params.push(...options.additionalParams);
    }

    return params.length > 0 ? `${path}${separator}${params.join('&')}` : path;
  }

  // Batch fetch multiple resource types
  //commented out by snp
  // async batchFetch(resourceTypes, options = {}) {
  //   const promises = resourceTypes.map(type => 
  //     this.fetchData(type, options)
  //       .then(data => ({ type, data, success: true }))
  //       .catch(error => ({ type, error: error.message, success: false }))
  //   );

  //   return Promise.all(promises);
  // }

  // Clear cache
  clearCache(resourceType = null) {
    if (resourceType) {
      // Clear specific resource type
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${resourceType}_`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.cache.clear();
    }
  }

  // Get cache stats
  getCacheStats() {
    const stats = {
      totalEntries: this.cache.size,
      entries: []
    };

    for (const [key, value] of this.cache.entries()) {
      stats.entries.push({
        key,
        age: Date.now() - value.timestamp,
        size: JSON.stringify(value.data).length
      });
    }

    return stats;
  }
}