# Project Understanding Guide

## 🎯 What This Project Does

This is a **Shopify AI Chat Agent** - a smart shopping assistant that customers can chat with on any Shopify store. Customers can ask questions like "show me winter boots" or "add this to my cart" and the AI will help them shop naturally.

## 🏗️ Project Structure

```
shop-chat-agent/
├── app/                          # Backend (Remix app)
│   ├── routes/
│   │   ├── chat.jsx             # Main chat API endpoint
│   │   ├── auth.*.jsx           # Customer authentication
│   │   └── cart.create.jsx      # Cart creation
│   ├── services/
│   │   ├── config.server.js     # App configuration
│   │   ├── openai.server.js     # External LLM integration
│   │   ├── gemini.server.js     # Google Gemini fallback
│   │   ├── streaming.server.js  # Real-time streaming
│   │   └── tool.server.js       # Tool result handling
│   ├── prompts/
│   │   └── prompts.json         # AI assistant personalities
│   ├── mcp-client.js            # Shopify MCP integration
│   ├── db.server.js             # Database operations
│   └── shopify.server.js        # Shopify app setup
├── extensions/
│   └── chat-bubble/             # Frontend chat widget
│       ├── assets/
│       │   ├── chat.css         # Widget styling
│       │   ├── chat.js          # Chat functionality
│       │   └── voice.js         # Voice input
│       ├── blocks/
│       │   └── chat-interface.liquid  # Shopify theme integration
│       └── locales/
│           └── en.default.json  # Text translations
├── prisma/
│   ├── schema.prisma            # Database structure
│   └── migrations/              # Database updates
└── package.json                 # Dependencies & scripts
```

## 🔄 How It Works (Code Flow)

### 1. **Customer Interaction**
```
Customer types: "Show me winter boots"
↓
Chat widget (chat.js) sends POST to /chat
↓
Backend receives request in chat.jsx
```

### 2. **Request Processing**
```javascript
// chat.jsx - Main entry point
export async function action({ request }) {
  const { message, conversation_id, cart_id } = await request.json();
  
  // Create streaming response
  const responseStream = createSseStream(async (stream) => {
    await handleChatSession({ userMessage, conversationId, cartId, stream });
  });
}
```

### 3. **Service Initialization**
```javascript
// Initialize all required services
openaiService = createOpenAIService();        // External LLM
toolService = createToolService();            // Tool handling
mcpClient = new MCPClient(shopDomain, conversationId); // Shopify connection
```

### 4. **MCP Connection**
```javascript
// Connect to Shopify's Model Context Protocol
await mcpClient.connectToStorefrontServer();
const availableTools = formatToolsForOpenAI(mcpClient.tools);

// Available tools:
// - search_catalog
// - get_product_details  
// - add_to_cart
// - update_cart
// - get_cart
// - search_shop_policies_and_faqs
```

### 5. **AI Decision Making**
```javascript
// Send to external LLM (grigo-llm.com)
const openaiResponse = await openaiService.streamConversation({
  messages: conversationHistory,
  tools: availableTools
});

// LLM decides: Text response OR Tool calls
if (hasToolCalls) {
  // Execute Shopify tools
} else {
  // Stream text response directly
}
```

### 6. **Tool Execution**
```javascript
// For each tool the AI wants to use
for (const toolCall of openaiResponse.tool_calls) {
  // Add shop context (country, language, currency)
  toolArguments.context = `country:${shopContext.country}...`;
  
  // Execute via MCP → Shopify APIs
  const toolResponse = await mcpClient.callTool(toolCall.name, toolArguments);
  
  // Handle success/error
  await toolService.handleToolSuccess(toolResponse, ...);
}
```

### 7. **Natural Response Generation**
```javascript
// Send tool results back to LLM for natural response
const finalMessages = [
  ...conversationHistory,
  { role: 'user', content: 'Provide natural response for: ' + toolResults }
];

await openaiService.streamConversation({
  messages: finalMessages,
  tools: [] // No tools this time, just natural response
});
```

### 8. **Stream to Customer**
```javascript
// Real-time streaming to chat widget
stream.sendMessage({ type: 'chunk', chunk: text });
stream.sendMessage({ type: 'product_results', products: [...] });
stream.sendMessage({ type: 'message_complete' });
```

## 🧩 Key Components Explained

### **MCP Client (`mcp-client.js`)**
- Connects to Shopify's APIs via Model Context Protocol
- Handles both Storefront API (products, cart) and Customer API (orders, auth)
- Manages OAuth authentication for customer-specific actions

### **OpenAI Service (`openai.server.js`)**
- Integrates with external LLM API (grigo-llm.com)
- Handles streaming responses
- Manages tool calling and conversation flow

### **Tool Service (`tool.server.js`)**
- Processes tool execution results
- Formats product data for display
- Handles errors and authentication prompts

### **Chat Widget (`chat.js`)**
- Frontend JavaScript for the chat interface
- Handles user input, voice recognition, product display
- Manages real-time streaming from backend

### **Database (`db.server.js`)**
- Stores conversation history
- Manages customer authentication tokens
- Handles cart persistence

## 📊 Data Flow Example

```
1. Customer: "Show me winter boots"
   ↓
2. chat.js → POST /chat
   ↓
3. chat.jsx → Initialize services
   ↓
4. Connect to Shopify MCP
   ↓
5. Send to External LLM:
   {
     messages: [...history],
     tools: [search_catalog, add_to_cart, ...]
   }
   ↓
6. LLM Response:
   {
     tool_calls: [{
       name: "search_catalog",
       input: { query: "winter boots" }
     }]
   }
   ↓
7. Execute: mcpClient.callTool("search_catalog", {...})
   ↓
8. Shopify returns: [boot1, boot2, boot3...]
   ↓
9. Send back to LLM: "Here are the boots found: [...]. Respond naturally."
   ↓
10. LLM: "I found 3 great winter boots for you! Here are your options..."
    ↓
11. Stream to customer: Text + Product cards
```

## 🔧 Configuration Files

### **Environment Variables**
```bash
SHOPIFY_API_KEY=your_api_key
SHOPIFY_API_SECRET=your_api_secret
SCOPES=customer_read_customers,customer_read_orders,unauthenticated_read_product_listings
DATABASE_URL=file:./dev.sqlite
```

### **App Configuration (`shopify.app.toml`)**
```toml
client_id = "your_client_id"
name = "shop-chat-agent"
application_url = "https://your-app.com"
embedded = true
```

### **LLM Configuration (`config.server.js`)**
```javascript
export const AppConfig = {
  api: {
    defaultModel: 'gpt-5-nano-2025-08-07',
    maxTokens: 1000,
    temperature: 0.7,
  }
};
```

## 🎨 Frontend Integration

### **Theme Extension**
The chat widget integrates into Shopify themes via:
- `chat-interface.liquid` - Liquid template
- `chat.css` - Responsive styling
- `chat.js` - Interactive functionality

### **Mobile Optimization**
- Full-screen mobile experience
- Touch-friendly interactions
- Voice input support
- iOS Safari compatibility

## 🔐 Security & Authentication

### **Customer Authentication**
- OAuth 2.0 with PKCE flow
- Secure token storage and refresh
- Customer-specific order access

### **Data Protection**
- Conversation encryption
- Input sanitization
- CORS configuration
- Secure API communication

## 🚀 Development Workflow

### **Start Development**
```bash
npm install          # Install dependencies
npm run setup        # Initialize database
npm run dev          # Start development server
```

### **Key Development Files**
- `chat.jsx` - Main chat logic
- `prompts.json` - AI personality
- `chat.js` - Frontend interactions
- `mcp-client.js` - Shopify integration

### **Testing**
- Test chat endpoint: `POST /chat`
- Check MCP tools in browser console
- Verify streaming responses
- Test mobile responsiveness

This architecture creates a seamless shopping experience where customers chat naturally while the AI handles complex e-commerce operations behind the scenes.