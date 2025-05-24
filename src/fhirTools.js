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
                enum: ["vital-signs", "laboratory", "exam", "imaging", "procedure", "social-history"]
              },
              code: {
                type: "string", 
                description: "LOINC or SNOMED code for specific observation type"
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
                default: 10
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
                enum: ["active", "completed", "cancelled", "draft", "entered-in-error", "stopped"]
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
                default: 10
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
                enum: ["active", "inactive", "resolved", "remission"]
              },
              category: {
                type: "string",
                description: "Condition category",
                enum: ["problem-list-item", "health-concern", "encounter-diagnosis"]
              },
              condition_name: {
                type: "string",
                description: "Name or partial name of condition to search for"
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
                default: 10
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
                description: "Type of encounter (e.g., 'office visit', 'emergency', 'inpatient')"
              },
              status: {
                type: "string",
                enum: ["planned", "arrived", "triaged", "in-progress", "finished", "cancelled"]
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
                default: 10
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
                enum: ["LAB", "RAD", "PATH", "CARDIO", "ENDO"]
              },
              status: {
                type: "string",
                enum: ["registered", "partial", "preliminary", "final", "amended", "corrected", "cancelled"]
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
                default: 5
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
    if (params.date_range?.start) {
      queryParams.push(`date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`date=le${params.date_range.end}`);
    }
    
    queryParams.push(`_sort=-date`);
    queryParams.push(`_count=${params.count || 10}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    const data = await this.fetchResource(path);
    return this.formatObservationResults(data);
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
    queryParams.push(`_count=${params.count || 10}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    const data = await this.fetchResource(path);
    return this.formatMedicationResults(data, params.medication_name);
  }

  async searchConditions(params) {
    let path = 'Condition';
    const queryParams = [];

    if (params.clinical_status) {
      queryParams.push(`clinical-status=${params.clinical_status}`);
    }
    if (params.category) {
      queryParams.push(`category=${params.category}`);
    }
    if (params.date_range?.start) {
      queryParams.push(`recorded-date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`recorded-date=le${params.date_range.end}`);
    }

    queryParams.push(`_count=${params.count || 10}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    const data = await this.fetchResource(path);
    return this.formatConditionResults(data, params.condition_name);
  }

  async searchEncounters(params) {
    let path = 'Encounter';
    const queryParams = [];

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
    queryParams.push(`_count=${params.count || 10}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    const data = await this.fetchResource(path);
    return this.formatEncounterResults(data, params.encounter_type);
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
    if (params.date_range?.start) {
      queryParams.push(`date=ge${params.date_range.start}`);
    }
    if (params.date_range?.end) {
      queryParams.push(`date=le${params.date_range.end}`);
    }

    queryParams.push(`_sort=-date`);
    queryParams.push(`_count=${params.count || 5}`);

    if (queryParams.length > 0) {
      path += '?' + queryParams.join('&');
    }

    const data = await this.fetchResource(path);
    return this.formatDiagnosticReportResults(data);
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
  formatObservationResults(data) {
    if (!data?.entry?.length) {
      return { message: "No observations found matching the criteria." };
    }

    const observations = data.entry.map(entry => {
      const obs = entry.resource;
      let value = "N/A";
      
      if (obs.valueQuantity) {
        value = `${obs.valueQuantity.value} ${obs.valueQuantity.unit || ''}`;
      } else if (obs.valueString) {
        value = obs.valueString;
      } else if (obs.component?.length) {
        value = obs.component.map(c => {
          const compName = c.code?.text || c.code?.coding?.[0]?.display || "Component";
          const compValue = c.valueQuantity ? 
            `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}` : 
            c.valueString || "N/A";
          return `${compName}: ${compValue}`;
        }).join('; ');
      }

      return {
        name: obs.code?.text || obs.code?.coding?.[0]?.display || "Unknown",
        value: value,
        date: obs.effectiveDateTime || obs.effectivePeriod?.start || "Unknown date",
        status: obs.status,
        category: obs.category?.[0]?.coding?.[0]?.display || obs.category?.[0]?.text || "Unknown"
      };
    });

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

      return {
        name: name,
        clinicalStatus: condition.clinicalStatus?.coding?.[0]?.display || condition.clinicalStatus?.text,
        verificationStatus: condition.verificationStatus?.coding?.[0]?.display,
        onsetDate: condition.onsetDateTime || condition.recordedDate,
        category: condition.category?.[0]?.coding?.[0]?.display || "Unknown"
      };
    });

    // Client-side filtering by condition name if specified
    if (nameFilter) {
      conditions = conditions.filter(cond => 
        cond.name.toLowerCase().includes(nameFilter.toLowerCase())
      );
    }

    return {
      count: conditions.length,
      conditions: conditions
    };
  }

  formatEncounterResults(data, typeFilter) {
    if (!data?.entry?.length) {
      return { message: "No encounters found matching the criteria." };
    }

    let encounters = data.entry.map(entry => {
      const enc = entry.resource;
      return {
        type: enc.type?.[0]?.text || enc.type?.[0]?.coding?.[0]?.display || "Unknown",
        status: enc.status,
        period: {
          start: enc.period?.start,
          end: enc.period?.end
        },
        location: enc.location?.[0]?.location?.display || "Unknown location",
        provider: enc.participant?.[0]?.individual?.display || "Unknown provider"
      };
    });

    // Client-side filtering by encounter type if specified
    if (typeFilter) {
      encounters = encounters.filter(enc => 
        enc.type.toLowerCase().includes(typeFilter.toLowerCase())
      );
    }

    return {
      count: encounters.length,
      encounters: encounters
    };
  }

  formatDiagnosticReportResults(data) {
    if (!data?.entry?.length) {
      return { message: "No diagnostic reports found matching the criteria." };
    }

    const reports = data.entry.map(entry => {
      const report = entry.resource;
      return {
        name: report.code?.text || report.code?.coding?.[0]?.display || "Unknown report",
        status: report.status,
        category: report.category?.[0]?.coding?.[0]?.display || "Unknown category",
        effectiveDate: report.effectiveDateTime || report.effectivePeriod?.start,
        issued: report.issued,
        conclusion: report.conclusion || "No conclusion available"
      };
    });

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