export const AppConfig = {
  // API Configuration
  api: {
    defaultModel: 'gpt-5-nano-2025-08-07',
    maxTokens: 1000,
    toolPromptType: 'standardAssistant',
    responsePromptType: 'responseGenerator',
    rateLimitRetries: 3,
    rateLimitDelay: 2000,
    mode: "silent", 
    temperature: 0.7,
    generationConfig: {
      stopSequences: ["}]"],
    },
  },

  // Error Message Templates
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    authFailed: "Authentication failed with LLM API",
    apiKeyError: "Please check your API key in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from LLM"
  },

  // Tool Configuration
  tools: {
    productSearchName: "search_catalog",
    getProductDetailsName: "get_product_details",
    getCartName: "get_cart",
    updateCartName: "update_cart",
    addToCartName: "add_to_cart",
    productDescriptionName: "product_description",
    searchPoliciesName: "search_shop_policies_and_faqs",
    maxProductsToDisplay: 15
  },

  // Chat UI Configuration
  chat: {
    // Suggestive questions to show when there's no conversation
    // These can be customized from the backend
    suggestiveQuestions: [
      "Hello, how are you?",
      "What is this store about?",
      "Hey, please show me some products",
      "What are your best sellers?"
    ],
    maxSuggestiveQuestions: 4
  }
};

console.log('Using toolPromptType:', AppConfig.api.toolPromptType);
console.log('Using responsePromptType:', AppConfig.api.responsePromptType);

export default AppConfig;