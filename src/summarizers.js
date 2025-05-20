// summarizers.js
export function summarizePatient(patient) {
  if (!patient) return "No patient data.";
  return `Patient Name: ${patient.name?.[0]?.text || ''}\nGender: ${patient.gender}\nDate of Birth: ${patient.birthDate}`;
}

export function summarizeVitals(vitals, count = 3) {
  if (!vitals?.entry?.length) return "No recent vitals.";
  // Pull the most recent {count} unique measurements
  let summary = [];
  for (const e of vitals.entry) {
    if (summary.length >= count) break;
    const r = e.resource;
    if (!r) continue;
    // Single value
    if (r.valueQuantity) {
      summary.push(`${r.code?.text || 'Vital'}: ${r.valueQuantity.value} ${r.valueQuantity.unit || ''}`);
    }
    // Component (like BP: systolic/diastolic)
    else if (r.component?.length) {
      let comp = r.component.map(c =>
        `${c.code?.text || 'Component'}: ${c.valueQuantity?.value || 'N/A'} ${c.valueQuantity?.unit || ''}`
      ).join(", ");
      summary.push(`${r.code?.text || 'Composite Vital'}: ${comp}`);
    }
  }
  return "Recent Vitals:\n- " + summary.join('\n- ');
}

export function summarizeMeds(meds, count = 3) {
  if (!meds?.entry?.length) return "No current medications.";
  // Pull the most recent {count} medications
  let summary = meds.entry.slice(0, count).map(e => {
    const r = e.resource;
    const medName = r.medicationCodeableConcept?.text || r.medicationReference?.display || 'Unknown medication';
    const status = r.status || 'unknown status';
    // Show instructions if present
    let instructions = '';
    if (r.dosageInstruction && r.dosageInstruction.length) {
      instructions = r.dosageInstruction.map(di =>
        di.patientInstruction || di.text || '').filter(Boolean).join('; ');
      if (instructions) instructions = ` | Instructions: ${instructions}`;
    }
    return `${medName} (${status})${instructions}`;
  });
  return "Current Medications:\n- " + summary.join('\n- ');
}
