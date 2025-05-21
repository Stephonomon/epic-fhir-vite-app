// src/fhirUtils.js
// Utility functions for working with FHIR resources

/**
 * Extract patient information from FHIR patient resource
 */
export function extractPatientInfo(patient) {
  if (!patient) return null;
  
  const name = patient.name?.[0]?.text || `${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`;
  const phone = patient.telecom?.find(t => t.system === 'phone')?.value;
  const email = patient.telecom?.find(t => t.system === 'email')?.value;
  const addr = patient.address?.[0];
  const address = addr
    ? `${addr.line?.join(' ')} ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}`
    : '';
    
  return {
    name,
    gender: patient.gender || 'N/A',
    birthDate: patient.birthDate || 'N/A',
    id: patient.id || 'N/A',
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