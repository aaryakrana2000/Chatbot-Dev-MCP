/**
 * Chat API route — handles all chat-related HTTP traffic from the storefront widget.
 *
 * Supports three modes via GET (loader):
 * 1. OPTIONS — CORS preflight.
 * 2. ?history=1&conversation_id=... — fetch conversation history (and suggestive questions when empty).
 * 3. ?suggestive_questions=1 — fetch only suggestive questions for the shop.
 * 4. Accept: text/event-stream (no history param) — start a new streaming chat turn.
 *
 * POST (action): send a user message and get a streaming chat response (same as SSE flow).
 */
import { json } from "@remix-run/node";
import { getConversationLogger } from "../utils/conversation-logger.server";

const CHAT_LOG_FILE = "app/routes/chat.jsx";

/** Write to logs folder with source file and function. By conversationId when present, else chat-api-{date}.log */
function chatLog(conversationId, functionName, message, data = {}) {
  getConversationLogger().appendMessage(conversationId ?? null, message, data, { file: CHAT_LOG_FILE, function: functionName });
}

/**
 * Maps caught errors to safe, human-readable messages for the chat UI.
 * Avoids exposing API keys, paths, or stack traces.
 * @param {Error} error - Caught error
 * @param {{ errorMessages?: object }} [appConfig] - Optional config with errorMessages (apiKeyError, rateLimitExceeded, etc.)
 * @returns {string} User-facing message
 */
function getChatErrorMessage(error, appConfig = null) {
  const msg = (error?.message || String(error)).toLowerCase();
  const errMessages = appConfig?.errorMessages || {};

  if (msg.includes("missing shop domain") || msg.includes("shop domain")) {
    return "We couldn't identify your store. Please open this chat from the store page and try again.";
  }
  if (msg.includes("api key") || msg.includes("apikey") || msg.includes("not set") || msg.includes("401") || msg.includes("auth") || msg.includes("invalid key")) {
    return errMessages.apiKeyError || "Our chat service is temporarily misconfigured. Please contact the store owner.";
  }
  if (msg.includes("rate limit") || msg.includes("429") || msg.includes("quota") || msg.includes("overloaded") || msg.includes("529")) {
    return errMessages.rateLimitExceeded || "We're getting a lot of requests right now. Please wait a moment and try again.";
  }
  if (msg.includes("prompts.json") || msg.includes("file not found") || msg.includes("configuration")) {
    return "Chat configuration is missing. The store owner needs to fix this.";
  }
  if (msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("network") || msg.includes("fetch failed") || msg.includes("etimedout") || msg.includes("timeout")) {
    return "We couldn't reach the chat service. Check your connection and try again.";
  }
  if (msg.includes("invalid") && (msg.includes("image") || msg.includes("data url") || msg.includes("url format"))) {
    return "The image couldn't be used. Please use a smaller or valid image and try again.";
  }
  if (msg.includes("image too large") || msg.includes("too large")) {
    return "The image is too large. Please use a smaller image and try again.";
  }
  if (msg.includes("no image generated") || msg.includes("no image url")) {
    return "We couldn't generate the image. Please try again or try a different image.";
  }
  if (msg.includes("message is required") || msg.includes("missing message")) {
    return errMessages.missingMessage || "Please type a message or attach an image.";
  }

  return "Something went wrong on our side. Please try again in a moment. If it keeps happening, contact the store.";
}

/**
 * Loader: GET requests. Routes to history, suggestive questions, or rejects unsupported usage.
 * Server-only modules are dynamically imported here to keep this route safe for Remix loader context.
 */
export async function loader({ request }) {
  chatLog(null, "loader", "loader()");
  const MCPClient = (await import("../mcp-client")).default;
  const { saveMessage, getConversationHistory } = await import("../db.server");
  const AppConfig = (await import("../services/config.server")).default;
  const { createSseStream } = await import("../services/streaming.server");
  const { createOpenAIDirectService } = await import("../services/openai-direct.server.js");
  const { createToolService } = await import("../services/tool.server");
  const { getCartIdFromStorefront, getCustomerMcpEndpoint, getShopContext } = await import("../services/shopify.server.js");

  if (request.method === "OPTIONS") {
    chatLog(null, "loader", "-> OPTIONS (CORS preflight)");
    return new Response(null, { status: 204, headers: getCorsHeaders(request) });
  }
  const url = new URL(request.url);
  if (url.searchParams.has('history') && url.searchParams.has('conversation_id')) {
    chatLog(null, "loader", "-> handleHistoryRequest");
    return handleHistoryRequest(request, url.searchParams.get('conversation_id'), { getConversationHistory, AppConfig });
  }
  if (url.searchParams.has('suggestive_questions')) {
    chatLog(null, "loader", "-> handleSuggestiveQuestionsRequest");
    return handleSuggestiveQuestionsRequest(request, { AppConfig });
  }
  if (!url.searchParams.has('history') && request.headers.get("Accept") === "text/event-stream") {
    chatLog(null, "loader", "-> handleChatRequest (SSE)");
    return handleChatRequest(request, { MCPClient, saveMessage, getConversationHistory, AppConfig, createSseStream, createOpenAIDirectService, createToolService, getCartIdFromStorefront, getCustomerMcpEndpoint, getShopContext });
  }
  chatLog(null, "loader", "-> 400 unsupported");
  return ({ error: AppConfig.errorMessages.apiUnsupported }, { status: 400, headers: getCorsHeaders(request) });
}

/**
 * Action: POST requests. Body contains message, conversation_id, optional cart_id, product_context, uploaded_image.
 * Runs the same streaming chat flow as the SSE GET path; used when the client posts JSON instead of opening an EventSource.
 */
export async function action({ request }) {
  chatLog(null, "action", "action()");
  const MCPClient = (await import("../mcp-client")).default;
  const { saveMessage, getConversationHistory } = await import("../db.server");
  const AppConfig = (await import("../services/config.server")).default;
  const { createSseStream } = await import("../services/streaming.server");
  const { createOpenAIDirectService } = await import("../services/openai-direct.server.js");
  const { createToolService } = await import("../services/tool.server");
  const { getCartIdFromStorefront, getCustomerMcpEndpoint, getShopContext } = await import("../services/shopify.server.js");

  return handleChatRequest(request, { MCPClient, saveMessage, getConversationHistory, AppConfig, createSseStream, createOpenAIDirectService, createToolService, getCartIdFromStorefront, getCustomerMcpEndpoint, getShopContext });
}


/**
 * Handles GET ?history=1&conversation_id=...
 * Returns { messages } for the conversation. When there are no messages, also returns
 * { suggestiveQuestions } from the shop's ChatConfig in DB, or from AppConfig defaults.
 */
async function handleHistoryRequest(request, conversationId, { getConversationHistory, AppConfig }) {
  chatLog(conversationId, "handleHistoryRequest", "handleHistoryRequest()", { conversationId });
  const messages = await getConversationHistory(conversationId);

  // Empty conversation: include starter suggestive questions (from DB per shop or config defaults)
  if (messages.length === 0) {
    try {
      const { getChatConfig } = await import("../db.server");
      // Extract shop domain from Origin header or Referer
      const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
      let shopDomain = null;
      
      if (origin) {
        try {
          const url = new URL(origin);
          shopDomain = url.hostname.replace(/^www\./, '');
        } catch (e) {
          chatLog(null, "handleHistoryRequest", "Could not parse origin", { origin });
        }
      }
      
      let suggestiveQuestions = AppConfig.chat?.suggestiveQuestions || [];
      let maxQuestions = AppConfig.chat?.maxSuggestiveQuestions || 4;

      // Try to fetch from database if shop domain is available
      if (shopDomain) {
        try {
          chatLog(null, "handleHistoryRequest", "Fetching chat config for shop", { shopDomain });
          const config = await getChatConfig(shopDomain);
          if (config && config.suggestiveQuestions && config.suggestiveQuestions.length > 0) {
            chatLog(null, "handleHistoryRequest", "Found config in database", { questions: config.suggestiveQuestions?.length, max: config.maxSuggestiveQuestions });
            suggestiveQuestions = config.suggestiveQuestions;
            maxQuestions = config.maxSuggestiveQuestions || maxQuestions;
          } else {
            chatLog(null, "handleHistoryRequest", "No config found in database, using defaults");
          }
        } catch (dbError) {
          chatLog(null, "handleHistoryRequest", "Error fetching chat config, using defaults", { error: dbError?.message });
        }
      } else {
        chatLog(null, "handleHistoryRequest", "No shop domain available, using defaults");
      }

      return ({
        messages: [],
        suggestiveQuestions: suggestiveQuestions.slice(0, maxQuestions)
      }, { headers: getCorsHeaders(request) });
    } catch (error) {
      chatLog(null, "handleHistoryRequest", "Error in handleHistoryRequest", { error: error?.message });
      // Fall back to config defaults
      const suggestiveQuestions = AppConfig.chat?.suggestiveQuestions || [];
      const maxQuestions = AppConfig.chat?.maxSuggestiveQuestions || 4;
      return ({
        messages: [],
        suggestiveQuestions: suggestiveQuestions.slice(0, maxQuestions)
      }, { headers: getCorsHeaders(request) });
    }
  }
  
  return ({ messages }, { headers: getCorsHeaders(request) });
}

/**
 * Handles GET ?suggestive_questions=1.
 * Returns only { suggestiveQuestions } for the current shop (from DB or AppConfig defaults).
 * Shop is derived from Origin/Referer request headers.
 */
async function handleSuggestiveQuestionsRequest(request, { AppConfig }) {
  chatLog(null, "handleSuggestiveQuestionsRequest", "handleSuggestiveQuestionsRequest()");
  try {
    const { getChatConfig } = await import("../db.server");
    // Extract shop domain from Origin header or Referer
    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
    let shopDomain = null;
    
    if (origin) {
      try {
        const url = new URL(origin);
        shopDomain = url.hostname.replace(/^www\./, '');
      } catch (e) {
        chatLog(null, "handleSuggestiveQuestionsRequest", "Could not parse origin", { origin });
      }
    }
    
    let suggestiveQuestions = AppConfig.chat?.suggestiveQuestions || [];
    let maxQuestions = AppConfig.chat?.maxSuggestiveQuestions || 4;

    // Try to fetch from database if shop domain is available
    if (shopDomain) {
      try {
        chatLog(null, "handleSuggestiveQuestionsRequest", "Fetching suggestive questions for shop", { shopDomain });
        const config = await getChatConfig(shopDomain);
        if (config && config.suggestiveQuestions && config.suggestiveQuestions.length > 0) {
          chatLog(null, "handleSuggestiveQuestionsRequest", "Found questions in database", { questions: config.suggestiveQuestions?.length, max: config.maxSuggestiveQuestions });
          suggestiveQuestions = config.suggestiveQuestions;
          maxQuestions = config.maxSuggestiveQuestions || maxQuestions;
        } else {
          chatLog(null, "handleSuggestiveQuestionsRequest", "No questions found in database, using defaults");
        }
      } catch (dbError) {
        chatLog(null, "handleSuggestiveQuestionsRequest", "Error fetching chat config, using defaults", { error: dbError?.message });
        // Fall back to config defaults
      }
    } else {
      chatLog(null, "handleSuggestiveQuestionsRequest", "No shop domain available, using defaults");
    }

    return ({
      suggestiveQuestions: suggestiveQuestions.slice(0, maxQuestions)
    }, { headers: getCorsHeaders(request) });
  } catch (error) {
    chatLog(null, "handleSuggestiveQuestionsRequest", "Error in handleSuggestiveQuestionsRequest", { error: error?.message });
    // Fall back to config defaults
    const suggestiveQuestions = AppConfig.chat?.suggestiveQuestions || [];
    const maxQuestions = AppConfig.chat?.maxSuggestiveQuestions || 4;
    return ({
      suggestiveQuestions: suggestiveQuestions.slice(0, maxQuestions)
    }, { headers: getCorsHeaders(request) });
  }
}

/**
 * Handles one chat turn: parse JSON body, validate input, create an SSE stream, and run handleChatSession.
 * Request body: message, conversation_id (optional), cart_id, product_context, uploaded_image (optional).
 * Response: text/event-stream with events: id, new_message, chunk, message_complete, suggested_questions, product_results, image_generation_*, end_turn.
 */
async function handleChatRequest(request, { MCPClient, saveMessage, getConversationHistory, AppConfig, createSseStream, createOpenAIDirectService, createToolService, getCartIdFromStorefront, getCustomerMcpEndpoint, getShopContext }) {
  chatLog(null, "handleChatRequest", "handleChatRequest()");
  try {
    const body = await request.json();
    const { message: userMessage, conversation_id, cart_id, product_context, uploaded_image } = body;
    const conversationId = conversation_id || Date.now().toString();
    chatLog(conversationId, "handleChatRequest", "request body", { cart_id, hasProductContext: !!product_context, hasUploadedImage: !!uploaded_image });
    // Require at least a text message or an uploaded image (e.g. for try-on)
    if (!userMessage && !uploaded_image) {
      return new Response(JSON.stringify({ error: AppConfig.errorMessages.missingMessage }), { status: 400, headers: getSseHeaders(request) });
    }

    // Create SSE stream; the callback runs handleChatSession and sends events into the stream
    const responseStream = createSseStream(async (stream) => {
      await handleChatSession({ request, userMessage, conversationId, cartId: cart_id, productContext: product_context, uploadedImage: uploaded_image, stream, MCPClient, saveMessage, getConversationHistory, createOpenAIDirectService, createToolService, getShopContext, getCustomerMcpEndpoint, AppConfig });
    });

    return new Response(responseStream, { headers: getSseHeaders(request) });
  } catch (error) {
    chatLog(null, "handleChatRequest", "Error in chat request handler", { error: error?.message });
    const AppConfig = (await import("../services/config.server")).default;
    const userMessage = getChatErrorMessage(error, AppConfig);
    return json({ error: userMessage }, { status: 500, headers: getCorsHeaders(request) });
  }
}

/**
 * Recursively sanitizes a JSON Schema so it is compatible with OpenAI's tool parameter schema.
 * Strips additional_properties/additionalProperties, narrows string "format" to enum/date-time only,
 * and drops "required" on non-object types to avoid validation issues.
 */
function sanitizeSchema(schema) {
  if (typeof schema !== 'object' || schema === null) return schema;
  if (Array.isArray(schema)) return schema.map(item => sanitizeSchema(item));

  const newSchema = {};
  for (const key in schema) {
    if (key === 'additional_properties' || key === 'additionalProperties') continue;
    if (key === 'format' && schema.type === 'string' && !['enum', 'date-time'].includes(schema[key])) continue;

    if (key === 'required' && schema.type !== 'object') continue;

    newSchema[key] = sanitizeSchema(schema[key]);
  }
  return newSchema;
}

// Category-prefixed lines (e.g. "Shirt: Linen Eyelet Panel Guayabera Shirt (Egret) — $105.00") — match so we can extract product name
const OUTFIT_CATEGORY_PREFIX = /^\s*(?:Shirt|Pants|Shoes|Top|Bottom|Dress|Jacket|Vest|Accessory|Sneakers|Footwear)\s*:\s*(.+?)\s*[—–-]\s*\$?[\d.,]+/im;

/** Extract product handle from product URL (e.g. .../products/linen-shirt -> linen-shirt) */
function getHandleFromProduct(product) {
  const url = product?.url || '';
  const m = url.match(/\/products\/([a-z0-9\-]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/** From search results, pick the product that matches the requested handle (exact); returns null if none match. */
function pickProductByHandle(products, handle) {
  if (!products || products.length === 0 || !handle) return null;
  const want = String(handle).toLowerCase().trim();
  return products.find(p => getHandleFromProduct(p) === want) || null;
}

/**
 * Extract product handles from text. Handles are stable and won't break when wording changes.
 * Sources: /products/{{handle}} in URLs, and explicit [handle: {{handle}}] or handle: {{handle}}.
 * @returns {string[]} Unique list of handles (lowercase)
 */
function extractProductHandlesFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const handles = new Set();
  const urlHandleRe = /\/products\/([a-z0-9\-]+)/gi;
  let match;
  while ((match = urlHandleRe.exec(text)) !== null) {
    handles.add(match[1].toLowerCase());
  }
  const explicitRe = /\[?handle\s*:\s*([a-z0-9\-]+)\]?/gi;
  while ((match = explicitRe.exec(text)) !== null) {
    handles.add(match[1].toLowerCase());
  }
  return [...handles];
}

/**
 * Product identifiers: prefer handles (stable) over names (pattern-based).
 * Returns array of { type: 'handle'|'name', value: string } for the given text.
 */
function extractProductIdentifiers(text) {
  const handles = extractProductHandlesFromText(text);
  if (handles.length > 0) {
    return handles.map(value => ({ type: 'handle', value }));
  }
  const names = extractProductNamesFromText(text);
  return names.map(value => ({ type: 'name', value }));
}

const PRODUCT_NAME_PATTERNS = [
  // Outfit-style "Shirt: Product Name (Variant) — $price" / "Pants: ..." / "Shoes: ..." — so cards match LLM message
  /^(?:Shirt|Pants|Shoes|Top|Bottom|Dress|Jacket|Vest|Accessory|Sneakers|Footwear)\s*:\s*.+?\s*[—–-]\s*\$?[\d.,]+(?:\s*\([^)]*\))?\s*$/gim,
  // Link format with optional bold price: [Name](url) - $price or **$price**
  /\*\*([^*]+)\*\*\s*[—-]\s*\*\*[₹$£€¥₩₽¢₡₪₦₨₫₴₵₸₺﷼₼₾₿¤][\d.,]+\*\*/g,
  /\[([^\]]+)\]\([^)]+\)\s*[—-]\s*\*\*\$?[\d.,]+(?:[\s-–—]+\$?[\d.,]+)?\*\*/g,
  /\*\*\[([^\]]+)\]\([^)]+\)\*\*\s*[—-]\s*\*\*\$?[\d.,]+(?:[\s-–—]+\$?[\d.,]+)?(?:\s*[A-Z]{3})?\*\*/g,
  /\*\*([^*]+)\*\*\s*[—-]\s*\*\*\$?[\d.,]+(?:[\s-–—]+\$?[\d.,]+)?(?:\s*[A-Z]{3})?\*\*/g,
  /\*\*([^*]+?)(?:\s*\([^)]*\))?\*\*\s*[—-]\s*\$?[\d.,]+(?:[\s-–—]+\$?[\d.,]+)?/g,
  /\*\*([^*]+)\*\*\s*[—-]\s*\$?[\d.,]+/g,
  // Plain link + plain price (e.g. [Nalani Cardigan](url) - $200.00 (Black, Beige)) — ensures product_results and shop-ai-product-card render
  /\[([^\]]+)\]\([^)]+\)\s*[—-]\s*\$?[\d.,]+(?:\s*\([^)]*\))?/g,
  // Plain "Name - $price" or "Name - $price (colors)" — bullet list without markdown link
  /([A-Z][^\n—-]+?)\s*[—-]\s*\$?[\d.,]+(?:\s*\([^)]*\))?/g,
  /([A-Z][^\n—-]+?)\s*[—-]\s*\$?[\d.,]+(?:[\s-–—]+\$?[\d.,]+)?/g,
  /^\s*[-*]?\s*\*\*([^*]+)\*\*/gm,
  // Bullet-only product names (no price/link) — e.g. "- Off-Shoulder Embroidered Eyelet Dress" or "...Dress – SS215"
  /^\s*[-*]\s*[^\n?]+$/gm
];

function extractProductNamesFromText(text) {
  let allMatches = [];
  for (const pattern of PRODUCT_NAME_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      allMatches = matches;
      break;
    }
  }
  const productNames = allMatches.map(match => {
    let name = null;
    // Outfit-style "Shirt: Product Name (Variant) — $105.00"
    const categoryMatch = match.match(OUTFIT_CATEGORY_PREFIX);
    if (categoryMatch) name = categoryMatch[1];
    else {
      const linkMatch = match.match(/\*\*\[([^\]]+)\]/);
      if (linkMatch) name = linkMatch[1];
      else {
        const boldMatch = match.match(/\*\*([^*]+)\*\*/);
        if (boldMatch) name = boldMatch[1];
        else {
          const plainLinkMatch = match.match(/\[([^\]]+)\]\([^)]+\)/);
          if (plainLinkMatch) name = plainLinkMatch[1];
          else {
            const nameMatch = match.match(/([^—-]+?)\s*[—-]/);
            if (nameMatch) name = nameMatch[1];
            else {
              const bulletOnly = match.replace(/^\s*[-*]\s*/, '').trim();
              if (bulletOnly.length >= 15) name = bulletOnly.replace(/\s*[–-]\s*[A-Z]{2}\d+\s*$/, '').trim();
            }
          }
        }
      }
    }
    return name ? name.trim().replace(/^[-*]\s*/, '') : null;
  }).filter(Boolean);
  const suggestionStarts = /^(show me|what's|what is|do you|tell me|i need|add |proceed|can you|want me|how can|any |is there)/i;
  return [...new Set(productNames)].filter(name =>
    name.length > 2 &&
    !name.match(/^\$?[\d.,]+$/) &&
    !suggestionStarts.test(name.trim())
  );
}

/**
 * If the AI used multiple outfit sections (## OUTFIT: Label or OUTFIT: Label), returns array of { label, productNames }.
 * Otherwise returns null (single product list).
 */
function parseOutfitSections(textContent) {
  // Normalize so both "## OUTFIT: X" and "OUTFIT: X" / "**OUTFIT: X**" at line start are treated the same
  const normalized = String(textContent).replace(/(\n|^)\s*(\*\*)?\s*OUTFIT\s*:\s*/gi, '$1## OUTFIT: ');
  const marker = /##\s*OUTFIT\s*:\s*/gi;
  const parts = normalized.split(marker);
  if (parts.length <= 1) return null;
  const sections = [];
  for (let i = 1; i < parts.length; i++) {
    const block = parts[i].trim();
    const firstLineEnd = block.indexOf('\n');
    const label = (firstLineEnd >= 0 ? block.slice(0, firstLineEnd) : block).trim().replace(/\*\*/g, '') || `Outfit ${i}`;
    const body = firstLineEnd >= 0 ? block.slice(firstLineEnd + 1) : '';
    const identifiers = extractProductIdentifiers(body);
    if (identifiers.length > 0) sections.push({ label, identifiers });
  }
  return sections.length > 0 ? sections : null;
}

/**
 * From search results, pick the single product that best matches the requested product name (so cards match the LLM message).
 * @param {Array} products - Products returned from search
 * @param {string} requestedName - Product name from the LLM (e.g. "Solid Linen Presidente Guayabera Shirt")
 * @returns {Object|null} Best-matching product or first product if no clear match
 */
function pickBestMatchForProductName(products, requestedName) {
  if (!products || products.length === 0) return null;
  if (products.length === 1) return products[0];
  const want = (requestedName || '').toLowerCase().trim();
  if (!want) return products[0];
  const wantWords = want.split(/\s+/).filter(w => w.length > 1);
  let best = products[0];
  let bestScore = -1;
  for (const p of products) {
    const title = (p.title || '').toLowerCase();
    if (title === want) return p;
    const titleWords = title.split(/\s+/).filter(w => w.length > 1);
    const matchCount = wantWords.filter(w => titleWords.some(t => t.includes(w) || w.includes(t))).length;
    const wordScore = matchCount / Math.max(wantWords.length, 1);
    const exactSubstring = title.includes(want) || want.includes(title) ? 1 : 0;
    const keyTerms = ['guayabera', 'eyelet', 'oxford', 'viento', 'brox', 'drawstring', 'linen', 'embroidered', 'lace-up', 'leather', 'drivers'];
    const keyBonus = keyTerms.filter(term => want.includes(term) && title.includes(term)).length * 0.5;
    const score = exactSubstring * 2 + wordScore + keyBonus;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

/**
 * Converts MCP tool definitions (name, description, input_schema) into the shape expected by
 * OpenAI Responses API / tool use: name, description, parameters (sanitized schema).
 */
function formatToolsForOpenAI(conversationId, mcpTools) {
  chatLog(conversationId, "formatToolsForOpenAI", "formatToolsForOpenAI()", { count: mcpTools?.length ?? 0 });
  if (!mcpTools || mcpTools.length === 0) return [];
  return mcpTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: sanitizeSchema(tool.input_schema),
  }));
}


// --- Session and conversation handlers ---

/**
 * Runs one full chat turn: init services, save user message, load history, call OpenAI with MCP tools,
 * then parse AI response for product names, fetch products via MCP, save assistant message, and send
 * SSE events (chunks, suggested questions, product_results, image_generation_result, etc.).
 */
async function handleChatSession({ request, userMessage, conversationId, cartId, productContext, uploadedImage, stream, MCPClient, saveMessage, getConversationHistory, createOpenAIDirectService, createToolService, getShopContext, getCustomerMcpEndpoint, AppConfig }) {
  chatLog(conversationId, "handleChatSession", "handleChatSession()", { conversationId });
  let openaiDirectService, toolService, mcpClient;

  try {
    // --- 1. Initialize services and shop context ---
    openaiDirectService = createOpenAIDirectService();
    toolService = createToolService();
    const shopId = request.headers.get("X-Shopify-Shop-Id");
    const shopDomain = request.headers.get("Origin");

    if (!shopDomain) {
      throw new Error("Missing shop domain in request headers");
    }

    const shopContext = await getShopContext(shopDomain);
    chatLog(conversationId, "handleChatSession", "Retrieved shop context", { country: shopContext?.country, currency: shopContext?.currency });

    const customerMcpEndpoint = await getCustomerMcpEndpoint(shopDomain, conversationId);
    mcpClient = new MCPClient(shopDomain, conversationId, shopId, customerMcpEndpoint);

    stream.sendMessage({ type: 'id', conversation_id: conversationId });

    // Connect to storefront MCP server to get available tools (search_catalog, get_cart, etc.)
    await mcpClient.connectToStorefrontServer().catch(e => chatLog(conversationId, "handleChatSession", "MCP connection failed", { error: e?.message }));
    const availableTools = formatToolsForOpenAI(conversationId, mcpClient.tools);

    // --- 2. Persist user message and load conversation history ---
    const messageToSave = productContext
      ? `${userMessage} [Current active product: ${productContext.title}]`
      : userMessage;
    await saveMessage(conversationId, 'user', messageToSave);
    let conversationHistory = await getConversationHistory(conversationId);

    // --- 3. Single conversation step: OpenAI + tool handling + product parsing + persistence ---
    const runConversation = async (history) => {
      chatLog(conversationId, "runConversation", "runConversation()", { historyLength: history?.length });
      const Message_Size = 15;
      const historyForOpenAi = history.slice(-Message_Size);
      // console.log("historyForOpenAi>>>>>>>>>>>>>>>>>>",historyForOpenAi);
      

      let productsToDisplay = [];
      let finalAssistantMessage = null;
      let textBuffer = "";

      // Callbacks used by OpenAI streaming: stream text (with SHOW_PRODUCTS stripped), capture full message, optional image progress
      const streamHandlers = {
        onText: (text) => {
          textBuffer += text;
          const cleanText = text.replace(/SHOW_PRODUCTS:\s*\d+\s*/g, '');
          if (cleanText) {
            stream.sendMessage({ type: 'chunk', chunk: cleanText });
          }
        },
        onMessage: (message) => { finalAssistantMessage = message; },
        onProgress: (progress) => {
          if (uploadedImage || productImage) {
            stream.sendMessage({
              type: 'image_generation_progress',
              progress: progress
            });
          } else {
            chatLog(conversationId, "runConversation", "Skipping progress - no image generation expected");
          }
        },
      };

      stream.sendMessage({ type: 'new_message' });
      chatLog(conversationId, "runConversation", "Sending to OpenAI", { historyLength: historyForOpenAi?.length });

      let productImage = null;
      if (productContext && productContext.image_url) {
        productImage = productContext.image_url;
      }

      // Stream one assistant turn: OpenAI may call MCP tools; we get back content blocks and optional generated_image
      const openaiResponse = await openaiDirectService.streamConversation({
        messages: historyForOpenAi,
        shopContext: shopContext,
        shopDomain: shopDomain,
        conversationId: conversationId,
        cartId: cartId,
        uploadedImage: uploadedImage,
        productImage: productImage
      }, streamHandlers);

      // Log response without the full image data to avoid cluttering logs
      const responseForLog = { ...openaiResponse };
      if (responseForLog.generated_image) {
        responseForLog.generated_image = `[Image data: ${responseForLog.generated_image.length} chars]`;
      }
      if (responseForLog.full_response) {
        responseForLog.full_response = '[Full response object - see server logs]';
      }

      // If the model used the image_generation tool, send the result URL to the client
      if (openaiResponse.generated_image) {
        chatLog(conversationId, "runConversation", "Sending generated image to frontend", { length: openaiResponse.generated_image?.length });
        stream.sendMessage({
          type: 'image_generation_result',
          image_url: openaiResponse.generated_image
        });
      }

      // Parse AI text for product names and fetch product data via MCP in parallel with rest of turn
      const productFetchPromise = (async () => {
        if (openaiResponse.content && openaiResponse.content.length > 0) {
          const textContent = openaiResponse.content
            .filter(block => block.type === 'text')
            .map(block => block.text)
            .join('');

          chatLog(conversationId, "productFetchPromise", "Text content to analyze", { length: textContent?.length });

          const limitMatch = textContent.match(/SHOW_PRODUCTS:\s*(\d+)/);
          const productLimit = limitMatch ? parseInt(limitMatch[1]) : null;
          chatLog(conversationId, "productFetchPromise", "Product limit from AI", { productLimit });

          const outfitSections = parseOutfitSections(textContent);

          if (outfitSections && outfitSections.length > 0) {
            chatLog(conversationId, "productFetchPromise", "Multiple outfit sections detected", { labels: outfitSections.map(s => s.label) });
            const maxProducts = AppConfig.tools?.maxProductsToDisplay ?? 12;
            const sectionsWithProducts = [];
            for (const { label, identifiers } of outfitSections) {
              const sectionProducts = [];
              for (const { type, value } of identifiers) {
                try {
                  const toolArguments = {
                    query: value,
                    context: `country:${shopContext.country},language:${shopContext.language},currency:${shopContext.currency}`
                  };
                  const toolResponse = await mcpClient.callTool('search_catalog', toolArguments);
                  const tempProducts = [];
                  await toolService.handleToolSuccess(toolResponse, 'search_catalog', 'openai-product-search', [], tempProducts, conversationId, () => {}, cartId, shopContext, value);
                  const chosen = type === 'handle'
                    ? pickProductByHandle(tempProducts, value)
                    : pickBestMatchForProductName(tempProducts, value);
                  if (chosen) sectionProducts.push(chosen);
                  else if (type === 'name' && tempProducts.length > 0) sectionProducts.push(...tempProducts);
                } catch (error) {
                  chatLog(conversationId, "productFetchPromise", "Error fetching product data for outfit section", { type, value, error: error?.message });
                }
              }
              const uniqueSection = sectionProducts.filter((p, i, self) => self.findIndex(x => x.id === p.id) === i).slice(0, maxProducts);
              if (uniqueSection.length > 0) sectionsWithProducts.push({ label, products: uniqueSection });
            }
            return sectionsWithProducts.length > 0 ? { sections: sectionsWithProducts } : [];
          }

          const identifiers = extractProductIdentifiers(textContent);
          if (identifiers.length > 0) {
            chatLog(conversationId, "productFetchPromise", "Extracted product identifiers", { count: identifiers.length, byType: identifiers.reduce((a, i) => { a[i.type] = (a[i.type] || 0) + 1; return a; }, {}) });
            const allProducts = [];
            for (const { type, value } of identifiers) {
              try {
                const toolArguments = {
                  query: value,
                  context: `country:${shopContext.country},language:${shopContext.language},currency:${shopContext.currency}`
                };
                const toolResponse = await mcpClient.callTool('search_catalog', toolArguments);
                const tempProducts = [];
                await toolService.handleToolSuccess(toolResponse, 'search_catalog', 'openai-product-search', [], tempProducts, conversationId, () => {}, cartId, shopContext, value);
                const chosen = type === 'handle'
                  ? pickProductByHandle(tempProducts, value)
                  : pickBestMatchForProductName(tempProducts, value);
                if (chosen) allProducts.push(chosen);
                else if (type === 'name' && tempProducts.length > 0) allProducts.push(...tempProducts);
              } catch (error) {
                chatLog(conversationId, "productFetchPromise", "Error fetching product data", { type, value, error: error?.message });
              }
            }
            return allProducts;
          }
        }
        return [];
      })();

      // Persist assistant reply: strip SHOW_PRODUCTS and suggested-questions block, then save; emit suggested_questions as SSE
      if (openaiResponse.content && openaiResponse.content.length > 0) {
        const textContent = openaiResponse.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('');
        if (textContent) {
          const { cleanedText, suggestedQuestions } = extractSuggestedQuestions(conversationId, textContent);

          const finalText = cleanedText.replace(/SHOW_PRODUCTS:\s*\d+\s*/g, '').trim();

          await saveMessage(conversationId, 'assistant', finalText);

          if (suggestedQuestions.length > 0) {
            chatLog(conversationId, "runConversation", "Extracted suggested questions", { count: suggestedQuestions.length });
            stream.sendMessage({
              type: 'suggested_questions',
              questions: suggestedQuestions
            });
          }
        } else if (openaiResponse.generated_image) {
          await saveMessage(conversationId, 'assistant', 'Generated virtual try-on image');
        }
      }

      stream.sendMessage({ type: 'message_complete' });

      // Send product_results: one event per outfit section, or one event for a single product list
      const productResult = await productFetchPromise;
      if (productResult && (Array.isArray(productResult) ? productResult.length > 0 : productResult.sections?.length > 0)) {
        if (Array.isArray(productResult)) {
          const uniqueProducts = productResult.filter((product, index, self) =>
            index === self.findIndex(p => p.id === product.id)
          );
          const maxProducts = AppConfig.tools.maxProductsToDisplay;
          const productsToSend = uniqueProducts.slice(0, maxProducts);
          const headerText = productsToSend.length === 1 ? 'Product Details' : userMessage;
          stream.sendMessage({ type: 'product_results', products: productsToSend, headerText });
        } else {
          for (const section of productResult.sections) {
            stream.sendMessage({ type: 'product_results', products: section.products, headerText: section.label });
          }
        }
      }
    };

    await runConversation(conversationHistory);
    stream.sendMessage({ type: 'end_turn' });

  } catch (error) {
    chatLog(conversationId, "handleChatSession", "Error in chat session", { error: error?.message });
    const finalErrorMessage = getChatErrorMessage(error, AppConfig);
    stream.sendMessage({ type: 'chunk', chunk: finalErrorMessage });
    stream.sendMessage({ type: 'message_complete' });
    await saveMessage(conversationId, 'assistant', finalErrorMessage);
    stream.sendMessage({ type: 'end_turn' });
  }
}

/**
 * Splits AI response on the prompt-defined separator (7 newlines) to separate main content from
 * suggested follow-up questions. Returns cleaned text (for saving) and up to 4 suggested questions.
 * @param {string} text - Full AI response text
 * @returns {{ cleanedText: string, suggestedQuestions: string[] }}
 */
function extractSuggestedQuestions(conversationId, text) {
  chatLog(conversationId, "extractSuggestedQuestions", "extractSuggestedQuestions()");
  const parts = text.split('\n\n\n\n\n\n\n');

  if (parts.length < 2) {
    return {
      cleanedText: text,
      suggestedQuestions: []
    };
  }

  const cleanedText = parts[0].trim();
  const questionsSection = parts[parts.length - 1].trim();

  if (!questionsSection) {
    return {
      cleanedText: text,
      suggestedQuestions: []
    };
  }

  const questions = questionsSection
    .split('\n')
    .map(q => q.trim())
    .filter(q => q.length > 0 && q.length <= 100)
    .slice(0, 4);

  return {
    cleanedText: cleanedText,
    suggestedQuestions: questions
  };
}

/** Returns CORS headers for JSON/GET responses (history, suggestive_questions, OPTIONS). */
function getCorsHeaders(request, conversationId = null) {
  chatLog(conversationId, "getCorsHeaders", "getCorsHeaders()");
  const origin = request.headers.get("Origin") || "*";
  const requestHeaders = request.headers.get("Access-Control-Request-Headers") || "Content-Type, Accept";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": requestHeaders,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}

/** Returns headers for SSE stream responses (Content-Type, no-cache, CORS for EventSource). */
function getSseHeaders(request, conversationId = null) {
  chatLog(conversationId, "getSseHeaders", "getSseHeaders()");
  const origin = request.headers.get("Origin") || "*";
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
    "Access-Control-Allow-Headers": "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  };
}