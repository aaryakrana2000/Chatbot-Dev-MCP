import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

/**
 * Creates a Gemini service instance
 */
export function createGeminiService(apiKey = process.env.GEMINI_API_KEY) {
  if (!apiKey) {
    throw new Error(AppConfig.errorMessages.apiKeyError || "GEMINI_API_KEY is not set.");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: AppConfig.api.defaultModel,
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ]
  });

  /**
   * Streams a conversation with Gemini
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools
  }, streamHandlers) => {
    const systemInstruction = getSystemPrompt(promptType);

    const geminiMessages = formatMessagesForGemini(messages);

    if (systemInstruction && geminiMessages[0]?.parts[0]?.text !== systemInstruction) {
      geminiMessages.unshift({ role: 'user', parts: [{ text: systemInstruction }] });
      geminiMessages.push({ role: 'model', parts: [{ text: "Ok, I will follow these instructions." }] });
    }

    let finalMessageContent = [];
    let toolCalls = [];

    try {
      const result = await model.generateContentStream({
        contents: geminiMessages,
        tools: tools && tools.length > 0 ? {
          functionDeclarations: tools.map(tool => ({
            name: tool.name,
            description: tool.description || "",
            parameters: {
              type: "object",
              properties: tool.parameters.properties || {},
              required: tool.parameters.required || []
            }
          }))
        } : undefined
      });

      for await (const chunk of result.stream) {
        const candidate = chunk.candidates?.[0];
        if (!candidate) continue;

        for (const part of (candidate.content?.parts || [])) {
          try {
            if (part.text) {

              finalMessageContent.push({ type: 'text', text: part.text });
              streamHandlers.onText?.(part.text);
            } else if (part.functionCall) {
              const toolCall = {
                id: `tool_call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                type: 'tool_use',
                name: part.functionCall.name,
                input: part.functionCall.args,
              };
              toolCalls.push(toolCall);
              finalMessageContent.push(toolCall);
              await streamHandlers.onToolUse?.(toolCall);
            }
          } catch (error) {
            console.error("Error processing message part:", error);
          }
        }
      }

      const response = await result.response;
      const finalCandidate = response.candidates[0];
      let stopReason = finalCandidate.finishReason;

      stopReason = stopReason === 'TOOL_CALLS' || (stopReason === 'STOP' && toolCalls.length > 0) ? 'tool_use' : 'end_turn';

      const finalAssistantMessage = {
        role: 'assistant',
        content: finalMessageContent,
      };
      console.log("Final Assistant Message:", finalAssistantMessage);
      

      streamHandlers.onMessage?.(finalAssistantMessage);

      return {
        stop_reason: stopReason,
        content: finalMessageContent,
        tool_calls: toolCalls,
      };
    } catch (error) {
      console.error('Error streaming conversation with Gemini:', error);
      if (error.message.includes('API key not valid')) {
        throw new Error(AppConfig.errorMessages.apiKeyError);
      } else if (error.message.includes('quota')) {
        throw new Error(AppConfig.errorMessages.rateLimitExceeded);
      } else {
        throw new Error(AppConfig.errorMessages.genericError);
      }
    }
  };


  /**
   * Correctly formats a conversation history for the Gemini API.
   * @param {Array<Object>} messages - The raw message history from your DB.
   * @returns {Array<Object>} The formatted history for Gemini.
   */
  const formatMessagesForGemini = (messages) => {
    return messages.map(msg => {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      let parts = [];

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            parts.push({ text: block.text });
          } else if (block.type === 'tool_result' && msg.role === 'user') {
            parts.push({
              functionResponse: {
                name: block.name,
                response: block.content
              }
            });
          } else if (block.type === 'tool_use' && msg.role === 'assistant') {
            parts.push({
              functionCall: {
                name: block.name,
                args: block.input,
              }
            });
          }
        }
      } else if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      }

      return { role, parts };
    }).filter(msg => msg.parts.length > 0);
  };

  /**
   * Gets the system prompt content
   */
  const getSystemPrompt = (promptType) => {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}
