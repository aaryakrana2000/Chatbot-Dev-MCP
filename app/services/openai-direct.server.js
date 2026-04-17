import OpenAI from 'openai';
import AppConfig from "./config.server.js";
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
// console.log("__filename>>>>>>>>>>>>>",__filename);

const __dirname = dirname(__filename);
// console.log("__dirname>>>>>>>>>>>>>",__dirname);

let systemPrompts;
try {
  systemPrompts = JSON.parse(readFileSync(join(__dirname, '../../../../app/prompts/prompts.json'), 'utf8'));
} catch (error) {
  try {
    systemPrompts = JSON.parse(readFileSync(join(process.cwd(), 'app/prompts/prompts.json'), 'utf8'));
  } catch (error2) {
    console.error('Could not find prompts.json:', error2);
    throw new Error('prompts.json file not found');
  }
}


/**
 * Creates an OpenAI Direct service instance using responses.create API
 */
export function createOpenAIDirectService() {
  const client = new OpenAI({
    baseURL: process.env.OPENAI_BASE_URL,
    apiKey: process.env.OPENAI_API_KEY
  });

  // console.log("OPENAI_BASE_URL>>>>>>>>>>>>>>>>>", process.env.OPENAI_BASE_URL);
  // console.log("OPENAI_API_KEY>>>>>>>>>>>>>>>>>", process.env.OPENAI_API_KEY);


  /**
   * Streams a conversation using OpenAI's responses.create API with MCP integration
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.toolPromptType,
    shopContext = null,
    shopDomain,
    conversationId,
    cartId = null,
    uploadedImage = null,
    productImage = null
  }, streamHandlers) => {
    // Helper function to send progress updates
    const sendProgress = (progress) => {
      if (streamHandlers.onProgress) {
        streamHandlers.onProgress(progress);
      }
    };
    const systemInstruction = getSystemPrompt(promptType, shopContext, cartId, shopDomain);
    const inputMessages = formatMessagesForResponsesAPI(messages, systemInstruction, uploadedImage, productImage);

    // Check if we're generating an image (user uploaded image or product image present)
    const isImageGeneration = !!(uploadedImage || productImage);
    let progressInterval = null;
    
    // Only simulate progress updates if image generation is expected
    if (isImageGeneration) {
      const progressSteps = [10, 30, 50, 70, 90];
      let stepIndex = 0;
      
      progressInterval = setInterval(() => {
        if (stepIndex < progressSteps.length) {
          sendProgress(progressSteps[stepIndex]);
          stepIndex++;
        } else {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }, 800); // Update every 800ms
    }

    try {
      const response = await client.responses.create({
        model: "gpt-5.2-2025-12-11", 
        input: inputMessages,
        text: {
          format: {
            type: "text"
          },
          verbosity: "medium"
        },
        reasoning: {
          effort: "low",
          summary: "auto"
        },
        tools: [
          {
            type: "mcp",
            server_label: "shopify_store",
            server_url: `${shopDomain}/api/mcp`,
            allowed_tools: [
              "search_catalog",
              "get_cart",
              "update_cart",
              "search_shop_policies_and_faqs",
              "get_product_details"
            ],
            require_approval: "never"
          },
          {
            type: "image_generation"
          }
        ]
      });

      // Clear progress interval and send completion if it exists
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      if (isImageGeneration) {
        sendProgress(100); // Complete
      }

      // Temporarily enable full response logging to debug image extraction
      console.log('Full OpenAI Response with MCP data:', JSON.stringify(response, null, 2));

      // Extract the response content from the responses API
      let responseContent = '';
      let generatedImage = null;

 
      if (response.tool_results && response.tool_results.length > 0) {
        for (const toolResult of response.tool_results) {
          if (toolResult.type === 'image_generation_call' && toolResult.status === 'completed') {
            console.log('Found completed image_generation_call in tool_results');
            if (toolResult.output && toolResult.output.length > 0) {
              for (const imageOutput of toolResult.output) {
                if (imageOutput.type === 'output_image') {
                  if (imageOutput.image_url) {
                    generatedImage = imageOutput.image_url;
                  } else {
                  }
                }
              }
            } else {
              console.log('No output array in tool_result');
            }
          }
        }
      }

      if (response.output && response.output.length > 0) {
        for (const output of response.output) {
          // Check for image generation call
          if (output.type === 'image_generation_call' && output.status === 'completed') {
            // Check the 'result' field - this is where the image data is stored
            if (output.result) {
              // Result could be an array or object
              if (Array.isArray(output.result)) {
                for (const resultItem of output.result) {
                  if (resultItem.type === 'output_image' && resultItem.image_url) {
                    generatedImage = resultItem.image_url;
                    break;
                  }
                }
              } else if (typeof output.result === 'object' && output.result !== null) {
                // Check if result has image_url directly
                if (output.result.image_url) {
                  generatedImage = output.result.image_url;
                } else if (output.result.url) {
                  generatedImage = output.result.url;
                } else if (output.result.data) {
                  // Base64 data
                  generatedImage = `data:image/png;base64,${output.result.data}`;
                  console.log('Generated image found as base64 in result.data');
                }
              } else if (typeof output.result === 'string') {
                // Result might be a direct URL, base64 string, or JSON string
                const resultStr = output.result;

                // Check if it's a URL
                if (resultStr.startsWith('http://') || resultStr.startsWith('https://')) {
                  generatedImage = resultStr;
                }
                // Check if it's a data URL
                else if (resultStr.startsWith('data:image/')) {
                  generatedImage = resultStr;
                  console.log('Generated image found as data URL string in result');
                }
                // Check if it's base64 (without prefix)
                else if (resultStr.length > 100 && /^[A-Za-z0-9+/=]+$/.test(resultStr)) {
                  // Looks like base64, add the prefix
                  generatedImage = `data:image/png;base64,${resultStr}`;
                  console.log('Generated image found as base64 string in result (added prefix)');
                }
                // Check if it's JSON string that needs parsing
                else if (resultStr.startsWith('{') || resultStr.startsWith('[')) {
                  try {
                    const parsed = JSON.parse(resultStr);
                    if (parsed.image_url || parsed.url) {
                      generatedImage = parsed.image_url || parsed.url;
                    } else if (parsed.data) {
                      generatedImage = `data:image/png;base64,${parsed.data}`;
                    }
                  } catch (e) {
                    console.log('Failed to parse result as JSON:', e.message);
                  }
                }
              }
            }

            // Also check output array (legacy/alternative location)
            if (!generatedImage && output.output && output.output.length > 0) {
              console.log('Checking output.output array:', output.output.length, 'items');
              for (const imageOutput of output.output) {
                if (imageOutput.type === 'output_image') {
                  if (imageOutput.image_url) {
                    generatedImage = imageOutput.image_url;
                    break;
                  } else if (imageOutput.data) {
                    generatedImage = `data:image/png;base64,${imageOutput.data}`;
                    console.log('Generated image found as base64 in output.output');
                    break;
                  }
                }
              }
            }

            // Also check if image_url is directly on the output object
            if (!generatedImage && output.image_url) {
              generatedImage = output.image_url;
            }

            // Log if still not found
            if (!generatedImage) {
              console.log('Image not found in image_generation_call. Available keys:', Object.keys(output));
              if (output.result) {
                console.log('Result structure:', typeof output.result, Array.isArray(output.result) ? 'array' : 'object');
              }
            }
          }

          // Extract text content from messages
          if (output.type === 'message' && output.content && output.content.length > 0) {
            for (const content of output.content) {
              if (content.type === 'output_text' && content.text) {
                responseContent += content.text;
              }
            }
          }
        }
      } else {
        console.log('No output array in response');
      }

      // If still not found, do a deep search in the response
      if (!generatedImage) {
        console.log('Image not found in standard locations, doing deep search...');
        const deepSearch = (obj, depth = 0) => {
          if (depth > 5) return; // Prevent infinite recursion
          if (!obj || typeof obj !== 'object') return;

          for (const key in obj) {
            if (key === 'image_url' && typeof obj[key] === 'string' && obj[key].length > 0) {
              generatedImage = obj[key];
              return;
            }
            if (key === 'url' && typeof obj[key] === 'string' && obj[key].startsWith('http')) {
              generatedImage = obj[key];
              return;
            }
            if (Array.isArray(obj[key])) {
              for (const item of obj[key]) {
                deepSearch(item, depth + 1);
                if (generatedImage) return;
              }
            } else if (typeof obj[key] === 'object') {
              deepSearch(obj[key], depth + 1);
              if (generatedImage) return;
            }
          }
        };
        deepSearch(response);
      }

      console.log('Final generatedImage value:', generatedImage ? `FOUND: ${generatedImage.substring(0, 100)}...` : 'NOT FOUND');

      // If no text but we have an image, provide a default message
      if (!responseContent && generatedImage) {
        responseContent = "Here's your virtual try-on result!";
      }

      // Stream the response
      if (streamHandlers.onText) {
        streamHandlers.onText(responseContent);
      }

      const finalAssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: responseContent }]
      };

      if (streamHandlers.onMessage) {
        streamHandlers.onMessage(finalAssistantMessage);
      }

      return {
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: responseContent }],
        tool_calls: [],
        tool_results: response.tool_results || [],
        generated_image: generatedImage,
        full_response: response
      };

    } catch (error) {
      console.error('Error with OpenAI Responses API:', error);
      if (error.status === 401) {
        throw new Error(AppConfig.errorMessages.apiKeyError);
      } else if (error.status === 429) {
        throw new Error(AppConfig.errorMessages.rateLimitExceeded);
      } else {
        throw new Error(AppConfig.errorMessages.genericError);
      }
    }
  };

  /**
   * Formats messages for OpenAI responses.create API
   */
  const formatMessagesForResponsesAPI = (messages, systemInstruction, uploadedImage = null, productImage = null) => {
    const inputMessages = [];

    // Add system instruction as developer role
    if (systemInstruction) {
      inputMessages.push({
        role: "developer",
        content: systemInstruction
      });
    }

    // Convert conversation messages
    for (const msg of messages) {
      if (msg.role === 'system') continue; // Skip system messages as they're handled above

      let textContent = '';
      const contentArray = [];

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            textContent += block.text;
          } else if (block.type === 'image_url' || block.type === 'image') {
            // Handle image content
            const imageUrl = block.image_url || block.url || block.data;
            if (imageUrl) {
              contentArray.push({
                type: "input_image",
                image_url: imageUrl
              });
            }
          }
        }
      } else if (typeof msg.content === 'string') {
        textContent = msg.content;
      }

      // If this is the last user message and we have uploaded images, add them
      if (msg.role === 'user' && uploadedImage && messages[messages.length - 1] === msg) {
        // Add text content if present, otherwise use default try-on prompt
        const promptText = textContent || "Generate a realistic virtual try-on image. CRITICAL: (1) Preserve the person's exact face from the first image—same facial features, skin tone, and identity; do not alter or replace the face. (2) Use realistic lighting and background: soft natural light or professional studio lighting, clean coherent background (e.g. neutral wall or soft gradient) so the image looks like a real photo. (3) Composite the apparel from the product image onto the person so the product looks its best: natural fit and draping, accurate colors and design, as if they were really wearing it. Keep body proportions and pose consistent. Output one photorealistic image.";
        contentArray.unshift({
          type: "input_text",
          text: promptText
        });

        // Add uploaded user image
        if (uploadedImage.dataUrl) {
          contentArray.push({
            type: "input_image",
            image_url: uploadedImage.dataUrl
          });
        }

        // Add product image if available
        if (productImage) {
          contentArray.push({
            type: "input_image",
            image_url: productImage
          });
        }

        if (contentArray.length > 0) {
          inputMessages.push({
            role: "user",
            content: contentArray
          });
        }
      } else if (textContent || contentArray.length > 0) {
        // For messages with only text or existing image content
        if (contentArray.length > 0) {
          // If we have image content, use the content array format
          if (textContent) {
            contentArray.unshift({
              type: "input_text",
              text: textContent
            });
          }
          inputMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: contentArray
          });
        } else {
          // Plain text message
          inputMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: textContent
          });
        }
      }
    }

    return inputMessages;
  };

  /**
   * Gets the system prompt content with shop context
   */
  const getSystemPrompt = (promptType, shopContext = null, cartId = null, shopDomain = null) => {
    let basePrompt = systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.toolPromptType].content;

    // Inject shop context if available
    if (shopContext && shopContext.description) {
      const shopInfo = `\n\n## STORE CONTEXT\nThis store specializes in: ${shopContext.description}\nWhen customers ask general questions like "what do you sell" or "what type of products are you selling", inform them about the store's specialty and then use the search_catalog tool to show actual products.\n`;
      basePrompt = basePrompt.replace('## YOUR ROLE', shopInfo + '## YOUR ROLE');
    }

    // Product PDP links use stable handles — helps the chat widget parse /products/{handle} when falling back to text
    if (shopDomain && typeof shopDomain === 'string' && shopDomain.startsWith('http')) {
      const linkHint = `\n\n## PRODUCT LINKS (STABLE HANDLES)\nWhen you list products after search_catalog, include a storefront link per item using the product URL from tool results (path must be /products/{handle}). Example: [Same title as in tool](/products/example-product-handle) — $99. Relative paths /products/... are fine.\n\n## SEARCH_CATALOG ARGUMENT SAFETY\nWhen using search_catalog, do NOT add restrictive filters unless the user explicitly asked for them. In particular, never set price max/min to 0. If filters are not needed, omit filters entirely.\n`;
      basePrompt = basePrompt.replace('## YOUR ROLE', linkHint + '## YOUR ROLE');
    }

    // Enforce strict gender/category separation for product recommendations.
    const genderGuardrails = `\n\n## STRICT GENDER MATCHING\nIf the user asks for men's category/products, show ONLY men's products. Do NOT show women's products in that response.\nIf the user asks for women's category/products, show ONLY women's products. Do NOT show men's products in that response.\nIf no products are found for the requested gender/category, clearly say none were found and ask whether the user wants to switch category. Do not auto-switch unless the user explicitly asks to.\n`;
    basePrompt = basePrompt.replace('## YOUR ROLE', genderGuardrails + '## YOUR ROLE');

    // Inject cart ID if available
    if (cartId) {
      // Format cart ID as Shopify GID if it's not already
      const formattedCartId = cartId.startsWith('gid://shopify/Cart/') ? cartId : `gid://shopify/Cart/${cartId}`;
      const cartInfo = `\n\n## CART CONTEXT\nThe user's current cart ID is: ${formattedCartId}\nWhen using cart-related tools (get_cart, update_cart), always use this cart ID.\n`;
      basePrompt = basePrompt.replace('## YOUR ROLE', cartInfo + '## YOUR ROLE');
    }

    return basePrompt;
  };

  return {
    streamConversation,
    getSystemPrompt
  };
}