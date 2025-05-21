// src/summarizers.js
import { 
  extractPatientInfo, 
  processVitalSigns, 
  processMedications,
  processEncounters,
  processConditions
} from './fhirUtils.js';

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

export function summarizeEncounters(encounters, count = 5) {
  if (!encounters?.entry?.length) return "No encounter data available.";
  
  const processedEncounters = processEncounters(encounters, count);
  
  const summary = processedEncounters.map(encounter => {
    return [
      `Encounter: ${encounter.type || 'Unknown'} (${encounter.class})`,
      `Date: ${encounter.period.formatted}`,
      `Status: ${encounter.status}`,
      `Provider: ${encounter.provider}`,
      `Location: ${encounter.location}`
    ].join(' | ');
  });
  
  return summary.join('\n');
}

export function summarizeConditions(conditions, count = 5) {
  if (!conditions?.entry?.length) return "No problem list items available.";
  
  const processedConditions = processConditions(conditions, count);
  
  // Create a summary that follows Epic's terminology of "Problem List"
  const summary = ["Problem List:"];
  
  processedConditions.forEach(condition => {
    // Format each problem with its key details
    const details = [
      `- ${condition.code} (${condition.clinicalStatus})`
    ];
    
    // Add onset date if available
    if (condition.onsetDate && condition.onsetDate !== 'Unknown') {
      details.push(`  Onset: ${condition.onsetDate}`);
    }
    
    // Add recorded date if available
    if (condition.recordedDate && condition.recordedDate !== 'Unknown') {
      details.push(`  Recorded: ${condition.recordedDate}`);
    }
    
    // Add category information
    if (condition.category && condition.category !== 'Not categorized') {
      details.push(`  Type: ${condition.category}`);
    }
    
    summary.push(details.join('\n'));
  });
  
  return summary.join('\n');
}