/**
 * Try-On Service using Google GenAI Imagen API
 * Generates images where a model wears apparel from product images
 * 
 * TEMPORARILY DISABLED - Service code kept for future use
 */

/**
 * Creates a Try-On service instance
 * @param {string} apiKey - Google GenAI API key (defaults to env variable)
 * @returns {Object} Try-On service methods
 */
export function createTryOnService(apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY) {
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENAI_API_KEY is not set in environment variables");
  }
  console.log('API key:', apiKey);

  const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

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
   * Generate try-on image using Google GenAI Imagen API
   * @param {string} userImageDataUrl - Base64 data URL of user/model image
   * @param {string} productImageDataUrl - Base64 data URL of product/apparel image
   * @param {Object} options - Additional options
   * @param {string} options.prompt - Custom prompt (optional)
   * @returns {Promise<Object>} Generated image data
   */
  async function generateTryOnImage(userImageDataUrl, productImageDataUrl, options = {}) {
    try {
      // Parse image data
      const userImage = parseDataUrl(userImageDataUrl);
      const productImage = parseDataUrl(productImageDataUrl);

      // Default prompt: preserve exact face, realistic lighting/background, product looks best
      const prompt = options.prompt || 
        "Generate a realistic virtual try-on image. CRITICAL: (1) Preserve the person's exact face from the first image—same facial features, skin tone, and identity; do not alter or replace the face. (2) Use realistic lighting and background: soft natural or studio lighting, clean coherent background so the image looks like a real photo. (3) Composite the apparel onto the person so the product looks its best: natural fit, accurate colors and design. Output one photorealistic image.";

      // Prepare content parts
      const contents = [
        {
          role: "user",
          parts: [
            {
              text: prompt
            },
            {
              inlineData: {
                mimeType: userImage.mimeType,
                data: userImage.data.toString('base64')
              }
            },
            {
              inlineData: {
                mimeType: productImage.mimeType,
                data: productImage.data.toString('base64')
              }
            }
          ]
        }
      ];

      // Use Imagen 4.0 for image generation
      const model = 'imagen-4.0-generate-001';
      const url = `${API_BASE_URL}/models/${model}:generateImages?key=${apiKey}`;

      const requestBody = {
        contents: contents,
        config: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      console.log('Sending try-on request to Google GenAI...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('GenAI API Error:', errorText);
        throw new Error(`GenAI API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // Extract generated image
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          // Find image part
          const imagePart = candidate.content.parts.find(part => part.inlineData);
          
          if (imagePart && imagePart.inlineData) {
            return {
              success: true,
              imageData: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType,
              imageDataUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
            };
          }
        }
      }

      throw new Error('No image generated in response');
    } catch (error) {
      console.error('Error generating try-on image:', error);
      throw error;
    }
  }

  /**
   * Alternative method using Gemini 2.5 Flash Image model (if Imagen is not available)
   * @param {string} userImageDataUrl - Base64 data URL of user/model image
   * @param {string} productImageDataUrl - Base64 data URL of product/apparel image
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Generated image data
   */
  async function generateTryOnImageWithGemini(userImageDataUrl, productImageDataUrl, options = {}) {
    try {
      const userImage = parseDataUrl(userImageDataUrl);
      const productImage = parseDataUrl(productImageDataUrl);
      console.log('User image:', userImage);
      console.log('Product image:', productImage);

      const prompt = options.prompt || 
        "Generate a realistic virtual try-on image. CRITICAL: (1) Preserve the person's exact face from the first image—same facial features, skin tone, and identity; do not alter or replace the face. (2) Use realistic lighting and background: soft natural or studio lighting, clean coherent background so the image looks like a real photo. (3) Composite the apparel onto the person so the product looks its best: natural fit, accurate colors and design. Output one photorealistic image.";

      const model = 'gemini-2.5-flash-image';
      const url = `${API_BASE_URL}/models/${model}:generateContent?key=${apiKey}`;

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              {
                text: prompt
              },
              {
                inlineData: {
                  mimeType: userImage.mimeType,
                  data: userImage.data.toString('base64')
                }
              },
              {
                inlineData: {
                  mimeType: productImage.mimeType,
                  data: productImage.data.toString('base64')
                }
              }
            ]
          }
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"]
        }
      };

      console.log('Sending try-on request to Gemini...');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Gemini API Error:', errorText);
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      
      // Extract generated image from response
      if (result.candidates && result.candidates.length > 0) {
        const candidate = result.candidates[0];
        
        if (candidate.content && candidate.content.parts) {
          const imagePart = candidate.content.parts.find(part => part.inlineData);
          
          if (imagePart && imagePart.inlineData) {
            return {
              success: true,
              imageData: imagePart.inlineData.data,
              mimeType: imagePart.inlineData.mimeType,
              imageDataUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`
            };
          }
        }
      }

      throw new Error('No image generated in response');
    } catch (error) {
      console.error('Error generating try-on image with Gemini:', error);
      throw error;
    }
  }

  return {
    generateTryOnImage,
    generateTryOnImageWithGemini
  };
}

