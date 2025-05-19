// src/summarizers.js
export function summarizePatient(patient) {
  if (!patient) return "No patient data.";
  return `Patient: ${patient.name?.[0]?.text || ''} (${patient.gender}, DOB: ${patient.birthDate})`;
}

export function summarizeVitals(vitals, count = 3) {
  if (!vitals?.entry?.length) return "No recent vitals.";
  return "Recent vitals:\n" + vitals.entry.slice(0, count).map(e => {
    const r = e.resource;
    let line = r.code?.text || "Vital";
    if (r.valueQuantity) line += `: ${r.valueQuantity.value} ${r.valueQuantity.unit||''}`;
    return line;
  }).join('\n');
}

export function summarizeMeds(meds, count = 3) {
  if (!meds?.entry?.length) return "No current medications.";
  return "Current medications:\n" + meds.entry.slice(0, count).map(e => {
    const r = e.resource;
    return r.medicationCodeableConcept?.text || "Unknown";
  }).join('\n');
}
