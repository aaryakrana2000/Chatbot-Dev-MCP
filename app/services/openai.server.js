import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

/**
 * Creates an OpenAI service instance
 */
export function createOpenAIService() {
  const apiUrl = process.env.EXTERNAL_LLM_API_URL;
  const apiKey = process.env.EXTERNAL_LLM_API_KEY;
  
  console.log("apiUrl>>>>>>>>>>>>>>>>>", apiUrl);
  console.log("apiKey>>>>>>>>>>>>>>>>>", apiKey);


  /**
   * Streams a conversation with external LLM API
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.toolPromptType,
    tools,
    shopContext = null
  }, streamHandlers) => {
    const systemInstruction = getSystemPrompt(promptType);
    const openaiMessages = formatMessagesForOpenAI(messages, systemInstruction);

    let finalMessageContent = [];
    let toolCalls = [];

    try {
      const requestBody = {
        model: 'gpt-5-nano-2025-08-07',
        messages: openaiMessages
      };

      // Only add tools if they exist and are not empty
      if (tools && tools.length > 0) {
        requestBody.tools = formatToolsForOpenAI(tools);
      }

      // console.log('Request to external API:', JSON.stringify(requestBody, null, 2));

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error Response:', errorText);
        throw new Error(`API request failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Raw API Response:', JSON.stringify(data, null, 2));
      const choice = data.choices[0];
      
      if (choice.message.content) {
        const content = choice.message.content;
        
        // Check if content contains tool calls as text (fallback parsing)
        if (content.includes('tool_call') && content.includes('update_cart' || 'get_cart')) {
          console.log('Detected tool calls in text content, parsing manually');
          try {
            const parsedContent = JSON.parse(content);
            if (Array.isArray(parsedContent) && parsedContent[0]?.type === 'tool_call') {
              // Convert text-based tool calls to proper format
              for (const toolCall of parsedContent) {
                if (toolCall.type === 'tool_call') {
                  const tool = {
                    id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                    type: 'tool_use',
                    name: toolCall.name,
                    input: toolCall.arguments || {},
                  };
                  toolCalls.push(tool);
                  finalMessageContent.push(tool);
                  await streamHandlers.onToolUse?.(tool);
                }
              }
            }
          } catch (parseError) {
            console.log('Failed to parse tool calls from content, treating as text');
            finalMessageContent.push({ type: 'text', text: content });
            streamHandlers.onText?.(content);
          }
        } else {
          finalMessageContent.push({ type: 'text', text: content });
          streamHandlers.onText?.(content);
        }
      }

      if (choice.message.tool_calls) {
        for (const toolCall of choice.message.tool_calls) {
          const tool = {
            id: toolCall.id,
            type: 'tool_use',
            name: toolCall.function.name,
            input: JSON.parse(toolCall.function.arguments || '{}'),
          };
          toolCalls.push(tool);
          finalMessageContent.push(tool);
          await streamHandlers.onToolUse?.(tool);
        }
      }

      const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';

      const finalAssistantMessage = {
        role: 'assistant',
        content: finalMessageContent,
      };

      streamHandlers.onMessage?.(finalAssistantMessage);

      return {
        stop_reason: stopReason,
        content: finalMessageContent,
        tool_calls: toolCalls,
      };
    } catch (error) {
      console.error('Error with external LLM API:', error);
      if (error.message.includes('API') || error.status === 401) {
        throw new Error(AppConfig.errorMessages.apiKeyError);
      } else if (error.status === 429) {
        throw new Error(AppConfig.errorMessages.rateLimitExceeded);
      } else {
        throw new Error(AppConfig.errorMessages.genericError);
      }
    }
  };

  /**
   * Formats messages for OpenAI API
   */
  const formatMessagesForOpenAI = (messages, systemInstruction) => {
    const formattedMessages = [];
    
    if (systemInstruction) {
      formattedMessages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        let textContent = '';
        const toolResults = [];
        
        for (const block of msg.content) {
          if (block.type === 'text') {
            textContent += block.text;
          } else if (block.type === 'tool_result' && msg.role === 'user') {
            toolResults.push({
              tool_call_id: block.tool_use_id,
              role: 'tool',
              content: JSON.stringify(block.content)
            });
          } else if (block.type === 'tool_use' && msg.role === 'assistant') {
            formattedMessages.push({
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: block.id,
                type: 'function',
                function: {
                  name: block.name,
                  arguments: JSON.stringify(block.input)
                }
              }]
            });
          }
        }
        
        if (textContent) {
          formattedMessages.push({ role: msg.role, content: textContent });
        }
        
        formattedMessages.push(...toolResults);
      } else if (typeof msg.content === 'string') {
        formattedMessages.push({ role: msg.role, content: msg.content });
      }
    }

    return formattedMessages;
  };

  /**
   * Formats tools for OpenAI API
   */
  const formatToolsForOpenAI = (tools) => {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.parameters || {}
      }
    }));
  };

  /**
   * Gets the system prompt content with shop context
   */
  const getSystemPrompt = (promptType, shopContext = null) => {
    let basePrompt = systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.toolPromptType].content;
    
    // Inject shop context if available
    if (shopContext && shopContext.description) {
      const shopInfo = `\n\n## STORE CONTEXT\nThis store specializes in: ${shopContext.description}\nWhen customers ask general questions like "what do you sell" or "what type of products are you selling", inform them about the store's specialty and then use the search_catalog tool to show actual products.\n`;
      basePrompt = basePrompt.replace('## YOUR ROLE', shopInfo + '## YOUR ROLE');
    }
    
    return basePrompt;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}