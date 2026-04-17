import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}

const prisma = global.prismaGlobal ?? new PrismaClient();

export default prisma;

/**
 * Store a code verifier for PKCE authentication
 * @param {string} state - The state parameter used in OAuth flow
 * @param {string} verifier - The code verifier to store
 * @returns {Promise<Object>} - The saved code verifier object
 */
export async function storeCodeVerifier(state, verifier) {
  // Calculate expiration date (10 minutes from now)
  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 10);

  try {
    return await prisma.codeVerifier.create({
      data: {
        id: `cv_${Date.now()}`,
        state,
        verifier,
        expiresAt
      }
    });
  } catch (error) {
    console.error('Error storing code verifier:', error);
    throw error;
  }
}

/**
 * Get a code verifier by state parameter
 * @param {string} state - The state parameter used in OAuth flow
 * @returns {Promise<Object|null>} - The code verifier object or null if not found
 */
export async function getCodeVerifier(state) {
  try {
    const verifier = await prisma.codeVerifier.findFirst({
      where: {
        state,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (verifier) {
      // Delete it after retrieval to prevent reuse
      await prisma.codeVerifier.delete({
        where: {
          id: verifier.id
        }
      });
    }

    return verifier;
  } catch (error) {
    console.error('Error retrieving code verifier:', error);
    return null;
  }
}

/**
 * Store a customer access token in the database
 * @param {string} conversationId - The conversation ID to associate with the token
 * @param {string} accessToken - The access token to store
 * @param {Date} expiresAt - When the token expires
 * @returns {Promise<Object>} - The saved customer token
 */
export async function storeCustomerToken(conversationId, accessToken, expiresAt) {
  try {
    // Check if a token already exists for this conversation
    const existingToken = await prisma.customerToken.findFirst({
      where: { conversationId }
    });

    if (existingToken) {
      // Update existing token
      return await prisma.customerToken.update({
        where: { id: existingToken.id },
        data: {
          accessToken,
          expiresAt,
          updatedAt: new Date()
        }
      });
    }

    // Create a new token record
    return await prisma.customerToken.create({
      data: {
        id: `ct_${Date.now()}`,
        conversationId,
        accessToken,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer token:', error);
    throw error;
  }
}

/**
 * Get a customer access token by conversation ID
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object|null>} - The customer token or null if not found/expired
 */
export async function getCustomerToken(conversationId) {
  try {
    const token = await prisma.customerToken.findFirst({
      where: {
        conversationId,
        expiresAt: {
          gt: new Date() // Only return non-expired tokens
        }
      }
    });

    return token;
  } catch (error) {
    console.error('Error retrieving customer token:', error);
    return null;
  }
}

/**
 * Create or update a conversation in the database
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Object>} - The created or updated conversation
 */
export async function createOrUpdateConversation(conversationId) {
  try {
    const existingConversation = await prisma.conversation.findUnique({
      where: { id: conversationId }
    });

    if (existingConversation) {
      return await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          updatedAt: new Date()
        }
      });
    }

    return await prisma.conversation.create({
      data: {
        id: conversationId
      }
    });
  } catch (error) {
    console.error('Error creating/updating conversation:', error);
    throw error;
  }
}

/**
 * Save a message to the database
 * @param {string} conversationId - The conversation ID
 * @param {string} role - The message role (user or assistant)
 * @param {string} content - The message content
 * @returns {Promise<Object>} - The saved message
 */
export async function saveMessage(conversationId, role, content) {
  try {
    // Ensure the conversation exists
    await createOrUpdateConversation(conversationId);

    // Create the message
    return await prisma.message.create({
      data: {
        conversationId,
        role,
        content
      }
    });
  } catch (error) {
    console.error('Error saving message:', error);
    throw error;
  }
}


export async function saveCartId(conversationId, cartId) {
  // Add your database logic to save the cartId associated with the conversation.
  // Example using Prisma:
  // await prisma.conversation.update({ where: { id: conversationId }, data: { cartId: cartId } });
  console.log(`Saved cartId ${cartId} for conversation ${conversationId}`);
}

export async function getCartId(conversationId) {
  // Add your database logic to retrieve the cartId.
  // Example using Prisma:
  // const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  // return conversation?.cartId || null;
  return null; // Placeholder
}

/**
 * Get conversation history
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<Array>} - Array of messages in the conversation
 */
export async function getConversationHistory(conversationId) {
  try {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' }
    });

    return messages;
  } catch (error) {
    console.error('Error retrieving conversation history:', error);
    return [];
  }
}

/**
 * Store customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @param {string} url - The customer account URL
 * @returns {Promise<Object>} - The saved URL object
 */
export async function storeCustomerAccountUrl(conversationId, url) {
  try {
    return await prisma.customerAccountUrl.upsert({
      where: { conversationId },
      update: {
        url,
        updatedAt: new Date()
      },
      create: {
        conversationId,
        url,
        updatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error storing customer account URL:', error);
    throw error;
  }
}

/**
 * Get customer account URL for a conversation
 * @param {string} conversationId - The conversation ID
 * @returns {Promise<string|null>} - The customer account URL or null if not found
 */
export async function getCustomerAccountUrl(conversationId) {
  try {
    const record = await prisma.customerAccountUrl.findUnique({
      where: { conversationId }
    });

    return record?.url || null;
  } catch (error) {
    console.error('Error retrieving customer account URL:', error);
    return null;
  }
}

/**
 * Get chat configuration for a shop
 * @param {string} shop - The shop domain
 * @returns {Promise<Object|null>} - The chat config or null if not found
 */
export async function getChatConfig(shop) {
  try {
    // Clean shop domain (remove www. and protocol if present) - same as upsertChatConfig
    let cleanShop = shop.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    
    const config = await prisma.chatConfig.findUnique({
      where: { shop: cleanShop }
    });

    if (config) {
      // Convert individual fields to array, filtering out null/empty values
      const suggestiveQuestions = [
        config.suggestiveQuestion1,
        config.suggestiveQuestion2,
        config.suggestiveQuestion3,
        config.suggestiveQuestion4
      ].filter(q => q && q.trim() !== '');

      return {
        ...config,
        suggestiveQuestions
      };
    }

    return null;
  } catch (error) {
    console.error('Error retrieving chat config:', error);
    return null;
  }
}

/**
 * Create or update chat configuration for a shop with individual question fields
 * @param {string} shop - The shop domain
 * @param {string|null} suggestiveQuestion1 - First question
 * @param {string|null} suggestiveQuestion2 - Second question
 * @param {string|null} suggestiveQuestion3 - Third question
 * @param {string|null} suggestiveQuestion4 - Fourth question
 * @param {string|null} suggestiveQuestion5 - Fifth question
 * @param {number} maxSuggestiveQuestions - Maximum number of questions to show
 * @returns {Promise<Object>} - The saved chat config
 */
export async function upsertChatConfig(shop, suggestiveQuestion1 = null, suggestiveQuestion2 = null, suggestiveQuestion3 = null, suggestiveQuestion4 = null, suggestiveQuestion5 = null, maxSuggestiveQuestions = 4) {
  try {
    // Clean shop domain (remove www. and protocol if present)
    let cleanShop = shop.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    const config = await prisma.chatConfig.upsert({
      where: { shop: cleanShop },
      update: {
        suggestiveQuestion1: suggestiveQuestion1 && suggestiveQuestion1.trim() !== '' ? suggestiveQuestion1.trim() : null,
        suggestiveQuestion2: suggestiveQuestion2 && suggestiveQuestion2.trim() !== '' ? suggestiveQuestion2.trim() : null,
        suggestiveQuestion3: suggestiveQuestion3 && suggestiveQuestion3.trim() !== '' ? suggestiveQuestion3.trim() : null,
        suggestiveQuestion4: suggestiveQuestion4 && suggestiveQuestion4.trim() !== '' ? suggestiveQuestion4.trim() : null,
        suggestiveQuestion5: suggestiveQuestion5 && suggestiveQuestion5.trim() !== '' ? suggestiveQuestion5.trim() : null,
        maxSuggestiveQuestions
      },
      create: {
        shop: cleanShop,
        suggestiveQuestion1: suggestiveQuestion1 && suggestiveQuestion1.trim() !== '' ? suggestiveQuestion1.trim() : null,
        suggestiveQuestion2: suggestiveQuestion2 && suggestiveQuestion2.trim() !== '' ? suggestiveQuestion2.trim() : null,
        suggestiveQuestion3: suggestiveQuestion3 && suggestiveQuestion3.trim() !== '' ? suggestiveQuestion3.trim() : null,
        suggestiveQuestion4: suggestiveQuestion4 && suggestiveQuestion4.trim() !== '' ? suggestiveQuestion4.trim() : null,
        suggestiveQuestion5: suggestiveQuestion5 && suggestiveQuestion5.trim() !== '' ? suggestiveQuestion5.trim() : null,
        maxSuggestiveQuestions
      }
    });

    // Convert to array format for compatibility
    const suggestiveQuestions = [
      config.suggestiveQuestion1,
      config.suggestiveQuestion2,
      config.suggestiveQuestion3,
      config.suggestiveQuestion4,
      config.suggestiveQuestion5
    ].filter(q => q && q.trim() !== '');

    return {
      ...config,
      suggestiveQuestions
    };
  } catch (error) {
    console.error('Error upserting chat config:', error);
    throw error;
  }
}

/**
 * Sync chat config from customizer settings (for backward compatibility with array format)
 * @param {string} shop - The shop domain
 * @param {Array<string>} suggestiveQuestions - Array of suggestive questions (max 5)
 * @param {number} maxSuggestiveQuestions - Maximum number of questions to show
 * @returns {Promise<Object>} - The saved chat config
 */
export async function syncChatConfigFromArray(shop, suggestiveQuestions = [], maxSuggestiveQuestions = 4) {
  try {
    return await upsertChatConfig(
      shop,
      suggestiveQuestions[0] || null,
      suggestiveQuestions[1] || null,
      suggestiveQuestions[2] || null,
      suggestiveQuestions[3] || null,
      null, // question5 always null now
      maxSuggestiveQuestions
    );
  } catch (error) {
    console.error('Error syncing chat config from array:', error);
    throw error;
  }
}
