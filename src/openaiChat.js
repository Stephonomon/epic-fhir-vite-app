// src/openaiChat.js
import { 
  summarizePatient, 
  summarizeVitals, 
  summarizeMeds, 
  summarizeEncounters, 
  summarizeConditions 
} from './summarizers.js';

export async function getChatResponse({
  chatHistory,
  patient,
  vitals,
  meds,
  encounters,
  conditions,
  config,
  openAiKey,
  smartContext
}) {
  const fhirContext = [
    config.includePatient !== false ? summarizePatient(patient, smartContext) : null,
    config.includeVitals !== false ? summarizeVitals(vitals, config.vitalsCount || 3) : null,
    config.includeMeds !== false ? summarizeMeds(meds, config.medsCount || 3) : null,
    config.includeEncounters !== false ? summarizeEncounters(encounters, config.encounterCount || 3) : null,
    config.includeConditions !== false ? summarizeConditions(conditions, config.conditionCount || 3) : null
  ].filter(Boolean).join('\n\n');

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful clinical assistant. Format all your responses using Markdown. Use bold for headings, bullet points for lists, and keep information clear and readable. Here is the current patient context from the EHR:\n" + fhirContext
    },
    ...chatHistory.map(m => ({ role: m.role, content: m.content }))
  ];

  // Add additional context information if available
  if (smartContext?.state?.tokenResponse) {
    // Get CSN (Encounter ID) and PAT_ID from context
    const tokenResp = smartContext?.state?.tokenResponse || smartContext?.tokenResponse;
    const csn = tokenResp?.csn;
    const patId = tokenResp?.pat_id;
    
    if (csn || patId) {
      // Add a note about additional Epic context to the system message
      messages[0].content += "\n\nAdditional Epic context information:";
      if (patId) messages[0].content += `\n- Epic Patient ID (PAT_ID): ${patId}`;
      if (csn) messages[0].content += `\n- Epic Encounter ID (CSN): ${csn}`;
    }
  }

  const url = "https://api.openai.com/v1/chat/completions";
  const headers = {
    "Authorization": `Bearer ${openAiKey}`,
    "Content-Type": "application/json"
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: messages.slice(-10), // system + last 9
    }),
  });
  const data = await response.json();
  const aiMsg = data.choices?.[0]?.message?.content || "No response";
  return { role: 'assistant', content: aiMsg };
}