// src/openaiChatEnhanced.js
// Enhanced OpenAI chat with FHIR function calling capabilities

import { FHIRTools } from './fhirTools.js';

export class EnhancedFHIRChat {
  constructor(openAiKey, client, backendUrl) {
    this.openAiKey = openAiKey;
    this.fhirTools = new FHIRTools(client, backendUrl);
    this.conversationHistory = [];
  }

  async getChatResponse(userMessage, includeBasicContext = true) {
    // Add user message to conversation history
    this.conversationHistory.push({
      role: "user",
      content: userMessage
    });

    // Prepare system message with basic patient context if requested
    let systemMessage = `You are a helpful clinical assistant with access to real-time patient data through FHIR. 
You can search and retrieve specific patient information as needed to answer questions accurately.

IMPORTANT GUIDELINES:
- Always use the available tools to get current, specific data rather than relying on general medical knowledge alone
- When asked about lab values, medications, conditions, or other patient-specific data, use the appropriate search functions
- Provide precise, evidence-based responses using the patient's actual data
- If you need more specific information, use multiple tool calls to gather comprehensive data
- Format your responses clearly with headings, bullet points, and relevant details
- Always cite when information comes from the patient's chart vs. general medical knowledge`;

    if (includeBasicContext) {
      try {
        const patientSummary = await this.fhirTools.getPatientSummary();
        systemMessage += `\n\nCurrent patient context: ${JSON.stringify(patientSummary, null, 2)}`;
      } catch (error) {
        console.warn("Could not fetch basic patient context:", error);
      }
    }

    // Prepare messages for OpenAI - only include system message on first call
    let messages;
    if (this.conversationHistory.length <= 1) {
      // First message in conversation
      messages = [
        { role: "system", content: systemMessage },
        ...this.conversationHistory
      ];
    } else {
      // Subsequent messages - use conversation history without repeating system message
      messages = [...this.conversationHistory];
    }

    try {
      // Initial call to OpenAI with function definitions
      let response = await this.callOpenAI(messages, this.fhirTools.getToolDefinitions());
      
      // Handle function calls iteratively
      while (response.choices[0].message.tool_calls) {
        // Add assistant's message with tool calls to both conversation and current messages
        const assistantMessage = response.choices[0].message;
        this.conversationHistory.push(assistantMessage);
        messages.push(assistantMessage);

        // Execute each tool call and add responses
        for (const toolCall of response.choices[0].message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
          
          console.log(`Executing FHIR tool: ${toolName} with args:`, toolArgs);
          
          const toolResult = await this.fhirTools.executeTool(toolName, toolArgs);
          
          // Add tool result to both conversation and current messages
          const toolMessage = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(toolResult)
          };
          
          this.conversationHistory.push(toolMessage);
          messages.push(toolMessage);
        }

        // Call OpenAI again with tool results
        response = await this.callOpenAI(messages);
      }

      // Add final assistant response to conversation history
      const finalMessage = response.choices[0].message;
      this.conversationHistory.push(finalMessage);

      return {
        role: 'assistant',
        content: finalMessage.content,
        toolCalls: this.getToolCallSummary()
      };

    } catch (error) {
      console.error('Error in enhanced chat:', error);
      console.error('Conversation history at error:', this.conversationHistory);
      console.error('Messages at error:', messages);
      throw new Error(`Chat error: ${error.message}`);
    }
  }

  async callOpenAI(messages, tools = null) {
    const requestBody = {
      model: "gpt-4-1106-preview", // Use GPT-4 Turbo for better function calling
      messages: messages,
      temperature: 0.1, // Lower temperature for more consistent medical responses
      max_tokens: 1500
    };

    if (tools) {
      requestBody.tools = tools;
      requestBody.tool_choice = "auto";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    return response.json();
  }

  getToolCallSummary() {
    // Return a summary of what tools were used in the last conversation
    const lastMessages = this.conversationHistory.slice(-5);
    const toolCalls = [];
    
    for (const message of lastMessages) {
      if (message.tool_calls) {
        for (const call of message.tool_calls) {
          toolCalls.push({
            function: call.function.name,
            parameters: JSON.parse(call.function.arguments)
          });
        }
      }
    }
    
    return toolCalls;
  }

  clearConversation() {
    this.conversationHistory = [];
    console.log('Conversation history cleared');
  }

  getConversationHistory() {
    return [...this.conversationHistory]; // Return a copy to avoid mutations
  }

  // Helper method to validate conversation history
  validateConversationHistory() {
    for (let i = 0; i < this.conversationHistory.length; i++) {
      const message = this.conversationHistory[i];
      
      // Check if assistant message with tool_calls is followed by tool messages
      if (message.role === 'assistant' && message.tool_calls) {
        const toolCallIds = message.tool_calls.map(tc => tc.id);
        
        // Find the next messages that should be tool responses
        for (let j = i + 1; j < this.conversationHistory.length; j++) {
          const nextMessage = this.conversationHistory[j];
          
          if (nextMessage.role === 'tool') {
            const toolCallIndex = toolCallIds.indexOf(nextMessage.tool_call_id);
            if (toolCallIndex !== -1) {
              toolCallIds.splice(toolCallIndex, 1); // Remove found tool call ID
            }
          } else if (nextMessage.role === 'assistant') {
            // We've reached the next assistant message
            break;
          }
        }
        
        // If there are unmatched tool calls, there's an issue
        if (toolCallIds.length > 0) {
          console.warn('Unmatched tool call IDs:', toolCallIds);
          console.warn('Conversation history:', this.conversationHistory);
          return false;
        }
      }
    }
    return true;
  }

  // Static method for backwards compatibility with existing code
  static async getChatResponse({
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
    // Fallback to original static approach for basic queries
    const fhirContext = [
      config.includePatient !== false ? this.summarizePatient(patient, smartContext) : null,
      config.includeVitals !== false ? this.summarizeVitals(vitals, config.vitalsCount || 3) : null,
      config.includeMeds !== false ? this.summarizeMeds(meds, config.medsCount || 3) : null,
      config.includeEncounters !== false ? this.summarizeEncounters(encounters, config.encounterCount || 3) : null,
      config.includeConditions !== false ? this.summarizeConditions(conditions, config.conditionCount || 3) : null
    ].filter(Boolean).join('\n\n');

    const messages = [
      {
        role: "system",
        content: "You are a helpful clinical assistant. Format all your responses using Markdown. Here is the current patient context from the EHR:\n" + fhirContext
      },
      ...chatHistory.map(m => ({ role: m.role, content: m.content }))
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: messages.slice(-10),
      }),
    });

    const data = await response.json();
    const aiMsg = data.choices?.[0]?.message?.content || "No response";
    return { role: 'assistant', content: aiMsg };
  }

  // Helper methods for backwards compatibility
  static summarizePatient(patient, context) {
    if (!patient) return "No patient data.";
    const name = patient.name?.[0]?.text || `${patient.name?.[0]?.given?.join(' ')} ${patient.name?.[0]?.family}`;
    return `Patient: ${name}, DOB: ${patient.birthDate}, Gender: ${patient.gender}`;
  }

  static summarizeVitals(vitals, count) {
    if (!vitals?.entry?.length) return "No vital signs available.";
    return `Recent vital signs: ${vitals.entry.slice(0, count).map(e => 
      `${e.resource.code?.text}: ${e.resource.valueQuantity?.value} ${e.resource.valueQuantity?.unit}`
    ).join(', ')}`;
  }

  static summarizeMeds(meds, count) {
    if (!meds?.entry?.length) return "No medications available.";
    return `Current medications: ${meds.entry.slice(0, count).map(e => 
      e.resource.medicationCodeableConcept?.text || 'Unknown medication'
    ).join(', ')}`;
  }

  static summarizeEncounters(encounters, count) {
    if (!encounters?.entry?.length) return "No encounters available.";
    return `Recent encounters: ${encounters.entry.slice(0, count).map(e => 
      `${e.resource.type?.[0]?.text} on ${e.resource.period?.start?.split('T')[0]}`
    ).join(', ')}`;
  }

  static summarizeConditions(conditions, count) {
    if (!conditions?.entry?.length) return "No conditions available.";
    return `Active conditions: ${conditions.entry.slice(0, count).map(e => 
      e.resource.code?.text || 'Unknown condition'
    ).join(', ')}`;
  }
}