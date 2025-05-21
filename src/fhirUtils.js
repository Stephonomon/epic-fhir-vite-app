// src/fhirUtils.js
// Utility functions for working with FHIR resources

/**
 * Extract patient information from FHIR patient resource and SMART client context
 * @param {Object} patient - FHIR Patient resource
 * @param {Object} context - Optional SMART client context containing additional information
 */
export function extractPatientInfo(patient, context = null) {
  if (!patient) return null;
  
  const name = patient.name?.[0]?.text || `${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`;
  const phone = patient.telecom?.find(t => t.system === 'phone')?.value;
  const email = patient.telecom?.find(t => t.system === 'email')?.value;
  const addr = patient.address?.[0];
  const address = addr
    ? `${addr.line?.join(' ')} ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}`
    : '';
  
  // Get PAT_ID from context
  // Need to check both context.state.tokenResponse and direct context.tokenResponse
  const tokenResp = context?.state?.tokenResponse || context?.tokenResponse;
  const patId = tokenResp?.pat_id || patient.id || 'N/A';
  
  // Get CSN from context
  const csn = tokenResp?.csn || 'N/A';
    
  return {
    name,
    gender: patient.gender || 'N/A',
    birthDate: patient.birthDate || 'N/A',
    id: patient.id || 'N/A', // Keep original FHIR ID
    patId, // Add Epic-specific PAT_ID
    csn,   // Add Epic-specific CSN
    phone: phone || 'N/A',
    email: email || 'N/A',
    address: address || 'N/A'
  };
}

/**
 * Process vital signs from FHIR observation resources
 */
export function processVitalSigns(vitals, count = 10) {
  if (!vitals?.entry?.length) return [];
  
  return vitals.entry.slice(0, count).map(entry => {
    const r = entry.resource;
    if (!r) return { error: "Malformed entry: no resource found" };
    
    let vitalName = r.code?.text || r.code?.coding?.[0]?.display || "Unknown Vital";
    let valueText = '';
    let dateTime = r.effectiveDateTime ? new Date(r.effectiveDateTime) : null;
    let date = dateTime ? dateTime.toLocaleDateString() : '';
    let fullDateTime = dateTime ? dateTime.toLocaleString() : '';
    
    if (r.valueQuantity) {
      valueText = `${r.valueQuantity.value} ${r.valueQuantity.unit || ''}`;
    } else if (r.component?.length) {
      const components = r.component.map(c => {
        const lab = c.code?.text || c.code?.coding?.[0]?.display || "Component";
        const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit || ''}` : 'N/A';
        return { name: lab, value: val };
      });
      
      // For display in UI
      valueText = components.map(c => `${c.name}: ${c.value}`).join('; ');
    } else {
      valueText = "N/A";
    }
    
    return {
      name: vitalName,
      value: valueText,
      date,
      fullDateTime,
      rawResource: r // Keep the raw resource for any additional processing
    };
  });
}

/**
 * Extract dosage instructions from medication resource
 */
export function extractMedicationInstructions(resource) {
  return (resource.dosageInstruction || [])
    .map(di => {
      if (di.patientInstruction) return di.patientInstruction;
      if (di.text && di.text.includes(',')) return di.text.split(',')[0].trim() + '.';
      return di.text || 'N/A';
    })
    .join('; ');
}

/**
 * Process medications from FHIR medicationRequest resources
 */
export function processMedications(meds, count = 10) {
  if (!meds?.entry?.length) return [];
  
  // Sort medications by date (newest first)
  const entries = (meds.entry || []).slice().sort((a, b) => {
    const da = a.resource.authoredOn ? new Date(a.resource.authoredOn) : 0;
    const db = b.resource.authoredOn ? new Date(b.resource.authoredOn) : 0;
    return db - da;
  });
  
  return entries.slice(0, count).map(({ resource }) => {
    const medicationName = resource.medicationCodeableConcept?.text || 
                          resource.medicationReference?.display || 
                          'Unknown';
    
    const status = resource.status || 'N/A';
    const date = resource.authoredOn?.split('T')[0] || 'N/A';
    const provider = resource.requester?.display || resource.requester?.reference || 'N/A';
    const instructions = extractMedicationInstructions(resource);
    
    // Additional details for UI display
    const dose = resource.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.value || '';
    const unit = resource.dosageInstruction?.[0]?.doseAndRate?.[0]?.doseQuantity?.unit || '';
    const frequency = resource.dosageInstruction?.[0]?.timing?.code?.text || '';
    
    return {
      name: medicationName,
      status,
      date,
      provider,
      instructions,
      dosage: {
        dose,
        unit,
        frequency,
        formatted: `${dose}${unit}${frequency ? ' - ' + frequency : ''}`
      },
      rawResource: resource // Keep the raw resource for any additional processing
    };
  });
}

/**
 * Process encounter resources
 * @param {Object} encounters - FHIR Bundle containing Encounter resources
 * @param {number} count - Maximum number of encounters to process
 * @returns {Array} Processed encounter data
 */
export function processEncounters(encounters, count = 10) {
  if (!encounters?.entry?.length) return [];
  
  // Sort encounters by date (newest first)
  const entries = (encounters.entry || []).slice().sort((a, b) => {
    const da = a.resource.period?.start ? new Date(a.resource.period.start) : 0;
    const db = b.resource.period?.start ? new Date(b.resource.period.start) : 0;
    return db - da;
  });
  
  return entries.slice(0, count).map(({ resource }) => {
    // Extract key encounter information
    const type = resource.type?.[0]?.text || 
                resource.type?.[0]?.coding?.[0]?.display || 'Unknown';
    
    const status = resource.status || 'N/A';
    
    // Format dates
    let startDate = 'N/A';
    let endDate = 'N/A';
    let formattedPeriod = 'N/A';
    
    if (resource.period?.start) {
      startDate = new Date(resource.period.start).toLocaleDateString();
      if (resource.period?.end) {
        endDate = new Date(resource.period.end).toLocaleDateString();
        if (startDate === endDate) {
          formattedPeriod = startDate;
        } else {
          formattedPeriod = `${startDate} - ${endDate}`;
        }
      } else {
        formattedPeriod = `${startDate} (ongoing)`;
      }
    }
    
    // Get provider
    const provider = resource.participant?.[0]?.individual?.display || 'N/A';
    
    // Get location
    const location = resource.location?.[0]?.location?.display || 'N/A';
    
    // Get service provider/organization
    const serviceProvider = resource.serviceProvider?.display || 'N/A';
    
    // Get class
    const encounterClass = resource.class?.display || resource.class?.code || 'N/A';
    
    return {
      id: resource.id,
      type,
      status,
      period: {
        start: startDate,
        end: endDate,
        formatted: formattedPeriod
      },
      provider,
      location,
      serviceProvider,
      class: encounterClass,
      rawResource: resource // Keep the raw resource for additional processing
    };
  });
}

/**
 * Process condition resources
 * @param {Object} conditions - FHIR Bundle containing Condition resources
 * @param {number} count - Maximum number of conditions to process
 * @returns {Array} Processed condition data
 */
export function processConditions(conditions, count = 10) {
  if (!conditions?.entry?.length) return [];
  
  // Sort conditions by date (newest first)
  const entries = (conditions.entry || []).slice().sort((a, b) => {
    const da = a.resource.recordedDate ? new Date(a.resource.recordedDate) : 0;
    const db = b.resource.recordedDate ? new Date(b.resource.recordedDate) : 0;
    return db - da;
  });
  
  return entries.slice(0, count).map(({ resource }) => {
    // Extract key condition information
    const code = resource.code?.text || 
                resource.code?.coding?.[0]?.display || 'Unknown';
    
    // Get clinical status
    const clinicalStatus = resource.clinicalStatus?.coding?.[0]?.display || 
                         resource.clinicalStatus?.text || 'N/A';
    
    // Get verification status
    const verificationStatus = resource.verificationStatus?.coding?.[0]?.display || 
                             resource.verificationStatus?.text || 'N/A';
    
    // Get category (problem, health-concern, etc.)
    const categories = resource.category?.map(cat => 
      cat.coding?.[0]?.display || cat.text || 'Unknown'
    ) || ['Unknown'];
    
    // Get onset date
    const onsetDate = resource.onsetDateTime ? 
                    new Date(resource.onsetDateTime).toLocaleDateString() : 
                    'N/A';
    
    // Get recorded date
    const recordedDate = resource.recordedDate ? 
                      new Date(resource.recordedDate).toLocaleDateString() : 
                      'N/A';
    
    return {
      id: resource.id,
      code,
      clinicalStatus,
      verificationStatus,
      categories,
      category: categories.join(', '), // For easier display
      onsetDate,
      recordedDate,
      rawResource: resource // Keep the raw resource for additional processing
    };
  });
}