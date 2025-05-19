import { summarizePatient, summarizeVitals, summarizeMeds } from './summarizers.js';

// Returns { role, content } AI response
export async function getChatResponse({
  chatHistory,
  patient,
  vitals,
  meds,
  config,
  openAiKey
}) {
  const fhirContext = [
    config.includePatient !== false ? summarizePatient(patient) : null,
    config.includeVitals !== false ? summarizeVitals(vitals, config.vitalsCount || 3) : null,
    config.includeMeds !== false ? summarizeMeds(meds, config.medsCount || 3) : null,
  ].filter(Boolean).join('\n\n');

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful clinical assistant. Here is the current patient context from the EHR:\n" + fhirContext
    },
    ...chatHistory.map(m => ({ role: m.role, content: m.content }))
  ];

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
