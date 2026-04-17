/**
 * Try-On Service using OpenAI DALL-E API
 * Generates images where a model wears apparel from product images
 * 
 * TEMPORARILY DISABLED - Service code kept for future use
 */

import OpenAI from 'openai';

/**
 * Creates an OpenAI Try-On service instance
 * @param {string} apiKey - OpenAI API key (defaults to env variable)
 * @param {string} baseURL - OpenAI base URL (optional, for custom endpoints)
 * @returns {Object} Try-On service methods
 */
export function createOpenAITryOnService(
  apiKey = process.env.OPENAI_API_KEY,
  baseURL = process.env.OPENAI_BASE_URL
) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in environment variables");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL || undefined
  });

  // Log configuration (without exposing full API key)
  const isCustomGateway = baseURL && !baseURL.includes('api.openai.com');
  console.log('OpenAI Try-On Service initialized:', {
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'missing',
    baseURL: baseURL || 'default (api.openai.com)',
    isCustomGateway: isCustomGateway,
    warning: isCustomGateway ? 'Custom gateway detected - DALL-E and Vision APIs may not be supported' : undefined
  });

  /**
   * Convert base64 data URL to buffer
   * @param {string} dataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
   * @returns {Object} Object with data buffer and mime type
   */
  function parseDataUrl(dataUrl) {
    const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid data URL format');
    }
    
    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');
    
    return {
      data: buffer,
      mimeType: mimeType
    };
  }

  /**
   * Generate try-on image using OpenAI DALL-E 3 API
   * Uses GPT-4o Vision to analyze images first, then DALL-E 3 for generation
   * @param {string} userImageDataUrl - Base64 data URL of user/model image
   * @param {string} productImageDataUrl - Base64 data URL of product/apparel image
   * @param {Object} options - Additional options
   * @param {string} options.prompt - Custom prompt (optional)
   * @param {string} options.model - Model to use (default: "dall-e-3")
   * @param {string} options.size - Image size (default: "1024x1024")
   * @param {string} options.quality - Image quality (default: "standard")
   * @returns {Promise<Object>} Generated image data
   */
  async function generateTryOnImage(userImageDataUrl, productImageDataUrl, options = {}) {
    try {
      // Validate image data URLs
      if (!userImageDataUrl || !userImageDataUrl.startsWith('data:image/')) {
        throw new Error('Invalid user image data URL format');
      }
      if (!productImageDataUrl || !productImageDataUrl.startsWith('data:image/')) {
        throw new Error('Invalid product image data URL format');
      }

      // Check image sizes (OpenAI has limits)
      const userImageSize = userImageDataUrl.length;
      const productImageSize = productImageDataUrl.length;
      const maxSize = 20 * 1024 * 1024; // 20MB base64 limit (roughly)
      
      if (userImageSize > maxSize || productImageSize > maxSize) {
        throw new Error(`Image too large. User image: ${(userImageSize / 1024 / 1024).toFixed(2)}MB, Product image: ${(productImageSize / 1024 / 1024).toFixed(2)}MB`);
      }

      // Default prompt: preserve exact face, realistic lighting/background, product looks best
      const basePrompt = options.prompt || 
        "Generate a realistic virtual try-on image. CRITICAL: (1) Preserve the person's exact face from the first image—same facial features, skin tone, and identity; do not alter or replace the face. (2) Use realistic lighting and background: soft natural or studio lighting, clean coherent background so the image looks like a real photo. (3) Composite the apparel onto the person so the product looks its best: natural fit, accurate colors and design. Output one photorealistic image.";

      const model = options.model || "dall-e-3";
      const size = options.size || "1024x1024";
      const quality = options.quality || "standard";

      console.log('Analyzing images with GPT-4o Vision for try-on generation...');
      console.log(`User image size: ${(userImageSize / 1024).toFixed(2)}KB, Product image size: ${(productImageSize / 1024).toFixed(2)}KB`);

      // Step 1: Try to use GPT-4o Vision to analyze both images and create a detailed description
      // If Vision API fails, fall back to using the base prompt directly
      let dallEPrompt = basePrompt;
      
      try {
        console.log('Attempting to use GPT-4o Vision for image analysis...');
        const visionResponse = await client.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze these two images carefully:
1. First image: A person (the user/model)
2. Second image: A clothing item/apparel

Create a detailed, specific prompt for DALL-E 3 to generate a realistic virtual try-on image. The prompt MUST emphasize:
- Preserving the person's EXACT face: same facial features, skin tone, and identity; the face must not be altered or replaced.
- Realistic lighting and background: soft natural light or professional studio lighting, clean coherent background (e.g. neutral wall or soft gradient) so the result looks like a real photo.
- The product looking its best on the person: natural fit, correct draping, accurate colors and design from the apparel image, as if they were really wearing it.

Include: brief description of the person's face/features to preserve, pose and body type; clothing details (color, style, fabric, fit); lighting and background for a photorealistic result. Return ONLY the DALL-E prompt, nothing else.`
                },
                {
                  type: "image_url",
                  image_url: {
                    url: userImageDataUrl
                  }
                },
                {
                  type: "image_url",
                  image_url: {
                    url: productImageDataUrl
                  }
                }
              ]
            }
          ],
          max_tokens: 500
        });

        dallEPrompt = visionResponse.choices[0]?.message?.content || basePrompt;
        console.log('Generated DALL-E prompt from Vision API:', dallEPrompt.substring(0, 200) + '...');
      } catch (visionError) {
        console.warn('Vision API failed, using base prompt directly:', visionError.message);
        console.warn('This might be due to custom base URL or API limitations. Proceeding with base prompt.');
        dallEPrompt = basePrompt;
      }

      // Step 2: Generate image with DALL-E 3 using the vision-generated prompt
      console.log('Generating try-on image with DALL-E 3...');
      console.log('Using prompt (first 200 chars):', dallEPrompt.substring(0, 200));
      
      // DALL-E 3 only supports 'url' format, not 'b64_json'
      // Also, DALL-E 3 has a 1000 character prompt limit
      const truncatedPrompt = dallEPrompt.substring(0, 1000);
      
      try {
        const response = await client.images.generate({
          model: model,
          prompt: truncatedPrompt,
          size: size,
          quality: quality,
          n: 1,
          response_format: "url" // DALL-E 3 only supports URL format
        });

        if (!response.data || response.data.length === 0) {
          throw new Error('No image generated in response');
        }

        const imageData = response.data[0];
        
        if (!imageData.url) {
          throw new Error('No image URL in response');
        }

        // Download the image from URL and convert to base64
        console.log('Downloading generated image from URL...');
        const imageResponse = await fetch(imageData.url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`);
        }
        
        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');

        return {
          success: true,
          imageData: base64Image,
          mimeType: 'image/png', // DALL-E returns PNG
          imageDataUrl: `data:image/png;base64,${base64Image}`
        };
      } catch (dalleError) {
        console.error('DALL-E API error:', dalleError);
        // Log more details
        if (dalleError.status) {
          console.error('DALL-E Error Details:', {
            status: dalleError.status,
            message: dalleError.message,
            code: dalleError.code,
            type: dalleError.type
          });
        }
        
        // Check if it's a 404 - likely means the custom gateway doesn't support DALL-E
        if (dalleError.status === 404 || (dalleError.message && dalleError.message.includes('404'))) {
          const errorMessage = isCustomGateway 
            ? 'The custom OpenAI gateway (grigo-dev-llm.grazitti.com) does not support DALL-E image generation API. The try-on feature requires the official OpenAI API endpoint (api.openai.com) or you can switch to Gemini provider in the settings.'
            : 'DALL-E API endpoint not found. Please check your API configuration.';
          console.error('DALL-E not supported by gateway:', errorMessage);
          throw new Error(errorMessage);
        }
        
        throw dalleError;
      }
    } catch (error) {
      console.error('Error generating try-on image with OpenAI:', error);
      // Log more details about the error
      if (error.status) {
        console.error('OpenAI API Error Details:', {
          status: error.status,
          statusText: error.message,
          code: error.code,
          type: error.type
        });
      }
      if (error.message) {
        console.error('Error message:', error.message);
      }
      throw error;
    }
  }

  /**
   * Generate try-on image using OpenAI Vision API for image understanding + DALL-E for generation
   * This method first analyzes both images, then generates a combined result
   * @param {string} userImageDataUrl - Base64 data URL of user/model image
   * @param {string} productImageDataUrl - Base64 data URL of product/apparel image
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated image data
   */
  async function generateTryOnImageWithVision(userImageDataUrl, productImageDataUrl, options = {}) {
    try {
      // Parse image data
      const userImage = parseDataUrl(userImageDataUrl);
      const productImage = parseDataUrl(productImageDataUrl);

      const prompt = options.prompt || 
        "Generate a realistic virtual try-on image. CRITICAL: (1) Preserve the person's exact face—same facial features, skin tone, and identity. (2) Use realistic lighting and background (soft natural or studio, clean background). (3) Composite the apparel so the product looks its best: natural fit, accurate colors and design. Output one photorealistic image.";

      console.log('Using OpenAI Vision + DALL-E for try-on generation...');

      // Step 1: Use Vision API to understand both images
      const visionResponse = await client.chat.completions.create({
        model: "gpt-4o", // or "gpt-4-vision-preview"
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze these two images. The first is the person, the second is the apparel. Describe how to create a photorealistic try-on image. Emphasize: preserving the person's exact face (features, skin tone, identity); realistic lighting and background (soft or studio, clean background); and the product looking its best on the person (natural fit, accurate colors and design).`
              },
              {
                type: "image_url",
                image_url: {
                  url: userImageDataUrl
                }
              },
              {
                type: "image_url",
                image_url: {
                  url: productImageDataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500
      });

      const visionDescription = visionResponse.choices[0]?.message?.content || prompt;

      // Step 2: Use the vision description to generate image with DALL-E
      const enhancedPrompt = `${prompt} ${visionDescription}`.substring(0, 1000); // DALL-E 3 has 1000 char limit

      const imageResponse = await client.images.generate({
        model: "dall-e-3",
        prompt: enhancedPrompt,
        size: "1024x1024",
        quality: "standard",
        n: 1,
        response_format: "url" // DALL-E 3 only supports URL format
      });

      if (!imageResponse.data || imageResponse.data.length === 0) {
        throw new Error('No image generated in response');
      }

      const imageData = imageResponse.data[0];
      
      if (!imageData.url) {
        throw new Error('No image URL in response');
      }

      // Download the image from URL and convert to base64
      console.log('Downloading generated image from URL...');
      const downloadResponse = await fetch(imageData.url);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download image: ${downloadResponse.statusText}`);
      }
      
      const imageBuffer = await downloadResponse.arrayBuffer();
      const base64Image = Buffer.from(imageBuffer).toString('base64');

      return {
        success: true,
        imageData: base64Image,
        mimeType: 'image/png',
        imageDataUrl: `data:image/png;base64,${base64Image}`
      };
    } catch (error) {
      console.error('Error generating try-on image with OpenAI Vision:', error);
      // Log more details about the error
      if (error.response) {
        console.error('OpenAI API Error Details:', {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
      }
      if (error.message) {
        console.error('Error message:', error.message);
      }
      throw error;
    }
  }

  /**
   * Generate try-on image using OpenAI Image Edit API (if available)
   * This method uses image editing capabilities
   * @param {string} userImageDataUrl - Base64 data URL of user/model image
   * @param {string} productImageDataUrl - Base64 data URL of product/apparel image
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated image data
   */
  async function generateTryOnImageWithEdit(userImageDataUrl, productImageDataUrl, options = {}) {
    try {
      // Parse image data
      const userImage = parseDataUrl(userImageDataUrl);
      const productImage = parseDataUrl(productImageDataUrl);

      const prompt = options.prompt || 
        "Add the clothing/apparel from the second image to the person in the first image. Make it look natural and realistic.";

      console.log('Using OpenAI Image Edit API for try-on generation...');

      // Note: OpenAI Image Edit API requires a mask image
      // For try-on, we might need to create a mask or use a different approach
      // This is a placeholder implementation - actual implementation may vary

      // For now, fallback to regular generation
      return await generateTryOnImage(userImageDataUrl, productImageDataUrl, options);
    } catch (error) {
      console.error('Error generating try-on image with OpenAI Edit:', error);
      throw error;
    }
  }

  return {
    generateTryOnImage,
    generateTryOnImageWithVision,
    generateTryOnImageWithEdit
  };
}

