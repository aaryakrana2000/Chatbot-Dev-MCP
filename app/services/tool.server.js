/**
 * Tool Service
 * Manages tool execution and processing
 */
import { saveMessage } from "../db.server";
import AppConfig from "./config.server";
import { getConversationLogger } from "../utils/conversation-logger.server";

const TOOL_LOG_FILE = "app/services/tool.server.js";
function toolLog(conversationId, functionName, message, data = {}) {
  getConversationLogger().appendMessage(conversationId ?? null, message, data, { file: TOOL_LOG_FILE, function: functionName });
}

/**
 * Creates a tool service instance
 * @returns {Object} Tool service with methods for managing tools
 */
export function createToolService() {
  /**
   * Handles a tool error response
   * @param {Object} toolUseResponse - The error response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Function} sendMessage - Function to send messages to the client
   * @param {string} conversationId - The conversation ID
   */
  const handleToolError = async (toolUseResponse, toolName, toolUseId, conversationHistory, sendMessage, conversationId) => {
    if (toolUseResponse.error?.type === "auth_required") {
      toolLog(conversationId, "handleToolError", "Auth required for tool", { toolName });
      await addToolResultToHistory(conversationHistory, toolUseId, toolUseResponse.error.data, conversationId);
      sendMessage({ type: 'auth_required' });
    } else {
      toolLog(conversationId, "handleToolError", "Tool use error", { toolName, error: toolUseResponse.error || toolUseResponse.content?.[0]?.text });
      const errorMessage = toolUseResponse.error?.data || toolUseResponse.content?.[0]?.text || "Tool execution failed";
      await addToolResultToHistory(conversationHistory, toolUseId, errorMessage, conversationId);
    }
  };

  /**
   * Handles a successful tool response
   * @param {Object} toolUseResponse - The response from the tool
   * @param {string} toolName - The name of the tool
   * @param {string} toolUseId - The ID of the tool use request
   * @param {Array} conversationHistory - The conversation history
   * @param {Array} productsToDisplay - Array to add product results to
   * @param {string} conversationId - The conversation ID
   * @param {Function} sendMessage - Function to send messages to the client
   * @param {string} cartId - The cart ID from the frontend
   * @param {string} userMessage - The original user message for filtering
   */
  const handleToolSuccess = async (
    toolUseResponse, toolName, toolUseId,
    conversationHistory, productsToDisplay, conversationId, sendMessage, cartId, shopContext, userMessage
  ) => {
    toolLog(conversationId, "handleToolSuccess", "Tool use response", { toolName });
    const toolOutput = toolUseResponse;

    if (toolName === AppConfig.tools.productSearchName) {
      toolLog(conversationId, "handleToolSuccess", "Processing product search tool response", { toolName });
      
      let products = processProductSearchResult(toolOutput, shopContext);
      toolLog(conversationId, "handleToolSuccess", "processProductSearchResult returned", { count: products.length });
      
      // Apply price-based filtering if detected
      if (userMessage) {
        toolLog(conversationId, "handleToolSuccess", "Applying price filtering for user message", { userMessage: userMessage?.slice(0, 80) });
        products = applyPriceFiltering(products, userMessage);
        toolLog(conversationId, "handleToolSuccess", "After price filtering", { count: products.length });
      }
      
      if (products.length === 0) {
        toolLog(conversationId, "handleToolSuccess", "No products found, attempting fallback broader search");
        return { needsFallback: true, originalQuery: userMessage };
      }
      
      toolLog(conversationId, "handleToolSuccess", "Adding products to productsToDisplay", { count: products.length });
      productsToDisplay.push(...products);
      
      // Only send product_results if not called from OpenAI product search context
      if (toolUseId !== 'openai-product-search') {
        const sortType = products.length > 0 ? products[0]._sortType : null;
        toolLog(conversationId, "handleToolSuccess", "Sending product_results message", { count: products.length });
        sendMessage({ 
          type: 'product_results', 
          products: products,
          sortType: sortType
        });
      }
      
      // Don't add product data to conversation history to prevent text duplication
      return { skipHistoryUpdate: true };
    } else if (toolName === AppConfig.tools.getProductDetailsName) {
      const detailedProduct = processProductDetailsResult(toolOutput);
      toolLog(conversationId, "handleToolSuccess", "Detailed product", { hasProduct: !!detailedProduct });
      if (detailedProduct) productsToDisplay.push(detailedProduct);
    } else if (toolName === AppConfig.tools.getCartName) {
      const cart = processCartResult(toolOutput);
      toolLog(conversationId, "handleToolSuccess", "Cart details", { hasCart: !!cart, hasCheckoutUrl: !!cart?.checkout_url });
      if (cart) {
        if (cart.checkout_url) {
          cart.checkout_url_formatted = `[Complete your purchase](${cart.checkout_url})`;
        }
        sendMessage({ type: 'cart_details', cart });
        
        // Check if cart is empty and handle immediately
        if (!cart.items || cart.items.length === 0) {
          const emptyCartMessage = "Your cart is empty.";
          sendMessage({ type: 'chunk', chunk: emptyCartMessage });
          await saveMessage(conversationId, 'assistant', emptyCartMessage);
          sendMessage({ type: 'message_complete' });
          sendMessage({ type: 'end_turn' });
          return { skipLLMResponse: true };
        } else {
          // For non-empty cart, add data to history immediately and send direct response
          const cartSummary = `Cart contains: ${cart.items.map(item => `${item.title} - $${item.price} (quantity: ${item.quantity})`).join(', ')}. Total: $${cart.total_price}`;
          const cartDataForLLM = {
            items: cart.items.map(item => ({
              id: item.id,
              variant_id: item.variant_id,
              title: item.title,
              price: item.price,
              quantity: item.quantity
            })),
            total_price: cart.total_price,
            cart_id: cart.id
          };
          addToolResultToHistory(conversationHistory, toolUseId, toolName, cartDataForLLM, conversationId);
          
          // Send immediate cart response to prevent mixing with other queries
          const cartResponse = `Here's what's in your cart right now:\n\n${cart.items.map(item => `• ${item.title} — $${item.price}${item.quantity > 1 ? ` (quantity: ${item.quantity})` : ''}`).join('\n')}\n\nSubtotal: $${cart.total_price}\nTotal: $${cart.total_price}\n\n[Complete your purchase](${cart.checkout_url})`;
          sendMessage({ type: 'chunk', chunk: cartResponse });
          await saveMessage(conversationId, 'assistant', cartResponse);
          sendMessage({ type: 'message_complete' });
          sendMessage({ type: 'end_turn' });
          return { skipLLMResponse: true };
        }
      }
    } else if (toolName === AppConfig.tools.updateCartName) {
      const updateResult = processUpdateCartResult(toolOutput);
      if (updateResult && updateResult.cart) {
        if (updateResult.cart.checkout_url) {
          updateResult.cart.checkout_url_formatted = `[Complete your purchase](${updateResult.cart.checkout_url})`;
        }
        // Update session storage with new cart ID if different
        if (cartId && updateResult.cart.id) {
          const newCartId = updateResult.cart.id.replace('gid://shopify/Cart/', '');
          const currentCartId = cartId.includes('gid://shopify/Cart/') ? cartId.replace('gid://shopify/Cart/', '') : cartId;
          if (newCartId !== currentCartId) {
            toolLog(conversationId, "handleToolSuccess", "Cart ID changed", { from: currentCartId, to: newCartId });
          }
        }
        sendMessage({ type: 'cart_updated', cart: updateResult.cart });
      }
      // Add clean summary instead of raw data
      const cleanSummary = `Cart updated successfully. ${updateResult?.cart?.items?.length || 0} items in cart.`;
      addToolResultToHistory(conversationHistory, toolUseId, toolName, cleanSummary, conversationId);
      return;
    } else if (toolName === AppConfig.tools.addToCartName) {
      const addResult = processAddToCartResult(toolOutput);
      toolLog(conversationId, "handleToolSuccess", "Add to cart result", { success: !!addResult });
      if (addResult && addResult.cart) {
        // Update session storage with new cart ID if different
        if (cartId && addResult.cart.id) {
          const newCartToken = addResult.cart.id.split('/').pop().split('?')[0];
          const currentCartToken = cartId.split('/').pop().split('?')[0];
          if (newCartToken !== currentCartToken) {
            toolLog(conversationId, "handleToolSuccess", "Cart token changed", { from: currentCartToken?.slice(0, 8), to: newCartToken?.slice(0, 8) });
          }
        }
        sendMessage({ type: 'cart_updated', cart: addResult.cart });
      }
    } else if (toolName === AppConfig.tools.searchPoliciesName) {
      const policyResult = processSearchPoliciesResult(toolOutput);
      toolLog(conversationId, "handleToolSuccess", "Policy search result", { hasResult: !!policyResult });
      
      // For FAQ searches, save the parsed result directly
      if (policyResult && Array.isArray(policyResult) && policyResult.length > 0) {
        addToolResultToHistory(conversationHistory, toolUseId, toolName, policyResult, conversationId);
        return;
      }
    }
    // For product searches, don't add to history if skipHistoryUpdate is set
    if (toolName !== AppConfig.tools.updateCartName && toolName !== AppConfig.tools.addToCartName && toolName !== AppConfig.tools.searchPoliciesName && toolName !== AppConfig.tools.productSearchName) {
      addToolResultToHistory(conversationHistory, toolUseId, toolName, toolOutput, conversationId);
    }
  };

  /**
   * Applies price-based filtering and sorting to products
   * @param {Array} products - Array of formatted products
   * @param {string} userMessage - The user's original message
   * @returns {Array} Filtered and sorted products
   */
  const applyPriceFiltering = (products, userMessage) => {
    toolLog(null, "applyPriceFiltering", "Applying price filtering for message", { userMessage: userMessage?.slice(0, 80), productsBefore: products.length });
    
    // Extract numeric price values for sorting
    const productsWithNumericPrice = products.map(product => {
      // Extract numeric value from price string (handles formats like "USD 44.99", "$44.99", "44.99", "1,234.56")
      const priceStr = String(product.price || '0');
      // Match the first number sequence (handles decimals and commas)
      const priceMatch = priceStr.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+\.\d+|\d+)/);
      let numericPrice = 0;
      if (priceMatch) {
        // Remove commas before parsing
        const cleanedPrice = priceMatch[1].replace(/,/g, '');
        numericPrice = parseFloat(cleanedPrice);
      }
      if (isNaN(numericPrice) || numericPrice <= 0) {
        toolLog(null, "applyPriceFiltering", "Could not parse valid price for product", { title: product.title, price: product.price });
      }
      return { ...product, numericPrice };
    });
    
    let filteredProducts = [...productsWithNumericPrice];
    let sortType = null; 
    
    // Check for price threshold filters (under, over, below, above, less than, more than, greater than)
    const thresholdPatterns = [
      { pattern: /\b(under|below|less than)\s*\$?\s*(\d+\.?\d*)/i, operator: '<', name: 'under' },
      { pattern: /\b(over|above|more than|greater than)\s*\$?\s*(\d+\.?\d*)/i, operator: '>', name: 'over' },
      { pattern: /\$?\s*(\d+\.?\d*)\s*(under|below|less than)/i, operator: '<', name: 'under' },
      { pattern: /\$?\s*(\d+\.?\d*)\s*(over|above|more than|greater than)/i, operator: '>', name: 'over' },
      { pattern: /\bgreater\s+than\s*\$?\s*(\d+\.?\d*)/i, operator: '>', name: 'over' },
      { pattern: /\bprice\s+is\s+greater\s+than\s*\$?\s*(\d+\.?\d*)/i, operator: '>', name: 'over' }
    ];
    
    let priceThreshold = null;
    let thresholdOperator = null;
    
    for (const { pattern, operator, name } of thresholdPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        const priceValue = parseFloat(match[2] || match[1]);
        if (!isNaN(priceValue)) {
          priceThreshold = priceValue;
          thresholdOperator = operator;
          toolLog(null, "applyPriceFiltering", "Detected price threshold", { name, priceThreshold });
          break;
        }
      }
    }
    
    // Apply price threshold filtering if detected
    if (priceThreshold !== null && thresholdOperator) {
      toolLog(null, "applyPriceFiltering", "Applying filter", { thresholdOperator, priceThreshold, beforeCount: filteredProducts.length });
      
      if (thresholdOperator === '<') {
        filteredProducts = filteredProducts.filter(p => {
          const passes = p.numericPrice < priceThreshold;
          // console.log(`Product ${p.title}: price ${p.numericPrice} < ${priceThreshold} = ${passes}`);
          return passes;
        });
        toolLog(null, "applyPriceFiltering", "Filtered to products under threshold", { priceThreshold, count: filteredProducts.length });
      } else if (thresholdOperator === '>') {
        filteredProducts = filteredProducts.filter(p => {
          const passes = p.numericPrice > priceThreshold;
          // console.log(`Product ${p.title}: price ${p.numericPrice} > ${priceThreshold} = ${passes}`);
          return passes;
        });
        // console.log(`Filtered to products over $${priceThreshold}: ${filteredProducts.length} products`);
      }
    }
    
    // Check for specific count requests (top 3, 5 cheapest, etc.)
    const countMatch = userMessage.match(/\b(top|first|show|list)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(highest|lowest|cheapest|most expensive|least expensive|least)\b|\b(the|top)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(highest|lowest|cheapest|most expensive|least expensive|least)\b/i);
    let requestedCount = null;
    
    if (countMatch) {
      const countStr = countMatch[2] || countMatch[3] || countMatch[6];
      const numberMap = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
      requestedCount = numberMap[countStr.toLowerCase()] || parseInt(countStr);
      toolLog(null, "applyPriceFiltering", "Detected count request", { requestedCount });
    }
    
    // Sort by price based on user request
    if (/\bleast\s+expensive\b/i.test(userMessage)) {
      sortType = 'least_expensive';
      filteredProducts.sort((a, b) => a.numericPrice - b.numericPrice);
    } else if (/\bmost\s+expensive\b/i.test(userMessage) || /\bhighest\b/i.test(userMessage)) {
      sortType = 'most_expensive';
      filteredProducts.sort((a, b) => b.numericPrice - a.numericPrice);
    } else if (/\b(lowest|cheapest|cheap|least)\b/i.test(userMessage)) {
      sortType = 'least_expensive';
      filteredProducts.sort((a, b) => a.numericPrice - b.numericPrice);
    } else if (/\bexpensive\b/i.test(userMessage)) {
      sortType = 'most_expensive';
      filteredProducts.sort((a, b) => b.numericPrice - a.numericPrice);
    } else if (priceThreshold !== null) {
      // Default to ascending sort for "under" queries, descending for "over" queries
      if (thresholdOperator === '<') {
        sortType = 'least_expensive';
        filteredProducts.sort((a, b) => a.numericPrice - b.numericPrice);
      } else if (thresholdOperator === '>') {
        sortType = 'most_expensive';
        filteredProducts.sort((a, b) => b.numericPrice - a.numericPrice);
      }
    }
    
    // Apply count limit if specified, otherwise use default max (but only if no price filtering was applied)
    let limitToApply = requestedCount;
    if (!limitToApply && priceThreshold === null) {
      // Only apply default limit if no price filtering was done
      limitToApply = AppConfig.tools.maxProductsToDisplay;
    }
    
    if (limitToApply && limitToApply > 0) {
      filteredProducts = filteredProducts.slice(0, limitToApply);
    }
    
    // Remove the temporary numericPrice property
    const finalProducts = filteredProducts.map(({ numericPrice, ...product }) => product);
    
    // Add sort metadata to each product for header display
    if (sortType) {
      finalProducts.forEach(product => {
        product._sortType = sortType;
      });
    }
    
    toolLog(null, "applyPriceFiltering", "Products after filtering and sorting", { count: finalProducts.length, sortType });
    return finalProducts;
  };

  /**
   * Processes product search results
   * @param {Object} toolUseResponse - The response from the tool
   * @param {Object} shopContext - Shop context with currency info
   * @returns {Array} Processed product data
   */
  const processProductSearchResult = (toolUseResponse, shopContext) => {
    try {
      toolLog(null, "processProductSearchResult", "Processing product search result");
      
      let products = [];
      if (toolUseResponse.content && toolUseResponse.content.length > 0) {
        const content = toolUseResponse.content[0].text;
        toolLog(null, "processProductSearchResult", "Raw content from tool response", { contentLength: content?.length });
        
        try {
          let responseData = (typeof content === 'object') ? content : JSON.parse(content);
          toolLog(null, "processProductSearchResult", "Parsed response data", { productCount: responseData.products?.length });
          
          if (responseData?.products && Array.isArray(responseData.products)) {
            toolLog(null, "processProductSearchResult", "Found products in response", { count: responseData.products.length });
            // Don't limit here - let price filtering handle sorting first, then limit
            products = responseData.products
              .map(product => formatProductData(product, shopContext));
            toolLog(null, "processProductSearchResult", "Formatted products to display", { count: products.length });
          } else {
            toolLog(null, "processProductSearchResult", "No products array found in response data", { keys: Object.keys(responseData || {}) });
          }
        } catch (e) {
          toolLog(null, "processProductSearchResult", "Error parsing product data", { error: e?.message, contentLength: content?.length });
        }
      } else {
        toolLog(null, "processProductSearchResult", "No content found in toolUseResponse");
      }
      
      toolLog(null, "processProductSearchResult", "Returning products", { count: products.length });
      return products;
    } catch (error) {
      toolLog(null, "processProductSearchResult", "Error processing product search results", { error: error?.message });
      return [];
    }
  };

  function processProductDetailsResult(toolOutput) {
    try {
      const textBlock = toolOutput.content.find(c => c.type === "text")?.text;
      if (!textBlock) return null;

      const parsed = JSON.parse(textBlock);
      return parsed.product;
    } catch (e) {
      toolLog(null, "processProductDetailsResult", "Error parsing product details", { error: e?.message });
      return null;
    }
  }

  const processCartResult = (toolUseResponse) => {
    try {
      // 1. Get the raw JSON string from the response
      const rawText = toolUseResponse.content?.[0]?.text;
      if (!rawText) {
        toolLog(null, "processCartResult", "No text content found in toolUseResponse for cart processing");
        return null;
      }
      const parsedResponse = JSON.parse(rawText);

      // 2. The actual cart data is in the 'cart' property of the parsed object
      const cartData = parsedResponse.cart;

      if (!cartData) {
        toolLog(null, "processCartResult", "No 'cart' object found in the parsed response");
        return null;
      }

      // 3. Map the complex 'lines' array to a simpler, more useful 'items' array
      const items = cartData.lines.map(line => ({
        id: line.id,
        quantity: line.quantity,
        title: line.merchandise.product.title,
        variant_title: line.merchandise.title,
        price: line.cost.total_amount.amount,
        variant_id: line.merchandise.id
      }));

      // 4. Return the correctly structured object by accessing the nested properties
      return {
        id: cartData.id,
        items: items,
        total_price: cartData.cost.total_amount.amount,
        subtotal_price: cartData.cost.subtotal_amount?.amount || cartData.cost.total_amount.amount,
        total_tax: cartData.cost.total_tax_amount?.amount || '0',
        currency: cartData.cost.total_amount.currency,
        checkout_url: cartData.checkout_url
      };
    } catch (err) {
      toolLog(null, "processCartResult", "Error processing cart result", { error: err?.message });
      return null;
    }
  };

  const processUpdateCartResult = (toolUseResponse) => {
    try {
      const raw = toolUseResponse.content?.[0]?.text;
      const result = typeof raw === 'object' ? raw : JSON.parse(raw);
      toolLog(null, "processUpdateCartResult", "Update cart result", { hasResult: !!result });

      if (result.cart) {
        // Process the cart data similar to processCartResult
        const cartData = result.cart;
        const items = cartData.lines ? cartData.lines.map(line => ({
          id: line.id,
          quantity: line.quantity,
          title: line.merchandise.product.title,
          variant_title: line.merchandise.title,
          price: line.cost.total_amount.amount,
          variant_id: line.merchandise.id
        })) : [];

        return {
          cart: {
            id: cartData.id,
            items: items,
            total_price: cartData.cost?.total_amount?.amount,
            subtotal_price: cartData.cost?.subtotal_amount?.amount || cartData.cost?.total_amount?.amount,
            total_tax: cartData.cost?.total_tax_amount?.amount || '0',
            currency: cartData.cost?.total_amount?.currency,
            checkout_url: cartData.checkout_url
          }
        };
      }

      return { cart: null };
    } catch (err) {
      toolLog(null, "processUpdateCartResult", "Error processing update cart result", { error: err?.message });
      return null;
    }
  };

  const processAddToCartResult = (toolUseResponse) => {
    try {
      const raw = toolUseResponse.content?.[0]?.text;
      const result = typeof raw === 'object' ? raw : JSON.parse(raw);
      toolLog(null, "processAddToCartResult", "Add to cart result", { hasResult: !!result });

      if (result.cart) {
        const cartData = result.cart;
        const items = cartData.lines ? cartData.lines.map(line => ({
          id: line.id,
          quantity: line.quantity,
          title: line.merchandise.product.title,
          variant_title: line.merchandise.title,
          price: line.cost.total_amount.amount,
          variant_id: line.merchandise.id
        })) : [];

        return {
          cart: {
            id: cartData.id,
            items: items,
            total_price: cartData.cost?.total_amount?.amount,
            subtotal_price: cartData.cost?.subtotal_amount?.amount || cartData.cost?.total_amount?.amount,
            total_tax: cartData.cost?.total_tax_amount?.amount || '0',
            currency: cartData.cost?.total_amount?.currency,
            checkout_url: cartData.checkout_url
          }
        };
      }

      return { cart: null };
    } catch (err) {
      toolLog(null, "processAddToCartResult", "Error processing add to cart result", { error: err?.message });
      return null;
    }
  };

  const processSearchPoliciesResult = (toolUseResponse) => {
    try {
      const rawText = toolUseResponse.content?.[0]?.text;
      if (!rawText) return null;
      
      const parsedResponse = JSON.parse(rawText);
      toolLog(null, "processPolicySearchResult", "FAQ search result", { hasResult: !!parsedResponse });
      
      // Return the parsed response so it can be used directly
      return parsedResponse;
    } catch (err) {
      toolLog(null, "processPolicySearchResult", "Error processing policy search result", { error: err?.message });
      return null;
    }
  };


  /**
   * Formats a product data object
   * @param {Object} product - Raw product data
   * @param {Object} shopContext - Shop context with currency info
   * @returns {Object} Formatted product data
   */
  /**
   * Shopify / UCP catalog money: `{ amount, currency }` uses minor units (cents) for USD.
   * Legacy catalog used bare numbers or `price_range.currency` + numeric `min`.
   */
  const normalizeMoneyValue = (value, fallbackCurrency = 'USD') => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'object' && value !== null && value.amount != null) {
      const amt = Number(value.amount);
      if (Number.isNaN(amt)) return null;
      return { amount: amt, currency: value.currency || fallbackCurrency, minorUnits: true };
    }
    const curr = fallbackCurrency;
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return { amount: value, currency: curr, minorUnits: null };
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const m = trimmed.match(/^([A-Z]{3})\s+(.+)$/);
      if (m) {
        const num = parseFloat(m[2].replace(/,/g, ''));
        if (!Number.isNaN(num)) return { amount: num, currency: m[1], minorUnits: null };
      }
      const num = parseFloat(trimmed.replace(/[^0-9.]/g, ''));
      if (!Number.isNaN(num)) return { amount: num, currency: curr, minorUnits: null };
    }
    return null;
  };

  /** Display amount as `USD 7,100.00` (Shopify Money uses minor units; legacy ints >= 1000 treated as cents). */
  const toDisplayPrice = (amount, currency = 'USD', minorUnits = null) => {
    if (amount === undefined || amount === null) return null;
    const num = typeof amount === 'string' ? parseFloat(String(amount).replace(/[^0-9.-]/g, '')) : Number(amount);
    if (Number.isNaN(num)) return `${currency} ${String(amount)}`;
    const useMinor =
      minorUnits === true ||
      (minorUnits !== false && Number.isInteger(num) && Math.abs(num) >= 1000);
    const dollarsNum = useMinor ? num / 100 : Number(num);
    if (Number.isNaN(dollarsNum)) return `${currency} ${String(amount)}`;
    const formatted = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(dollarsNum);
    return `${currency} ${formatted}`;
  };

  const firstCatalogImageUrl = (product) => {
    if (product.image_url) return product.image_url;
    const fromMedia = (media) => {
      if (!Array.isArray(media)) return '';
      const item = media.find((m) => m && (m.type === 'image' || !m.type) && (m.url || m.src));
      return item?.url || item?.src || '';
    };
    let url = fromMedia(product.media);
    if (url) return url;
    if (Array.isArray(product.variants)) {
      for (const v of product.variants) {
        url = fromMedia(v.media);
        if (url) return url;
      }
    }
    return '';
  };

  const formatProductData = (product, shopContext) => {
    toolLog(null, "formatProductData", "Formatting product data", { title: product?.title, currency: shopContext?.currency });
    
    let price = 'Price not available';
    const currency = shopContext?.currency || 'USD';
    
    if (product.price_range) {
      const minM = normalizeMoneyValue(product.price_range.min, currency);
      const maxM = normalizeMoneyValue(product.price_range.max, currency);
      toolLog(null, "formatProductData", "Using price_range", { min: product.price_range.min, max: product.price_range.max });
      if (minM && maxM && minM.amount !== maxM.amount) {
        const lo = toDisplayPrice(minM.amount, minM.currency, minM.minorUnits);
        price = lo ? `from ${lo}` : 'Price not available';
      } else if (minM) {
        price = toDisplayPrice(minM.amount, minM.currency, minM.minorUnits) || 'Price not available';
      }
    } else if (product.variants && product.variants.length > 0) {
      const variant = product.variants[0];
      const curr = variant.currency || currency;
      const priceValue = variant.price;
      toolLog(null, "formatProductData", "Using variant", { currency: curr, rawPrice: priceValue });
      if (typeof priceValue === 'string' && /^[A-Z]{3}\s/.test(priceValue)) {
        const numPart = parseFloat(priceValue.replace(/^[A-Z]{3}\s*/, ''));
        price = Number.isNaN(numPart) ? priceValue : toDisplayPrice(numPart, priceValue.slice(0, 3), false) || priceValue;
      } else {
        const vm = normalizeMoneyValue(priceValue, curr);
        price = vm
          ? toDisplayPrice(vm.amount, vm.currency, vm.minorUnits) || `${curr} ${priceValue}`
          : toDisplayPrice(priceValue, curr, false) || `${curr} ${priceValue}`;
      }
    }
    
    toolLog(null, "formatProductData", "Final formatted price", { price });
    
    // Extract variant ID for add to cart functionality
    const variantId = product.variants && product.variants.length > 0 
      ? product.variants[0].id 
      : null;

    const description =
      typeof product.description === 'object' && product.description !== null && product.description.html != null
        ? String(product.description.html)
        : (product.description || '');

    const imageUrl = firstCatalogImageUrl(product);

    const url =
      product.url || product.online_store_url || product.onlineStoreUrl || product.product_url || '';
    const handleRaw =
      product.handle ||
      product.product_handle ||
      product.slug ||
      (typeof url === 'string' ? (url.match(/\/products\/([a-z0-9][a-z0-9\-]*)/i) || [])[1] : '') ||
      '';
    const handle = handleRaw ? String(handleRaw).toLowerCase().trim() : '';
    
    return {
      id: product.id || product.product_id || `product-${Math.random().toString(36).substring(7)}`,
      title: product.title || 'Product',
      price: price,
      image_url: imageUrl,
      description,
      url,
      handle,
      variant_id: variantId
    };
  };

  /**
   * Adds a tool result to the conversation history
   * @param {Array} conversationHistory - The conversation history
   * @param {string} toolUseId - The ID of the tool use request
   * @param {string} content - The content of the tool result
   * @param {string} conversationId - The conversation ID
   */

  const addToolResultToHistory = async (conversationHistory, toolUseId, toolName, content, conversationId) => {
    const toolResultMessage = {
      role: 'user',
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        name: toolName,
        content: content
      }]
    };

    conversationHistory.push(toolResultMessage);

    if (conversationId) {
      try {
        await saveMessage(conversationId, 'user', JSON.stringify([{
          type: "tool_result",
          tool_use_id: toolUseId,
          name: toolName,
          content: content
        }]));
      } catch (error) {
        toolLog(conversationId, "addToolResultToHistory", "Error saving tool result to database", { error: error?.message });
      }
    }
  };

  return {
    handleToolError,
    handleToolSuccess,
    applyPriceFiltering,
    processProductSearchResult,
    processProductDetailsResult,
    processCartResult,
    processUpdateCartResult,
    processAddToCartResult,
    processSearchPoliciesResult,
    addToolResultToHistory
  };
}

export default {
  createToolService
};
