// src/fhirTools.js
// FHIR-specific tools for LLM function calling

export class FHIRTools {
  constructor(client, backendUrl) {
    this.client = client;
    this.backendUrl = backendUrl;
  }

  // Define available FHIR tools for the LLM
  getToolDefinitions() {
    return [
      {
        type: "function",
        function: {
          name: "search_observations",
          description: "Search for patient observations (vital signs, lab results, etc.) with flexible filtering",
          parameters: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description: "Observation category (e.g., 'vital-signs', 'laboratory', 'exam')",
                enum: ["vital-signs", "laboratory", "exam", "imaging", "procedure", "social-history", "functional-status", "survey"]
              },
              code: {
                type: "string", 
                description: "LOINC or SNOMED code for specific observation type"
              },
              code_text: {
                type: "string",
                description: "Search by observation name/text (e.g., 'blood pressure', 'hemoglobin', 'weight')"
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  end: { type: "string", description: "End date (YYYY-MM-DD)" }
                }
              },
              count: {
                type: "integer",
                description: "Maximum number of results to return",
                default: 25,
                maximum: 200
              },
              status: {
                type: "string",
                description: "Observation status",
                enum: ["registered", "preliminary", "final", "amended", "corrected", "cancelled", "entered-in-error", "unknown"]
              },
              include_components: {
                type: "boolean",
                description: "Include observations with multiple components (like BP with systolic/diastolic)",
                default: true
              }
            },
            required: []
          }
        }
      },
      {
        type: "function", 
        function: {
          name: "search_medications",
          description: "Search for patient medications with filtering options",
          parameters: {
            type: "object",
            properties: {
              status: {
                type: "string",
                description: "Medication status",
                enum: ["active", "completed", "cancelled", "draft", "entered-in-error", "stopped", "on-hold", "unknown"]
              },
              medication_name: {
                type: "string",
                description: "Name or partial name of medication to search for"
              },
              date_range: {
                type: "object", 
                properties: {
                  start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  end: { type: "string", description: "End date (YYYY-MM-DD)" }
                }
              },
              count: {
                type: "integer",
                description: "Maximum number of results",
                default: 25,
                maximum: 100
              },
              include_historical: {
                type: "boolean",
                description: "Include discontinued/historical medications",
                default: true
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_conditions",
          description: "Search for patient conditions/problems with filtering",
          parameters: {
            type: "object",
            properties: {
              clinical_status: {
                type: "string", 
                description: "Clinical status of condition",
                enum: ["active", "inactive", "resolved", "remission", "relapse", "well-controlled", "poorly-controlled"]
              },
              verification_status: {
                type: "string",
                description: "Verification status of condition", 
                enum: ["unconfirmed", "provisional", "differential", "confirmed", "refuted", "entered-in-error"]
              },
              category: {
                type: "string",
                description: "Condition category",
                enum: ["problem-list-item", "health-concern", "encounter-diagnosis", "billing-diagnosis"]
              },
              condition_name: {
                type: "string",
                description: "Name or partial name of condition to search for"
              },
              condition_code: {
                type: "string",
                description: "ICD-10 or SNOMED code for specific condition"
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  end: { type: "string", description: "End date (YYYY-MM-DD)" }
                }
              },
              count: {
                type: "integer",
                default: 25,
                maximum: 100
              },
              include_resolved: {
                type: "boolean",
                description: "Include resolved/inactive conditions",
                default: true
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_encounters", 
          description: "Search for patient encounters/visits",
          parameters: {
            type: "object",
            properties: {
              encounter_type: {
                type: "string",
                description: "Type of encounter (e.g., 'office visit', 'emergency', 'inpatient', 'telehealth')"
              },
              encounter_class: {
                type: "string",
                description: "Encounter class",
                enum: ["ambulatory", "emergency", "inpatient", "outpatient", "observation", "virtual", "home-health"]
              },
              status: {
                type: "string",
                enum: ["planned", "arrived", "triaged", "in-progress", "onleave", "finished", "cancelled", "entered-in-error", "unknown"]
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  end: { type: "string", description: "End date (YYYY-MM-DD)" }
                }
              },
              provider_name: {
                type: "string",
                description: "Search by provider/practitioner name"
              },
              location_name: {
                type: "string", 
                description: "Search by location/facility name"
              },
              count: {
                type: "integer",
                default: 25,
                maximum: 100
              },
              include_historical: {
                type: "boolean",
                description: "Include all historical encounters",
                default: true
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "search_diagnostic_reports",
          description: "Search for diagnostic reports (lab reports, imaging reports, etc.)",
          parameters: {
            type: "object", 
            properties: {
              category: {
                type: "string",
                description: "Report category",
                enum: ["LAB", "RAD", "PATH", "CARDIO", "ENDO", "NEURO", "DERM", "OTH", "AU", "BG", "CG", "CH", "CP", "CT", "GE", "HM", "ICU", "IMM", "LAB", "MB", "MCB", "MYC", "NMS", "NRS", "OBS", "OTH", "OUS", "PHR", "PHY", "PT", "RAD", "RX", "SP", "SR", "TX", "URN", "VR", "VUS", "XRC"]
              },
              status: {
                type: "string",
                enum: ["registered", "partial", "preliminary", "final", "amended", "corrected", "appended", "cancelled", "entered-in-error", "unknown"]
              },
              report_name: {
                type: "string",
                description: "Search by report name/type (e.g., 'CBC', 'chest x-ray', 'echocardiogram')"
              },
              report_code: {
                type: "string",
                description: "LOINC code for specific report type"
              },
              date_range: {
                type: "object",
                properties: {
                  start: { type: "string", description: "Start date (YYYY-MM-DD)" },
                  end: { type: "string", description: "End date (YYYY-MM-DD)" }
                }
              },
              count: {
                type: "integer",
                default: 20,
                maximum: 100
              },
              include_preliminary: {
                type: "boolean",
                description: "Include preliminary/partial reports",
                default: false
              }
            }
          }
        }
      },
      {
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
      }
    ];
  }

  // Execute FHIR tool functions
  async executeTool(toolName, parameters) {
    try {
      switch (toolName) {
        case "search_observations":
          return await this.searchObservations(parameters);
        case "search_medications":
          return await this.searchMedications(parameters);
        case "search_conditions":
          return await this.searchConditions(parameters);
        case "search_encounters":
          return await this.searchEncounters(parameters);
        case "search_diagnostic_reports":
          return await this.searchDiagnosticReports(parameters);
        case "get_patient_summary":
          return await this.getPatientSummary();
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return { error: `Failed to execute ${toolName}: ${error.message}` };
    }
  }

  // Tool implementation methods
  async searchObservations(params) {
    let path = 'Observation';
    const queryParams = [];

    if (params.category) {
      queryParams.push(`category=${params.category}`);
    }
    if (params.code) {
      queryParams.push(`code=${params.code}`);
    }
    if (params.status) {
      queryParams.push(`status=${params.status}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`date=le${params.date_range.end}`);
    }
    
    queryParams.push(`_sort=-date`);
    queryParams.push(`_count=${params.count || 25}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    // Try primary search with all parameters
    let data;
    try {
      data = await this.fetchResource(path);
    } catch (error) {
      console.warn("Primary observation search failed:", error.message);
      
      // Fallback 1: Try without date filtering
      if (params.date_range) {
        const fallbackParams = [];
        if (params.category) fallbackParams.push(`category=${params.category}`);
        if (params.code) fallbackParams.push(`code=${params.code}`);
        if (params.status) fallbackParams.push(`status=${params.status}`);
        fallbackParams.push(`_sort=-date`);
        fallbackParams.push(`_count=${params.count || 25}`);
        
        try {
          data = await this.fetchResource('Observation?' + fallbackParams.join('&'));
          console.log("Observation fallback search (no dates) succeeded");
        } catch (fallbackError) {
          console.warn("Observation fallback search failed:", fallbackError.message);
          
          // Fallback 2: Basic category search only
          if (params.category) {
            try {
              data = await this.fetchResource(`Observation?category=${params.category}&_count=${params.count || 25}`);
              console.log("Basic observation category search succeeded");
            } catch (categoryError) {
              // Final fallback: All observations
              data = await this.fetchResource(`Observation?_count=${params.count || 25}`);
              console.log("Basic observation search used as final fallback");
            }
          } else {
            // Final fallback: All observations
            data = await this.fetchResource(`Observation?_count=${params.count || 25}`);
            console.log("Basic observation search used as final fallback");
          }
        }
      } else {
        throw error;
      }
    }

    return this.formatObservationResults(data, params.code_text);
  }

  async searchMedications(params) {
    let path = 'MedicationRequest';
    const queryParams = [];

    if (params.status) {
      queryParams.push(`status=${params.status}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`authoredon=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`authoredon=le${params.date_range.end}`);
    }

    queryParams.push(`_sort=-authoredon`);
    queryParams.push(`_count=${params.count || 25}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    // First try with the constructed query
    let data;
    try {
      data = await this.fetchResource(path);
    } catch (error) {
      console.warn("First medication search failed:", error.message);
      
      // Fallback: Try without date parameters (Epic might not support authoredon filtering)
      if (params.date_range) {
        const fallbackParams = [];
        if (params.status) {
          fallbackParams.push(`status=${params.status}`);
        }
        fallbackParams.push(`_sort=-date`); // Try different sort field
        fallbackParams.push(`_count=${params.count || 25}`);
        
        const fallbackPath = 'MedicationRequest?' + fallbackParams.join('&');
        try {
          data = await this.fetchResource(fallbackPath);
          console.log("Fallback medication search succeeded");
        } catch (fallbackError) {
          console.warn("Fallback medication search failed:", fallbackError.message);
          
          // Final fallback: Basic search with no filters
          data = await this.fetchResource(`MedicationRequest?_count=${params.count || 25}`);
          console.log("Basic medication search used as final fallback");
        }
      } else {
        throw error;
      }
    }

    return this.formatMedicationResults(data, params.medication_name);
  }

  async searchConditions(params) {
    let path = 'Condition';
    const queryParams = [];

    if (params.clinical_status) {
      queryParams.push(`clinical-status=${params.clinical_status}`);
    }
    if (params.verification_status) {
      queryParams.push(`verification-status=${params.verification_status}`);
    }
    if (params.category) {
      queryParams.push(`category=${params.category}`);
    }
    if (params.condition_code) {
      queryParams.push(`code=${params.condition_code}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`recorded-date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`recorded-date=le${params.date_range.end}`);
    }

    queryParams.push(`_sort=-recorded-date`);
    queryParams.push(`_count=${params.count || 25}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    // Try primary search
    let data;
    try {
      data = await this.fetchResource(path);
    } catch (error) {
      console.warn("Primary condition search failed:", error.message);
      
      // Fallback 1: Try with onset-date instead of recorded-date
      if (params.date_range) {
        const fallbackParams = [];
        if (params.clinical_status) fallbackParams.push(`clinical-status=${params.clinical_status}`);
        if (params.category) fallbackParams.push(`category=${params.category}`);
        if (params.condition_code) fallbackParams.push(`code=${params.condition_code}`);
        if (params.date_range?.start) fallbackParams.push(`onset-date=ge${params.date_range.start}`);
        if (params.date_range?.end) fallbackParams.push(`onset-date=le=${params.date_range.end}`);
        fallbackParams.push(`_count=${params.count || 25}`);
        
        try {
          data = await this.fetchResource('Condition?' + fallbackParams.join('&'));
          console.log("Condition fallback search (onset-date) succeeded");
        } catch (fallbackError) {
          console.warn("Condition onset-date fallback failed:", fallbackError.message);
          
          // Fallback 2: No date filtering
          const noDateParams = [];
          if (params.clinical_status) noDateParams.push(`clinical-status=${params.clinical_status}`);
          if (params.category) noDateParams.push(`category=${params.category}`);
          noDateParams.push(`_count=${params.count || 25}`);
          
          try {
            data = await this.fetchResource('Condition?' + noDateParams.join('&'));
            console.log("Condition search without dates succeeded");
          } catch (noDateError) {
            // Final fallback: Basic search
            data = await this.fetchResource(`Condition?_count=${params.count || 25}`);
            console.log("Basic condition search used as final fallback");
          }
        }
      } else {
        throw error;
      }
    }

    return this.formatConditionResults(data, params.condition_name);
  }

  async searchEncounters(params) {
    let path = 'Encounter';
    const queryParams = [];

    if (params.status) {
      queryParams.push(`status=${params.status}`);
    }
    if (params.encounter_class) {
      queryParams.push(`class=${params.encounter_class}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`date=le${params.date_range.end}`);
    }

    queryParams.push(`_sort=-date`);
    queryParams.push(`_count=${params.count || 25}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    // Try primary search
    let data;
    try {
      data = await this.fetchResource(path);
    } catch (error) {
      console.warn("Primary encounter search failed:", error.message);
      
      // Fallback 1: Try with period instead of date
      if (params.date_range) {
        const fallbackParams = [];
        if (params.status) fallbackParams.push(`status=${params.status}`);
        if (params.encounter_class) fallbackParams.push(`class=${params.encounter_class}`);
        if (params.date_range?.start) fallbackParams.push(`period=ge${params.date_range.start}`);
        if (params.date_range?.end) fallbackParams.push(`period=le${params.date_range.end}`);
        fallbackParams.push(`_sort=-period`);
        fallbackParams.push(`_count=${params.count || 25}`);
        
        try {
          data = await this.fetchResource('Encounter?' + fallbackParams.join('&'));
          console.log("Encounter fallback search (period) succeeded");
        } catch (fallbackError) {
          console.warn("Encounter period fallback failed:", fallbackError.message);
          
          // Fallback 2: No date filtering
          const noDateParams = [];
          if (params.status) noDateParams.push(`status=${params.status}`);
          if (params.encounter_class) noDateParams.push(`class=${params.encounter_class}`);
          noDateParams.push(`_count=${params.count || 25}`);
          
          try {
            data = await this.fetchResource('Encounter?' + noDateParams.join('&'));
            console.log("Encounter search without dates succeeded");
          } catch (noDateError) {
            // Final fallback: Basic search
            data = await this.fetchResource(`Encounter?_count=${params.count || 25}`);
            console.log("Basic encounter search used as final fallback");
          }
        }
      } else {
        throw error;
      }
    }

    return this.formatEncounterResults(data, params.encounter_type, params.provider_name, params.location_name);
  }

  async searchDiagnosticReports(params) {
    let path = 'DiagnosticReport';
    const queryParams = [];

    if (params.category) {
      queryParams.push(`category=${params.category}`);
    }
    if (params.status) {
      queryParams.push(`status=${params.status}`);
    }
    if (params.report_code) {
      queryParams.push(`code=${params.report_code}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`date=le${params.date_range.end}`);
    }

    queryParams.push(`_sort=-date`);
    queryParams.push(`_count=${params.count || 20}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    // Try primary search
    let data;
    try {
      data = await this.fetchResource(path);
    } catch (error) {
      console.warn("Primary diagnostic report search failed:", error.message);
      
      // Fallback 1: Try with effective date instead of date
      if (params.date_range) {
        const fallbackParams = [];
        if (params.category) fallbackParams.push(`category=${params.category}`);
        if (params.status) fallbackParams.push(`status=${params.status}`);
        if (params.report_code) fallbackParams.push(`code=${params.report_code}`);
        if (params.date_range?.start) fallbackParams.push(`effective-date=ge${params.date_range.start}`);
        if (params.date_range?.end) fallbackParams.push(`effective-date=le${params.date_range.end}`);
        fallbackParams.push(`_sort=-effective-date`);
        fallbackParams.push(`_count=${params.count || 20}`);
        
        try {
          data = await this.fetchResource('DiagnosticReport?' + fallbackParams.join('&'));
          console.log("Diagnostic report fallback search (effective-date) succeeded");
        } catch (fallbackError) {
          console.warn("Diagnostic report effective-date fallback failed:", fallbackError.message);
          
          // Fallback 2: No date filtering
          const noDateParams = [];
          if (params.category) noDateParams.push(`category=${params.category}`);
          if (params.status) noDateParams.push(`status=${params.status}`);
          noDateParams.push(`_count=${params.count || 20}`);
          
          try {
            data = await this.fetchResource('DiagnosticReport?' + noDateParams.join('&'));
            console.log("Diagnostic report search without dates succeeded");
          } catch (noDateError) {
            // Final fallback: Basic search
            data = await this.fetchResource(`DiagnosticReport?_count=${params.count || 20}`);
            console.log("Basic diagnostic report search used as final fallback");
          }
        }
      } else {
        throw error;
      }
    }

    return this.formatDiagnosticReportResults(data, params.report_name);
  }

  async getPatientSummary() {
    const patientData = await this.fetchResource(`Patient/${this.client.patient.id}`);
    return this.formatPatientSummary(patientData);
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

  // Result formatting methods
  formatObservationResults(data, codeTextFilter) {
    if (!data?.entry?.length) {
      return { message: "No observations found matching the criteria." };
    }

    let observations = data.entry.map(entry => {
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

    // Client-side filtering by observation name/text if specified
    if (codeTextFilter) {
      observations = observations.filter(obs => 
        obs.name.toLowerCase().includes(codeTextFilter.toLowerCase())
      );
    }

    return {
      count: observations.length,
      observations: observations
    };
  }

  formatMedicationResults(data, nameFilter) {
    if (!data?.entry?.length) {
      return { message: "No medications found matching the criteria." };
    }

    let medications = data.entry.map(entry => {
      const med = entry.resource;
      const name = med.medicationCodeableConcept?.text || 
                  med.medicationReference?.display || 
                  'Unknown';
      
      return {
        name: name,
        status: med.status,
        authoredOn: med.authoredOn,
        dosage: med.dosageInstruction?.[0]?.text || "No dosage info",
        requester: med.requester?.display || "Unknown provider"
      };
    });

    // Client-side filtering by medication name if specified
    if (nameFilter) {
      medications = medications.filter(med => 
        med.name.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }

    return {
      count: medications.length,
      medications: medications
    };
  }

  formatConditionResults(data, nameFilter) {
    if (!data?.entry?.length) {
      return { message: "No conditions found matching the criteria." };
    }

    let conditions = data.entry.map(entry => {
      const condition = entry.resource;
      const name = condition.code?.text || 
                  condition.code?.coding?.[0]?.display || 
                  'Unknown condition';

      // Get all available codes for better searching
      const codes = condition.code?.coding?.map(coding => ({
        system: coding.system,
        code: coding.code,
        display: coding.display
      })) || [];

      return {
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
        stage: condition.stage?.[0]?.summary?.text || condition.stage?.[0]?.summary?.coding?.[0]?.display || null,
        bodySite: condition.bodySite?.map(site => 
          site.text || site.coding?.[0]?.display || "Unknown site"
        ).join(', ') || null,
        note: condition.note?.map(note => note.text).join('; ') || null
      };
    });

    // Client-side filtering by condition name if specified
    if (nameFilter) {
      conditions = conditions.filter(cond => 
        cond.name.toLowerCase().includes(nameFilter.toLowerCase()) ||
        cond.codes.some(code => 
          code.display?.toLowerCase().includes(nameFilter.toLowerCase()) ||
          code.code?.toLowerCase().includes(nameFilter.toLowerCase())
        )
      );
    }

    return {
      count: conditions.length,
      conditions: conditions
    };
  }

  formatEncounterResults(data, typeFilter, providerFilter, locationFilter) {
    if (!data?.entry?.length) {
      return { message: "No encounters found matching the criteria." };
    }

    let encounters = data.entry.map(entry => {
      const enc = entry.resource;
      
      // Get all encounter types/codes
      const types = enc.type?.map(type => 
        type.text || type.coding?.[0]?.display || "Unknown"
      ) || ["Unknown"];

      // Get all participants (providers)
      const participants = enc.participant?.map(p => ({
        name: p.individual?.display || p.individual?.reference || "Unknown provider",
        type: p.type?.[0]?.coding?.[0]?.display || p.type?.[0]?.text || "Unknown role"
      })) || [];

      // Get all locations
      const locations = enc.location?.map(loc => ({
        name: loc.location?.display || loc.location?.reference || "Unknown location",
        status: loc.status || "Unknown"
      })) || [];

      return {
        id: enc.id,
        types: types,
        type: types[0], // Primary type for backward compatibility
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
        provider: participants[0]?.name || "Unknown provider", // Primary provider for backward compatibility
        locations: locations,
        location: locations[0]?.name || "Unknown location", // Primary location for backward compatibility
        serviceProvider: enc.serviceProvider?.display || "Unknown organization",
        reasonCode: enc.reasonCode?.map(reason => 
          reason.text || reason.coding?.[0]?.display || "Unknown reason"
        ).join(', ') || null,
        reasonReference: enc.reasonReference?.map(ref => ref.display || ref.reference).join(', ') || null,
        diagnosis: enc.diagnosis?.map(diag => ({
          condition: diag.condition?.display || diag.condition?.reference || "Unknown condition",
          use: diag.use?.coding?.[0]?.display || diag.use?.text || "Unknown",
          rank: diag.rank || null
        })) || [],
        hospitalization: enc.hospitalization ? {
          admitSource: enc.hospitalization.admitSource?.text || enc.hospitalization.admitSource?.coding?.[0]?.display || null,
          dischargeDisposition: enc.hospitalization.dischargeDisposition?.text || enc.hospitalization.dischargeDisposition?.coding?.[0]?.display || null
        } : null
      };
    });

    // Client-side filtering
    if (typeFilter) {
      encounters = encounters.filter(enc => 
        enc.types.some(type => type.toLowerCase().includes(typeFilter.toLowerCase()))
      );
    }
    
    if (providerFilter) {
      encounters = encounters.filter(enc => 
        enc.participants.some(participant => 
          participant.name.toLowerCase().includes(providerFilter.toLowerCase())
        )
      );
    }
    
    if (locationFilter) {
      encounters = encounters.filter(enc => 
        enc.locations.some(location => 
          location.name.toLowerCase().includes(locationFilter.toLowerCase())
        )
      );
    }

    return {
      count: encounters.length,
      encounters: encounters
    };
  }

  formatDiagnosticReportResults(data, reportNameFilter) {
    if (!data?.entry?.length) {
      return { message: "No diagnostic reports found matching the criteria." };
    }

    let reports = data.entry.map(entry => {
      const report = entry.resource;
      
      // Get all codes for better searching
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
        presentedForm: report.presentedForm?.map(form => ({
          contentType: form.contentType,
          title: form.title,
          size: form.size
        })) || [],
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
        ).join(', ') || null,
        imagingStudy: report.imagingStudy?.map(study => 
          study.display || study.reference || "Unknown study"
        ).join(', ') || null,
        media: report.media?.map(media => ({
          comment: media.comment,
          link: media.link?.display || media.link?.reference
        })) || []
      };
    });

    // Client-side filtering by report name if specified
    if (reportNameFilter) {
      reports = reports.filter(report => 
        report.name.toLowerCase().includes(reportNameFilter.toLowerCase()) ||
        report.codes.some(code => 
          code.display?.toLowerCase().includes(reportNameFilter.toLowerCase()) ||
          code.code?.toLowerCase().includes(reportNameFilter.toLowerCase())
        )
      );
    }

    return {
      count: reports.length,
      reports: reports
    };
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
}