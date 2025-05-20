// summarizers.js

// Helper: get text for medication instructions (matches your display)
function summarizeInstructions(resource) {
  return (resource.dosageInstruction || [])
    .map(di => {
      if (di.patientInstruction) return di.patientInstruction;
      if (di.text && di.text.includes(',')) return di.text.split(',')[0].trim() + '.';
      return di.text || 'N/A';
    })
    .join('; ');
}

export function summarizePatient(patient) {
  if (!patient) return "No patient data.";
  const name = patient.name?.[0]?.text || `${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`;
  const phone = patient.telecom?.find(t => t.system === 'phone')?.value;
  const email = patient.telecom?.find(t => t.system === 'email')?.value;
  const addr = patient.address?.[0];
  const address = addr
    ? `${addr.line?.join(' ')} ${addr.city || ''}, ${addr.state || ''} ${addr.postalCode || ''}`
    : '';
  return [
    `Name: ${name || 'N/A'}`,
    `Gender: ${patient.gender || 'N/A'}`,
    `Birth Date: ${patient.birthDate || 'N/A'}`,
    `ID: ${patient.id || 'N/A'}`,
    `Phone: ${phone || 'N/A'}`,
    `Email: ${email || 'N/A'}`,
    `Address: ${address || 'N/A'}`
  ].join('\n');
}

export function summarizeVitals(vitals, count = 10) {
  if (!vitals?.entry?.length) return "No vital signs found or an error occurred.";
  let summary = vitals.entry.slice(0, count).map(entry => {
    const r = entry.resource;
    if (!r) return "Malformed entry: no resource found";
    let line = r.code?.text || r.code?.coding?.[0]?.display || "Unknown Vital";
    if (r.valueQuantity) {
      line += `: ${r.valueQuantity.value} ${r.valueQuantity.unit||''}`;
    } else if (r.component?.length) {
      line += ':' + r.component.map(c => {
        const lab = c.code?.text || c.code?.coding?.[0]?.display || "Component";
        const val = c.valueQuantity ? `${c.valueQuantity.value} ${c.valueQuantity.unit||''}` : 'N/A';
        return ` ${lab}: ${val}`;
      }).join(';');
    } else {
      line += ": N/A";
    }
    if (r.effectiveDateTime) {
      line += ` (Recorded: ${new Date(r.effectiveDateTime).toLocaleString()})`;
    }
    return line;
  });
  return summary.join('\n');
}

export function summarizeMeds(meds, count = 10) {
  if (!meds?.entry?.length) return "No current medications.";
  const entries = meds.entry.slice(0, count).sort((a, b) => {
    const da = a.resource.authoredOn ? new Date(a.resource.authoredOn) : 0;
    const db = b.resource.authoredOn ? new Date(b.resource.authoredOn) : 0;
    return db - da;
  });
  let summary = entries.map(({ resource }) => {
    const med = resource.medicationCodeableConcept?.text || resource.medicationReference?.display || 'Unknown';
    const status = resource.status || 'N/A';
    const date = resource.authoredOn?.split('T')[0] || 'N/A';
    const provider = resource.requester?.display || resource.requester?.reference || 'N/A';
    const instructions = summarizeInstructions(resource);
    return [
      `Medication: ${med}`,
      `Status: ${status}`,
      `Date Written: ${date}`,
      `Provider: ${provider}`,
      `Instructions: ${instructions}`
    ].join(' | ');
  });
  return summary.join('\n');
}
