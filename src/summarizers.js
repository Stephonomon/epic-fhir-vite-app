// src/summarizers.js
import { extractPatientInfo, processVitalSigns, processMedications } from './fhirUtils.js';

export function summarizePatient(patient, context = null) {
  if (!patient) return "No patient data.";
  
  const patientInfo = extractPatientInfo(patient, context);
  
  return [
    `Name: ${patientInfo.name}`,
    `Gender: ${patientInfo.gender}`,
    `Birth Date: ${patientInfo.birthDate}`,
    `Patient ID: ${patientInfo.patId}`, // Use patId instead of FHIR ID
    `CSN: ${patientInfo.csn}`, // Add CSN from context
    `Phone: ${patientInfo.phone}`,
    `Email: ${patientInfo.email}`,
    `Address: ${patientInfo.address}`
  ].join('\n');
}

export function summarizeVitals(vitals, count = 10) {
  if (!vitals?.entry?.length) return "No vital signs found or an error occurred.";
  
  const processedVitals = processVitalSigns(vitals, count);
  
  const summary = processedVitals.map(vital => {
    if (vital.error) return vital.error;
    
    let line = vital.name;
    line += `: ${vital.value}`;
    if (vital.fullDateTime) {
      line += ` (Recorded: ${vital.fullDateTime})`;
    }
    return line;
  });
  
  return summary.join('\n');
}

export function summarizeMeds(meds, count = 10) {
  if (!meds?.entry?.length) return "No current medications.";
  
  const processedMeds = processMedications(meds, count);
  
  const summary = processedMeds.map(med => {
    return [
      `Medication: ${med.name}`,
      `Status: ${med.status}`,
      `Date Written: ${med.date}`,
      `Provider: ${med.provider}`,
      `Instructions: ${med.instructions}`
    ].join(' | ');
  });
  
  return summary.join('\n');
}