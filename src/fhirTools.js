// src/fhirTools.js
// Refactored FHIR-specific tools for LLM function calling with modular architecture

// Polyfill for atob if not available (for decoding base64)
if (typeof atob === 'undefined') {
  global.atob = function(str) {
    return Buffer.from(str, 'base64').toString('binary');
  };
}

// Define FHIR resource configurations
const FHIR_RESOURCES = {
  AllergyIntolerance: {
    searchParams: {
      clinical_status: { param: 'clinical-status', type: 'token' },
      verification_status: { param: 'verification-status', type: 'token' },
      type: { param: 'type', type: 'token' },
      category: { param: 'category', type: 'token' },
      criticality: { param: 'criticality', type: 'token' },
      date: { param: 'date', type: 'date' },
      last_date: { param: 'last-date', type: 'date' },
      onset: { param: 'onset', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Appointment: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      appointment_type: { param: 'appointment-type', type: 'token' },
      service_type: { param: 'service-type', type: 'token' },
      specialty: { param: 'specialty', type: 'token' },
      practitioner: { param: 'practitioner', type: 'reference' },
      location: { param: 'location', type: 'reference' },
      date: { param: 'date', type: 'date' },
      created: { param: 'created', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Binary: {
    searchParams: {
      contenttype: { param: 'contenttype', type: 'token' },
      securityContext: { param: 'securityContext', type: 'reference' },
      _lastUpdated: { param: '_lastUpdated', type: 'date' }
    },
    defaultSort: '-_lastUpdated',
    defaultCount: 10
  },
  
  Condition: {
    searchParams: {
      clinical_status: { param: 'clinical-status', type: 'token' },
      verification_status: { param: 'verification-status', type: 'token' },
      category: { param: 'category', type: 'token' },
      severity: { param: 'severity', type: 'token' },
      code: { param: 'code', type: 'token' },
      body_site: { param: 'body-site', type: 'token' },
      onset_date: { param: 'onset-date', type: 'date' },
      recorded_date: { param: 'recorded-date', type: 'date' },
      abatement_date: { param: 'abatement-date', type: 'date' }
    },
    defaultSort: '-recorded-date',
    defaultCount: 10
  },
  
  DiagnosticReport: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      category: { param: 'category', type: 'token' },
      code: { param: 'code', type: 'token' },
      conclusion: { param: 'conclusion', type: 'token' },
      date: { param: 'date', type: 'date' },
      issued: { param: 'issued', type: 'date' },
      performer: { param: 'performer', type: 'reference' },
      results_interpreter: { param: 'results-interpreter', type: 'reference' },
      specimen: { param: 'specimen', type: 'reference' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  DocumentReference: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      docstatus: { param: 'docstatus', type: 'token' },
      type: { param: 'type', type: 'token' },
      category: { param: 'category', type: 'token' },
      subject: { param: 'subject', type: 'reference' },
      patient: { param: 'patient', type: 'reference' },
      encounter: { param: 'encounter', type: 'reference' },
      author: { param: 'author', type: 'reference' },
      custodian: { param: 'custodian', type: 'reference' },
      authenticator: { param: 'authenticator', type: 'reference' },
      date: { param: 'date', type: 'date' },
      period: { param: 'period', type: 'date' },
      created: { param: 'created', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Encounter: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      class: { param: 'class', type: 'token' },
      type: { param: 'type', type: 'token' },
      service_type: { param: 'service-type', type: 'token' },
      participant: { param: 'participant', type: 'reference' },
      practitioner: { param: 'practitioner', type: 'reference' },
      location: { param: 'location', type: 'reference' },
      service_provider: { param: 'service-provider', type: 'reference' },
      date: { param: 'date', type: 'date' },
      period: { param: 'period', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Immunization: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      vaccine_code: { param: 'vaccine-code', type: 'token' },
      reason_code: { param: 'reason-code', type: 'token' },
      location: { param: 'location', type: 'reference' },
      performer: { param: 'performer', type: 'reference' },
      date: { param: 'date', type: 'date' },
      lot_number: { param: 'lot-number', type: 'string' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Medication: {
    searchParams: {
      code: { param: 'code', type: 'token' },
      status: { param: 'status', type: 'token' },
      form: { param: 'form', type: 'token' },
      manufacturer: { param: 'manufacturer', type: 'reference' },
      ingredient: { param: 'ingredient', type: 'reference' },
      ingredient_code: { param: 'ingredient-code', type: 'token' },
      lot_number: { param: 'lot-number', type: 'string' },
      expiration_date: { param: 'expiration-date', type: 'date' }
    },
    defaultSort: '-_lastUpdated',
    defaultCount: 10
  },
  
  MedicationRequest: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      intent: { param: 'intent', type: 'token' },
      category: { param: 'category', type: 'token' },
      priority: { param: 'priority', type: 'token' },
      code: { param: 'code', type: 'token' },
      medication: { param: 'medication', type: 'reference' },
      requester: { param: 'requester', type: 'reference' },
      intended_dispenser: { param: 'intended-dispenser', type: 'reference' },
      authoredon: { param: 'authoredon', type: 'date' },
      effective_date: { param: 'effective-date', type: 'date' }
    },
    defaultSort: '-authoredon',
    defaultCount: 10
  },
  
  Observation: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      category: { param: 'category', type: 'token' },
      code: { param: 'code', type: 'token' },
      value_concept: { param: 'value-concept', type: 'token' },
      value_quantity: { param: 'value-quantity', type: 'quantity' },
      value_string: { param: 'value-string', type: 'string' },
      performer: { param: 'performer', type: 'reference' },
      specimen: { param: 'specimen', type: 'reference' },
      date: { param: 'date', type: 'date' },
      issued: { param: 'issued', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Procedure: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      code: { param: 'code', type: 'token' },
      category: { param: 'category', type: 'token' },
      outcome: { param: 'outcome', type: 'token' },
      performer: { param: 'performer', type: 'reference' },
      location: { param: 'location', type: 'reference' },
      reason_code: { param: 'reason-code', type: 'token' },
      reason_reference: { param: 'reason-reference', type: 'reference' },
      date: { param: 'date', type: 'date' },
      performed: { param: 'performed', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  Questionnaire: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      title: { param: 'title', type: 'string' },
      code: { param: 'code', type: 'token' },
      publisher: { param: 'publisher', type: 'string' },
      subject_type: { param: 'subject-type', type: 'token' },
      effective: { param: 'effective', type: 'date' },
      date: { param: 'date', type: 'date' }
    },
    defaultSort: '-date',
    defaultCount: 10
  },
  
  QuestionnaireResponse: {
    searchParams: {
      status: { param: 'status', type: 'token' },
      questionnaire: { param: 'questionnaire', type: 'reference' },
      subject: { param: 'subject', type: 'reference' },
      author: { param: 'author', type: 'reference' },
      source: { param: 'source', type: 'reference' },
      encounter: { param: 'encounter', type: 'reference' },
      authored: { param: 'authored', type: 'date' }
    },
    defaultSort: '-authored',
    defaultCount: 10
  }
};

// Generic tool definitions generator
function generateToolDefinition(resourceType, config) {
  const parameters = {
    type: "object",
    properties: {
      count: {
        type: "integer",
        description: "Maximum number of results to return",
        default: config.defaultCount,
        maximum: 200
      }
    },
    required: []
  };

  // Add search parameters based on configuration
  Object.entries(config.searchParams).forEach(([key, param]) => {
    if (param.type === 'token') {
      parameters.properties[key] = {
        type: "string",
        description: `${key.replace(/_/g, ' ')} for filtering`
      };
    } else if (param.type === 'date') {
      parameters.properties[`${key}_start`] = {
        type: "string",
        description: `Start date for ${key.replace(/_/g, ' ')} (YYYY-MM-DD)`
      };
      parameters.properties[`${key}_end`] = {
        type: "string",
        description: `End date for ${key.replace(/_/g, ' ')} (YYYY-MM-DD)`
      };
    } else if (param.type === 'string') {
      parameters.properties[key] = {
        type: "string",
        description: `${key.replace(/_/g, ' ')} for filtering`
      };
    } else if (param.type === 'reference') {
      parameters.properties[`${key}_id`] = {
        type: "string",
        description: `ID of ${key.replace(/_/g, ' ')} resource`
      };
    }
  });

  // Add text search parameter
  parameters.properties.text_search = {
    type: "string",
    description: `Text search across ${resourceType} resources`
  };

  return {
    type: "function",
    function: {
      name: `search_${resourceType.toLowerCase()}`,
      description: `Search for ${resourceType} resources with flexible filtering`,
      parameters
    }
  };
}

export class FHIRTools {
  constructor(client, backendUrl) {
    this.client = client;
    this.backendUrl = backendUrl;
  }

  // Dynamically generate tool definitions
  getToolDefinitions() {
    const tools = [];

    // Generate search tools for each resource type
    Object.entries(FHIR_RESOURCES).forEach(([resourceType, config]) => {
      tools.push(generateToolDefinition(resourceType, config));
    });

    // Add special tools
    tools.push({
      type: "function",
      function: {
        name: "get_patient_summary",
        description: "Get a comprehensive summary of patient demographics and basic info",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    });

    tools.push({
      type: "function",
      function: {
        name: "search_all_resources",
        description: "Search across multiple resource types with a single query",
        parameters: {
          type: "object",
          properties: {
            resource_types: {
              type: "array",
              items: {
                type: "string",
                enum: Object.keys(FHIR_RESOURCES)
              },
              description: "Resource types to search"
            },
            text_query: {
              type: "string",
              description: "Text to search across resources"
            },
            date_range: {
              type: "object",
              properties: {
                start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                end: { type: "string", description: "End date (YYYY-MM-DD)" }
              }
            },
            count_per_type: {
              type: "integer",
              default: 10,
              maximum: 50
            }
          },
          required: ["resource_types"]
        }
      }
    });

    tools.push({
      type: "function",
      function: {
        name: "get_clinical_note_content",
        description: "Retrieve the actual content of a clinical note using its Binary resource ID",
        parameters: {
          type: "object",
          properties: {
            binary_id: {
              type: "string",
              description: "The Binary resource ID from DocumentReference contentUrls"
            },
            format: {
              type: "string",
              description: "Desired format for the content",
              enum: ["html", "rtf", "raw"],
              default: "html"
            }
          },
          required: ["binary_id"]
        }
      }
    });

    tools.push({
      type: "function",
      function: {
        name: "search_clinical_notes_with_content",
        description: "Search for clinical notes and optionally retrieve their content",
        parameters: {
          type: "object",
          properties: {
            patient_id: {
              type: "string",
              description: "Patient FHIR ID"
            },
            category: {
              type: "string",
              description: "Note category (should be 'clinical-note')",
              default: "clinical-note"
            },
            type: {
              type: "string",
              description: "Note type (e.g., 'Progress Note', 'Discharge Documentation', 'Consultation')"
            },
            date_start: {
              type: "string",
              description: "Start date for note search (YYYY-MM-DD)"
            },
            date_end: {
              type: "string",
              description: "End date for note search (YYYY-MM-DD)"
            },
            encounter_id: {
              type: "string",
              description: "Encounter FHIR ID"
            },
            count: {
              type: "integer",
              description: "Maximum number of notes to return",
              default: 10
            },
            include_content: {
              type: "boolean",
              description: "Whether to retrieve the actual note content",
              default: false
            }
          }
        }
      }
    });

    return tools;
  }

  // Generic search method
  async searchResource(resourceType, parameters) {
    const config = FHIR_RESOURCES[resourceType];
    if (!config) {
      throw new Error(`Unknown resource type: ${resourceType}`);
    }

    const queryParams = [];
    
    // Process parameters based on configuration
    Object.entries(parameters).forEach(([key, value]) => {
      if (value === undefined || value === null || key === 'count' || key === 'text_search') return;

      const searchParam = config.searchParams[key];
      if (searchParam) {
        if (searchParam.type === 'date') {
          // Handle date range parameters
          if (key.endsWith('_start')) {
            const baseKey = key.replace('_start', '');
            const param = config.searchParams[baseKey];
            if (param) queryParams.push(`${param.param}=ge${value}`);
          } else if (key.endsWith('_end')) {
            const baseKey = key.replace('_end', '');
            const param = config.searchParams[baseKey];
            if (param) queryParams.push(`${param.param}=le${value}`);
          }
        } else if (searchParam.type === 'reference' && key.endsWith('_id')) {
          queryParams.push(`${searchParam.param}=${value}`);
        } else {
          queryParams.push(`${searchParam.param}=${value}`);
        }
      }
    });

    // Add text search if provided
    if (parameters.text_search) {
      queryParams.push(`_text=${encodeURIComponent(parameters.text_search)}`);
    }

    // Add sorting and count
    queryParams.push(`_sort=${config.defaultSort}`);
    queryParams.push(`_count=${parameters.count || config.defaultCount}`);

    const path = `${resourceType}?${queryParams.join('&')}`;

    try {
      const data = await this.fetchResource(path);
      return this.formatResults(resourceType, data, parameters);
    } catch (error) {
      console.warn(`Primary search failed for ${resourceType}:`, error.message);
      
      // Fallback strategies
      const fallbackPath = `${resourceType}?_count=${parameters.count || config.defaultCount}`;
      const data = await this.fetchResource(fallbackPath);
      return this.formatResults(resourceType, data, parameters);
    }
  }

  // Execute tool functions
  async executeTool(toolName, parameters) {
    try {
      // Handle special tools
      if (toolName === 'get_patient_summary') {
        return await this.getPatientSummary();
      } else if (toolName === 'search_all_resources') {
        return await this.searchAllResources(parameters);
      } else if (toolName === 'get_clinical_note_content') {
        return await this.getClinicalNoteContent(parameters);
      } else if (toolName === 'search_clinical_notes_with_content') {
        return await this.searchClinicalNotesWithContent(parameters);
      }

      // Handle resource-specific searches
      const match = toolName.match(/^search_(.+)$/);
      if (match) {
        const resourceType = match[1].split('_').map(part => 
          part.charAt(0).toUpperCase() + part.slice(1)
        ).join('');
        
        // Handle special cases
        const resourceMap = {
          'Allergyintolerance': 'AllergyIntolerance',
          'Diagnosticreport': 'DiagnosticReport',
          'Documentreference': 'DocumentReference',
          'Medicationrequest': 'MedicationRequest',
          'Questionnaireresponse': 'QuestionnaireResponse',
          'Binary': 'Binary'
        };
        
        const actualResourceType = resourceMap[resourceType] || resourceType;
        
        if (FHIR_RESOURCES[actualResourceType]) {
          return await this.searchResource(actualResourceType, parameters);
        }
      }

      throw new Error(`Unknown tool: ${toolName}`);
    } catch (error) {
      return { error: `Failed to execute ${toolName}: ${error.message}` };
    }
  }

  // Search across multiple resource types
  async searchAllResources(params) {
    const results = {};
    const promises = [];

    for (const resourceType of params.resource_types) {
      const searchParams = {
        count: params.count_per_type || 10
      };

      if (params.text_query) {
        searchParams.text_search = params.text_query;
      }

      if (params.date_range) {
        // Apply date range to appropriate date fields for each resource
        const config = FHIR_RESOURCES[resourceType];
        if (config) {
          const dateParam = Object.keys(config.searchParams).find(key => 
            config.searchParams[key].type === 'date' && key === 'date'
          ) || Object.keys(config.searchParams).find(key => 
            config.searchParams[key].type === 'date'
          );

          if (dateParam) {
            if (params.date_range.start) searchParams[`${dateParam}_start`] = params.date_range.start;
            if (params.date_range.end) searchParams[`${dateParam}_end`] = params.date_range.end;
          }
        }
      }

      promises.push(
        this.searchResource(resourceType, searchParams)
          .then(result => ({ resourceType, result }))
          .catch(error => ({ resourceType, error: error.message }))
      );
    }

    const searchResults = await Promise.all(promises);
    
    searchResults.forEach(({ resourceType, result, error }) => {
      results[resourceType] = error ? { error } : result;
    });

    return {
      searchQuery: params.text_query || 'All resources',
      dateRange: params.date_range || null,
      results
    };
  }

  // Get clinical note content from Binary resource
  async getClinicalNoteContent(params) {
    if (!params.binary_id) {
      return { error: "Binary resource ID is required" };
    }

    try {
      // Extract just the ID from URLs like "Binary/xyz123"
      const binaryId = params.binary_id.includes('/') ? 
        params.binary_id.split('/').pop() : 
        params.binary_id;

      const binaryData = await this.fetchResource(`Binary/${binaryId}`);
      
      // Decode base64 content
      let decodedContent = null;
      if (binaryData.data) {
        try {
          // Decode base64 to string
          decodedContent = atob(binaryData.data);
          
          // If it's RTF and user wants HTML, note that conversion is needed
          if (binaryData.contentType === 'text/rtf' && params.format === 'html') {
            return {
              contentType: binaryData.contentType,
              content: decodedContent,
              note: "Content is in RTF format. Client-side conversion to HTML may be needed.",
              binaryId: binaryId
            };
          }
        } catch (decodeError) {
          return { 
            error: "Failed to decode binary content", 
            details: decodeError.message,
            binaryId: binaryId 
          };
        }
      }

      return {
        binaryId: binaryId,
        contentType: binaryData.contentType || "Unknown",
        content: decodedContent || "No content found",
        rawData: params.format === 'raw' ? binaryData : undefined
      };
    } catch (error) {
      return { 
        error: `Failed to retrieve binary content: ${error.message}`,
        binaryId: params.binary_id
      };
    }
  }

  // Search clinical notes and optionally retrieve content
  async searchClinicalNotesWithContent(params) {
    // First, search for DocumentReferences
    const searchParams = {
      category: params.category || 'clinical-note',
      text_search: params.type,
      date_start: params.date_start,
      date_end: params.date_end,
      count: params.count || 10
    };

    // Build DocumentReference search path
    let path = 'DocumentReference?';
    const queryParams = [];
    
    if (params.patient_id) {
      queryParams.push(`patient=${params.patient_id}`);
    } else {
      queryParams.push(`patient=${this.client.patient.id}`);
    }
    
    queryParams.push(`category=${searchParams.category}`);
    
    if (params.type) {
      queryParams.push(`type:text=${encodeURIComponent(params.type)}`);
    }
    
    if (params.encounter_id) {
      queryParams.push(`encounter=${params.encounter_id}`);
    }
    
    if (params.date_start) {
      queryParams.push(`date=ge${params.date_start}`);
    }
    
    if (params.date_end) {
      queryParams.push(`date=le${params.date_end}`);
    }
    
    queryParams.push(`_count=${searchParams.count}`);
    queryParams.push(`_sort=-date`);
    
    path += queryParams.join('&');

    try {
      const documentData = await this.fetchResource(path);
      const formattedDocs = this.formatDocumentReferenceResults(documentData, searchParams);
      
      // If content retrieval is requested
      if (params.include_content && formattedDocs.documents.length > 0) {
        // Retrieve content for each document
        const docsWithContent = await Promise.all(
          formattedDocs.documents.map(async (doc) => {
            const contentResults = [];
            
            // Try to get content for each available Binary URL
            for (const contentUrl of doc.contentUrls) {
              if (contentUrl.binaryUrl) {
                try {
                  const content = await this.getClinicalNoteContent({
                    binary_id: contentUrl.binaryUrl,
                    format: contentUrl.contentType === 'text/html' ? 'html' : 'raw'
                  });
                  contentResults.push({
                    ...contentUrl,
                    ...content
                  });
                } catch (err) {
                  contentResults.push({
                    ...contentUrl,
                    error: `Failed to retrieve content: ${err.message}`
                  });
                }
              }
            }
            
            return {
              ...doc,
              retrievedContent: contentResults
            };
          })
        );
        
        return {
          ...formattedDocs,
          documents: docsWithContent,
          contentIncluded: true
        };
      }
      
      return formattedDocs;
    } catch (error) {
      return { 
        error: `Failed to search clinical notes: ${error.message}` 
      };
    }
  }

  // Format results based on resource type
  formatResults(resourceType, data, params) {
    if (!data?.entry?.length) {
      return { 
        resourceType,
        message: `No ${resourceType} resources found matching the criteria.`,
        count: 0
      };
    }

    const formatter = this[`format${resourceType}Results`];
    if (formatter) {
      return formatter.call(this, data, params);
    }

    // Generic formatter for resources without specific formatters
    return {
      resourceType,
      count: data.entry.length,
      total: data.total,
      entries: data.entry.map(entry => ({
        id: entry.resource.id,
        ...this.extractGenericResourceData(entry.resource)
      }))
    };
  }

  // Generic resource data extractor
  extractGenericResourceData(resource) {
    const data = {
      resourceType: resource.resourceType,
      status: resource.status || 'Unknown',
      lastUpdated: resource.meta?.lastUpdated || 'Unknown'
    };

    // Extract common fields
    if (resource.code) {
      data.code = resource.code.text || 
                 resource.code.coding?.[0]?.display || 
                 resource.code.coding?.[0]?.code || 
                 'Unknown';
    }

    if (resource.subject) {
      data.subject = resource.subject.display || resource.subject.reference;
    }

    if (resource.encounter) {
      data.encounter = resource.encounter.display || resource.encounter.reference;
    }

    if (resource.performer) {
      data.performer = Array.isArray(resource.performer) 
        ? resource.performer.map(p => p.display || p.reference).join(', ')
        : resource.performer.display || resource.performer.reference;
    }

    // Extract dates
    const dateFields = ['effectiveDateTime', 'authoredOn', 'date', 'issued', 'recorded', 'created'];
    for (const field of dateFields) {
      if (resource[field]) {
        data.date = resource[field];
        break;
      }
    }

    return data;
  }

  // Helper method to fetch FHIR resources
  async fetchResource(path) {
    if (!this.client?.state?.serverUrl || !this.client?.state?.tokenResponse?.access_token) {
      throw new Error("No valid SMART client state for fetching FHIR resource.");
    }

    const serverUrl = this.client.state.serverUrl;
    let url = `${this.backendUrl}/${path}`;
    
    // Check if the path already includes a patient parameter
    if (!path.includes('patient=')) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}patient=${this.client.patient.id}`;
    }
    
    // Always append the target FHIR server
    if (!url.includes('targetFhirServer=')) {
      const sep = url.includes('?') ? '&' : '?';
      url += `${sep}targetFhirServer=${encodeURIComponent(serverUrl)}`;
    }

    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${this.client.state.tokenResponse.access_token}`,
        'Accept': 'application/fhir+json'
      }
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`FHIR ${path} error ${resp.status}: ${text}`);
    }
    return resp.json();
  }

  async getPatientSummary() {
    const patientData = await this.fetchResource(`Patient/${this.client.patient.id}`);
    return this.formatPatientSummary(patientData);
  }

  formatPatientSummary(patientData) {
    const name = patientData.name?.[0]?.text || 
                `${patientData.name?.[0]?.given?.join(' ')} ${patientData.name?.[0]?.family}`;
    
    return {
      name: name,
      gender: patientData.gender,
      birthDate: patientData.birthDate,
      id: patientData.id,
      phone: patientData.telecom?.find(t => t.system === 'phone')?.value || "N/A",
      email: patientData.telecom?.find(t => t.system === 'email')?.value || "N/A"
    };
  }

  // Specific formatters for complex resources
  formatObservationResults(data, params) {
    const observations = data.entry.map(entry => {
      const obs = entry.resource;
      let value = "N/A";
      
      if (obs.valueQuantity) {
        value = `${obs.valueQuantity.value} ${obs.valueQuantity.unit || ''}`;
      } else if (obs.valueString) {
        value = obs.valueString;
      } else if (obs.valueCodeableConcept) {
        value = obs.valueCodeableConcept.text || obs.valueCodeableConcept.coding?.[0]?.display || "Coded value";
      } else if (obs.component?.length) {
        value = obs.component.map(c => {
          const compName = c.code?.text || c.code?.coding?.[0]?.display || "Component";
          let compValue = "N/A";
          if (c.valueQuantity) {
            compValue = `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}`;
          } else if (c.valueString) {
            compValue = c.valueString;
          } else if (c.valueCodeableConcept) {
            compValue = c.valueCodeableConcept.text || c.valueCodeableConcept.coding?.[0]?.display || "Coded";
          }
          return `${compName}: ${compValue}`;
        }).join('; ');
      }

      const observationName = obs.code?.text || obs.code?.coding?.[0]?.display || "Unknown";
      
      return {
        id: obs.id,
        name: observationName,
        value: value,
        date: obs.effectiveDateTime || obs.effectivePeriod?.start || "Unknown date",
        status: obs.status,
        category: obs.category?.[0]?.coding?.[0]?.display || obs.category?.[0]?.text || "Unknown",
        referenceRange: obs.referenceRange?.[0]?.text || obs.referenceRange?.[0]?.low?.value && obs.referenceRange?.[0]?.high?.value ? 
          `${obs.referenceRange[0].low.value}-${obs.referenceRange[0].high.value} ${obs.referenceRange[0].low.unit || ''}` : null,
        interpretation: obs.interpretation?.[0]?.text || obs.interpretation?.[0]?.coding?.[0]?.display || null
      };
    });

    return {
      resourceType: 'Observation',
      count: observations.length,
      total: data.total,
      observations: observations
    };
  }

  formatMedicationRequestResults(data, params) {
    const medications = data.entry.map(entry => {
      const med = entry.resource;
      const name = med.medicationCodeableConcept?.text || 
                  med.medicationReference?.display || 
                  'Unknown';
      
      return {
        id: med.id,
        name: name,
        status: med.status,
        intent: med.intent,
        priority: med.priority,
        authoredOn: med.authoredOn,
        dosage: med.dosageInstruction?.[0]?.text || "No dosage info",
        requester: med.requester?.display || "Unknown provider",
        reasonCode: med.reasonCode?.map(r => r.text || r.coding?.[0]?.display).join(', ') || null,
        note: med.note?.map(n => n.text).join('; ') || null
      };
    });

    return {
      resourceType: 'MedicationRequest',
      count: medications.length,
      total: data.total,
      medications: medications
    };
  }

  formatConditionResults(data, params) {
    const conditions = data.entry.map(entry => {
      const condition = entry.resource;
      const name = condition.code?.text || 
                  condition.code?.coding?.[0]?.display || 
                  'Unknown condition';

      const codes = condition.code?.coding?.map(coding => ({
        system: coding.system,
        code: coding.code,
        display: coding.display
      })) || [];

      return {
        id: condition.id,
        name: name,
        codes: codes,
        clinicalStatus: condition.clinicalStatus?.coding?.[0]?.display || condition.clinicalStatus?.text || "Unknown",
        verificationStatus: condition.verificationStatus?.coding?.[0]?.display || condition.verificationStatus?.text || "Unknown",
        onsetDate: condition.onsetDateTime?.split('T')[0] || condition.onsetPeriod?.start?.split('T')[0] || "Unknown",
        recordedDate: condition.recordedDate?.split('T')[0] || "Unknown",
        abatementDate: condition.abatementDateTime?.split('T')[0] || condition.abatementPeriod?.end?.split('T')[0] || null,
        category: condition.category?.map(cat => 
          cat.coding?.[0]?.display || cat.text || "Unknown"
        ).join(', ') || "Unknown",
        severity: condition.severity?.coding?.[0]?.display || condition.severity?.text || null,
        bodySite: condition.bodySite?.map(site => 
          site.text || site.coding?.[0]?.display || "Unknown site"
        ).join(', ') || null,
        note: condition.note?.map(note => note.text).join('; ') || null
      };
    });

    return {
      resourceType: 'Condition',
      count: conditions.length,
      total: data.total,
      conditions: conditions
    };
  }

  formatEncounterResults(data, params) {
    const encounters = data.entry.map(entry => {
      const enc = entry.resource;
      
      const types = enc.type?.map(type => 
        type.text || type.coding?.[0]?.display || "Unknown"
      ) || ["Unknown"];

      const participants = enc.participant?.map(p => ({
        name: p.individual?.display || p.individual?.reference || "Unknown provider",
        type: p.type?.[0]?.coding?.[0]?.display || p.type?.[0]?.text || "Unknown role"
      })) || [];

      const locations = enc.location?.map(loc => ({
        name: loc.location?.display || loc.location?.reference || "Unknown location",
        status: loc.status || "Unknown"
      })) || [];

      return {
        id: enc.id,
        types: types,
        type: types[0],
        class: enc.class?.display || enc.class?.code || "Unknown",
        status: enc.status || "Unknown",
        period: {
          start: enc.period?.start?.split('T')[0] || "Unknown",
          end: enc.period?.end?.split('T')[0] || null,
          formatted: enc.period?.start ? 
            (enc.period?.end ? 
              `${enc.period.start.split('T')[0]} - ${enc.period.end.split('T')[0]}` : 
              `${enc.period.start.split('T')[0]} (ongoing)`) : 
            "Unknown date"
        },
        participants: participants,
        provider: participants[0]?.name || "Unknown provider",
        locations: locations,
        location: locations[0]?.name || "Unknown location",
        serviceProvider: enc.serviceProvider?.display || "Unknown organization",
        reasonCode: enc.reasonCode?.map(reason => 
          reason.text || reason.coding?.[0]?.display || "Unknown reason"
        ).join(', ') || null,
        diagnosis: enc.diagnosis?.map(diag => ({
          condition: diag.condition?.display || diag.condition?.reference || "Unknown condition",
          use: diag.use?.coding?.[0]?.display || diag.use?.text || "Unknown",
          rank: diag.rank || null
        })) || []
      };
    });

    return {
      resourceType: 'Encounter',
      count: encounters.length,
      total: data.total,
      encounters: encounters
    };
  }

  formatDiagnosticReportResults(data, params) {
    const reports = data.entry.map(entry => {
      const report = entry.resource;
      
      const codes = report.code?.coding?.map(coding => ({
        system: coding.system,
        code: coding.code,
        display: coding.display
      })) || [];

      return {
        id: report.id,
        name: report.code?.text || report.code?.coding?.[0]?.display || "Unknown report",
        codes: codes,
        status: report.status || "Unknown",
        category: report.category?.map(cat => 
          cat.coding?.[0]?.display || cat.text || "Unknown"
        ).join(', ') || "Unknown category",
        effectiveDate: report.effectiveDateTime?.split('T')[0] || report.effectivePeriod?.start?.split('T')[0] || "Unknown",
        issued: report.issued?.split('T')[0] || "Unknown",
        conclusion: report.conclusion || "No conclusion available",
        conclusionCode: report.conclusionCode?.map(code => 
          code.text || code.coding?.[0]?.display || "Unknown finding"
        ).join(', ') || null,
        performer: report.performer?.map(perf => 
          perf.display || perf.reference || "Unknown performer"
        ).join(', ') || "Unknown performer",
        resultsInterpreter: report.resultsInterpreter?.map(interp => 
          interp.display || interp.reference || "Unknown interpreter"
        ).join(', ') || null,
        specimen: report.specimen?.map(spec => 
          spec.display || spec.reference || "Unknown specimen"
        ).join(', ') || null,
        result: report.result?.map(res => 
          res.display || res.reference || "Unknown result"
        ).join(', ') || null
      };
    });

    return {
      resourceType: 'DiagnosticReport',
      count: reports.length,
      total: data.total,
      reports: reports
    };
  }

  formatAllergyIntoleranceResults(data, params) {
    const allergies = data.entry.map(entry => {
      const allergy = entry.resource;
      
      return {
        id: allergy.id,
        code: allergy.code?.text || allergy.code?.coding?.[0]?.display || "Unknown allergen",
        clinicalStatus: allergy.clinicalStatus?.coding?.[0]?.display || allergy.clinicalStatus?.text || "Unknown",
        verificationStatus: allergy.verificationStatus?.coding?.[0]?.display || allergy.verificationStatus?.text || "Unknown",
        type: allergy.type || "Unknown",
        category: allergy.category?.join(', ') || "Unknown",
        criticality: allergy.criticality || "Unknown",
        onsetDateTime: allergy.onsetDateTime?.split('T')[0] || "Unknown",
        recordedDate: allergy.recordedDate?.split('T')[0] || "Unknown",
        recorder: allergy.recorder?.display || allergy.recorder?.reference || "Unknown",
        asserter: allergy.asserter?.display || allergy.asserter?.reference || "Unknown",
        lastOccurrence: allergy.lastOccurrence?.split('T')[0] || null,
        reaction: allergy.reaction?.map(r => ({
          substance: r.substance?.text || r.substance?.coding?.[0]?.display || "Unknown",
          manifestation: r.manifestation?.map(m => 
            m.text || m.coding?.[0]?.display || "Unknown"
          ).join(', ') || "Unknown",
          severity: r.severity || "Unknown",
          onset: r.onset?.split('T')[0] || null
        })) || []
      };
    });

    return {
      resourceType: 'AllergyIntolerance',
      count: allergies.length,
      total: data.total,
      allergies: allergies
    };
  }

  formatAppointmentResults(data, params) {
    const appointments = data.entry.map(entry => {
      const appt = entry.resource;
      
      return {
        id: appt.id,
        status: appt.status || "Unknown",
        serviceCategory: appt.serviceCategory?.map(cat => 
          cat.text || cat.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        serviceType: appt.serviceType?.map(type => 
          type.text || type.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        specialty: appt.specialty?.map(spec => 
          spec.text || spec.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        appointmentType: appt.appointmentType?.text || appt.appointmentType?.coding?.[0]?.display || null,
        reasonCode: appt.reasonCode?.map(reason => 
          reason.text || reason.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        priority: appt.priority || null,
        description: appt.description || null,
        start: appt.start?.split('T')[0] || "Unknown",
        end: appt.end?.split('T')[0] || null,
        minutesDuration: appt.minutesDuration || null,
        created: appt.created?.split('T')[0] || "Unknown",
        participant: appt.participant?.map(p => ({
          actor: p.actor?.display || p.actor?.reference || "Unknown",
          required: p.required || "Unknown",
          status: p.status || "Unknown"
        })) || []
      };
    });

    return {
      resourceType: 'Appointment',
      count: appointments.length,
      total: data.total,
      appointments: appointments
    };
  }

  formatDocumentReferenceResults(data, params) {
    const documents = data.entry.map(entry => {
      const doc = entry.resource;
      
      // Extract Binary URLs for content retrieval
      const contentUrls = doc.content?.map(cont => ({
        contentType: cont.attachment?.contentType || "Unknown",
        binaryUrl: cont.attachment?.url || null,
        format: cont.format?.display || cont.format?.code || null
      })) || [];
      
      return {
        id: doc.id,
        status: doc.status || "Unknown",
        docStatus: doc.docStatus || null,
        type: doc.type?.text || doc.type?.coding?.[0]?.display || "Unknown",
        category: doc.category?.map(cat => 
          cat.text || cat.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        subject: doc.subject?.display || doc.subject?.reference || "Unknown",
        date: doc.date?.split('T')[0] || "Unknown",
        author: doc.author?.map(auth => 
          auth.display || auth.reference || "Unknown"
        ).join(', ') || null,
        authenticator: doc.authenticator?.display || doc.authenticator?.reference || null,
        custodian: doc.custodian?.display || doc.custodian?.reference || null,
        description: doc.description || null,
        // Include content URLs for Binary resource retrieval
        contentUrls: contentUrls,
        // Add note about how to retrieve content
        contentRetrievalNote: contentUrls.length > 0 ? 
          "To retrieve the actual note content, use the Binary resource IDs from contentUrls" : 
          "No content URLs available",
        context: {
          encounter: doc.context?.encounter?.map(enc => 
            enc.display || enc.reference || "Unknown"
          ).join(', ') || null,
          event: doc.context?.event?.map(ev => 
            ev.text || ev.coding?.[0]?.display || "Unknown"
          ).join(', ') || null,
          period: doc.context?.period ? {
            start: doc.context.period.start?.split('T')[0] || null,
            end: doc.context.period.end?.split('T')[0] || null
          } : null
        }
      };
    });

    return {
      resourceType: 'DocumentReference',
      count: documents.length,
      total: data.total,
      documents: documents,
      note: "DocumentReference contains metadata about clinical notes. To retrieve the actual note content, use the Binary resource IDs found in each document's contentUrls array."
    };
  }

  formatImmunizationResults(data, params) {
    const immunizations = data.entry.map(entry => {
      const imm = entry.resource;
      
      return {
        id: imm.id,
        status: imm.status || "Unknown",
        vaccineCode: imm.vaccineCode?.text || imm.vaccineCode?.coding?.[0]?.display || "Unknown",
        patient: imm.patient?.display || imm.patient?.reference || "Unknown",
        encounter: imm.encounter?.display || imm.encounter?.reference || null,
        occurrenceDateTime: imm.occurrenceDateTime?.split('T')[0] || imm.occurrenceString || "Unknown",
        recorded: imm.recorded?.split('T')[0] || null,
        primarySource: imm.primarySource || null,
        location: imm.location?.display || imm.location?.reference || null,
        manufacturer: imm.manufacturer?.display || imm.manufacturer?.reference || null,
        lotNumber: imm.lotNumber || null,
        expirationDate: imm.expirationDate || null,
        site: imm.site?.text || imm.site?.coding?.[0]?.display || null,
        route: imm.route?.text || imm.route?.coding?.[0]?.display || null,
        doseQuantity: imm.doseQuantity ? 
          `${imm.doseQuantity.value} ${imm.doseQuantity.unit || ''}` : null,
        performer: imm.performer?.map(perf => ({
          function: perf.function?.text || perf.function?.coding?.[0]?.display || "Unknown",
          actor: perf.actor?.display || perf.actor?.reference || "Unknown"
        })) || [],
        reasonCode: imm.reasonCode?.map(reason => 
          reason.text || reason.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        reaction: imm.reaction?.map(r => ({
          date: r.date?.split('T')[0] || null,
          detail: r.detail?.display || r.detail?.reference || null,
          reported: r.reported || null
        })) || []
      };
    });

    return {
      resourceType: 'Immunization',
      count: immunizations.length,
      total: data.total,
      immunizations: immunizations
    };
  }

  formatProcedureResults(data, params) {
    const procedures = data.entry.map(entry => {
      const proc = entry.resource;
      
      return {
        id: proc.id,
        status: proc.status || "Unknown",
        code: proc.code?.text || proc.code?.coding?.[0]?.display || "Unknown",
        category: proc.category?.text || proc.category?.coding?.[0]?.display || null,
        subject: proc.subject?.display || proc.subject?.reference || "Unknown",
        encounter: proc.encounter?.display || proc.encounter?.reference || null,
        performedDateTime: proc.performedDateTime?.split('T')[0] || null,
        performedPeriod: proc.performedPeriod ? {
          start: proc.performedPeriod.start?.split('T')[0] || null,
          end: proc.performedPeriod.end?.split('T')[0] || null
        } : null,
        recorded: proc.recorded?.split('T')[0] || null,
        performer: proc.performer?.map(perf => ({
          function: perf.function?.text || perf.function?.coding?.[0]?.display || null,
          actor: perf.actor?.display || perf.actor?.reference || "Unknown",
          onBehalfOf: perf.onBehalfOf?.display || perf.onBehalfOf?.reference || null
        })) || [],
        location: proc.location?.display || proc.location?.reference || null,
        reasonCode: proc.reasonCode?.map(reason => 
          reason.text || reason.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        bodySite: proc.bodySite?.map(site => 
          site.text || site.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        outcome: proc.outcome?.text || proc.outcome?.coding?.[0]?.display || null,
        complication: proc.complication?.map(comp => 
          comp.text || comp.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        followUp: proc.followUp?.map(fu => 
          fu.text || fu.coding?.[0]?.display || "Unknown"
        ).join(', ') || null,
        note: proc.note?.map(n => n.text).join('; ') || null
      };
    });

    return {
      resourceType: 'Procedure',
      count: procedures.length,
      total: data.total,
      procedures: procedures
    };
  }

  formatQuestionnaireResults(data, params) {
    const questionnaires = data.entry.map(entry => {
      const q = entry.resource;
      
      return {
        id: q.id,
        url: q.url || null,
        identifier: q.identifier?.map(id => 
          `${id.system || 'Unknown'}/${id.value || 'Unknown'}`
        ).join(', ') || null,
        version: q.version || null,
        name: q.name || null,
        title: q.title || "Unknown",
        derivedFrom: q.derivedFrom?.join(', ') || null,
        status: q.status || "Unknown",
        experimental: q.experimental || null,
        subjectType: q.subjectType?.join(', ') || null,
        date: q.date?.split('T')[0] || "Unknown",
        publisher: q.publisher || null,
        description: q.description || null,
        purpose: q.purpose || null,
        effectivePeriod: q.effectivePeriod ? {
          start: q.effectivePeriod.start?.split('T')[0] || null,
          end: q.effectivePeriod.end?.split('T')[0] || null
        } : null,
        code: q.code?.map(c => 
          c.text || c.coding?.[0]?.display || c.coding?.[0]?.code || "Unknown"
        ).join(', ') || null,
        itemCount: q.item?.length || 0
      };
    });

    return {
      resourceType: 'Questionnaire',
      count: questionnaires.length,
      total: data.total,
      questionnaires: questionnaires
    };
  }

  formatQuestionnaireResponseResults(data, params) {
    const responses = data.entry.map(entry => {
      const qr = entry.resource;
      
      return {
        id: qr.id,
        identifier: qr.identifier?.system && qr.identifier?.value ? 
          `${qr.identifier.system}/${qr.identifier.value}` : null,
        basedOn: qr.basedOn?.map(ref => ref.display || ref.reference).join(', ') || null,
        partOf: qr.partOf?.map(ref => ref.display || ref.reference).join(', ') || null,
        questionnaire: qr.questionnaire || "Unknown",
        status: qr.status || "Unknown",
        subject: qr.subject?.display || qr.subject?.reference || "Unknown",
        encounter: qr.encounter?.display || qr.encounter?.reference || null,
        authored: qr.authored?.split('T')[0] || "Unknown",
        author: qr.author?.display || qr.author?.reference || null,
        source: qr.source?.display || qr.source?.reference || null,
        itemCount: qr.item?.length || 0,
        items: qr.item?.map(item => ({
          linkId: item.linkId || "Unknown",
          text: item.text || null,
          answer: item.answer?.map(ans => {
            if (ans.valueString) return ans.valueString;
            if (ans.valueBoolean !== undefined) return ans.valueBoolean.toString();
            if (ans.valueInteger !== undefined) return ans.valueInteger.toString();
            if (ans.valueDecimal !== undefined) return ans.valueDecimal.toString();
            if (ans.valueDate) return ans.valueDate;
            if (ans.valueDateTime) return ans.valueDateTime;
            if (ans.valueCoding) return ans.valueCoding.display || ans.valueCoding.code;
            if (ans.valueReference) return ans.valueReference.display || ans.valueReference.reference;
            return "Unknown answer type";
          }).join(', ') || null
        })) || []
      };
    });

    return {
      resourceType: 'QuestionnaireResponse',
      count: responses.length,
      total: data.total,
      responses: responses
    };
  }

  formatBinaryResults(data, params) {
    if (!data?.entry?.length) {
      return { 
        resourceType: 'Binary',
        message: "No binary resources (clinical notes) found matching the criteria.",
        count: 0
      };
    }

    const binaries = data.entry.map(entry => {
      const binary = entry.resource;
      
      return {
        id: binary.id,
        contentType: binary.contentType || "Unknown",
        securityContext: binary.securityContext?.display || binary.securityContext?.reference || null,
        size: binary.data ? Math.ceil(binary.data.length * 0.75) : null, // Approximate size from base64
        lastUpdated: binary.meta?.lastUpdated || "Unknown",
        // Note: The actual content is base64 encoded in binary.data
        // For clinical notes, the contentType is typically 'text/plain' or 'application/pdf'
        hasContent: !!binary.data,
        note: "Use the Binary resource ID to retrieve the full content"
      };
    });

    return {
      resourceType: 'Binary',
      count: binaries.length,
      total: data.total,
      binaries: binaries,
      note: "Binary resources contain clinical notes and documents. The actual content needs to be decoded from base64."
    };
  }

  formatMedicationResults(data, params) {
    const medications = data.entry.map(entry => {
      const med = entry.resource;
      
      return {
        id: med.id,
        identifier: med.identifier?.map(id => 
          `${id.system || 'Unknown'}/${id.value || 'Unknown'}`
        ).join(', ') || null,
        code: med.code?.text || med.code?.coding?.[0]?.display || "Unknown",
        status: med.status || null,
        manufacturer: med.manufacturer?.display || med.manufacturer?.reference || null,
        form: med.form?.text || med.form?.coding?.[0]?.display || null,
        amount: med.amount ? {
          numerator: med.amount.numerator ? 
            `${med.amount.numerator.value} ${med.amount.numerator.unit || ''}` : null,
          denominator: med.amount.denominator ? 
            `${med.amount.denominator.value} ${med.amount.denominator.unit || ''}` : null
        } : null,
        ingredient: med.ingredient?.map(ing => ({
          item: ing.itemCodeableConcept?.text || 
                ing.itemCodeableConcept?.coding?.[0]?.display ||
                ing.itemReference?.display || 
                ing.itemReference?.reference || "Unknown",
          isActive: ing.isActive || null,
          strength: ing.strength ? {
            numerator: ing.strength.numerator ? 
              `${ing.strength.numerator.value} ${ing.strength.numerator.unit || ''}` : null,
            denominator: ing.strength.denominator ? 
              `${ing.strength.denominator.value} ${ing.strength.denominator.unit || ''}` : null
          } : null
        })) || [],
        batch: med.batch ? {
          lotNumber: med.batch.lotNumber || null,
          expirationDate: med.batch.expirationDate || null
        } : null
      };
    });

    return {
      resourceType: 'Medication',
      count: medications.length,
      total: data.total,
      medications: medications
    };
  }
}