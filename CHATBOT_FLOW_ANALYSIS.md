# Shopify AI Chat Agent - Complete Flow Analysis

## 🔄 System Architecture Overview

The Shopify AI Chat Agent is a sophisticated multi-layered system that enables natural language shopping experiences through AI-powered conversations. Here's how it works:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │     Backend      │    │   External      │
│   (Liquid +     │◄──►│   (Remix App)    │◄──►│   Services      │
│   JavaScript)   │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                        │                        │
        │                        │                        │
    ┌───▼───┐              ┌─────▼─────┐          ┌───────▼───────┐
    │ Chat  │              │    MCP    │          │ External LLM  │
    │ UI    │              │  Client   │          │ (grigo-llm)   │
    └───────┘              └───────────┘          └───────────────┘
                                   │
                           ┌───────▼───────┐
                           │   Shopify     │
                           │   APIs        │
                           │ (Storefront + │
                           │  Customer)    │
                           └───────────────┘
```

## 🚀 Complete Chatbot Flow

### 1. **Initialization Phase**

#### Frontend Initialization
```javascript
// When chat bubble is clicked
ShopAIChat.UI.toggleChatWindow()
├── Creates cart via Storefront API
├── Stores cart ID in sessionStorage
├── Loads conversation history (if exists)
└── Shows welcome message (if new conversation)
```

#### Backend Services Setup
```javascript
// Chat route initialization
handleChatRequest()
├── Initialize OpenAI service
├── Initialize Tool service  
├── Create MCP client
├── Connect to Storefront MCP server
├── Get shop context (country, language, currency)
└── Format available tools for LLM
```

### 2. **Message Processing Flow**

#### User Input Processing
```
User types message → Frontend captures input → Sends to backend via SSE
                                                      │
                                                      ▼
                                            Backend receives message
                                                      │
                                                      ▼
                                            Save message to database
                                                      │
                                                      ▼
                                            Get conversation history
                                                      │
                                                      ▼
                                            Process with LLM
```

#### LLM Decision Making
```javascript
// OpenAI Service Processing
streamConversation()
├── Format messages for OpenAI API
├── Include available MCP tools
├── Send to External LLM (grigo-llm.com)
├── Receive response with tool calls or text
└── Return structured response
```

### 3. **Tool Execution Flow**

#### Available MCP Tools
1. **`search_catalog`** - Product discovery and search
2. **`get_product_details`** - Detailed product information  
3. **`add_to_cart`** - Add items to shopping cart
4. **`update_cart`** - Modify cart contents
5. **`get_cart`** - Retrieve current cart state
6. **`search_shop_policies_and_faqs`** - Store policy lookup

#### Tool Call Processing
```javascript
// When LLM decides to use tools
if (hasToolCalls) {
    for (const toolCall of openaiResponse.tool_calls) {
        ├── Send tool_start event to frontend
        ├── Prepare tool arguments with context
        ├── Add cart_id for cart-related tools
        ├── Call MCP client with tool name and args
        ├── Handle tool response
        ├── Send tool_complete event to frontend
        └── Process results for user display
    }
}
```

### 4. **MCP Client Architecture**

#### Dual MCP Endpoints
```javascript
class MCPClient {
    // Two separate MCP connections
    storefrontMcpEndpoint: `${hostUrl}/api/mcp`        // Public tools
    customerMcpEndpoint: `${customerAccountUrl}/customer/api/mcp`  // Auth tools
    
    // Tool routing
    callTool(toolName, toolArgs) {
        if (customerTools.includes(toolName)) {
            return callCustomerTool()  // Requires authentication
        } else {
            return callStorefrontTool()  // Public access
        }
    }
}
```

#### Authentication Flow
```javascript
// When customer tools require auth
callCustomerTool() {
    ├── Check for existing access token
    ├── If no token → Generate OAuth URL
    ├── Return auth_required response
    ├── Frontend opens popup for authentication
    ├── Poll for token availability
    └── Retry tool call with token
}
```

### 5. **Real-time Streaming Architecture**

#### Server-Sent Events (SSE)
```javascript
// Backend streaming
createSseStream(async (stream) => {
    stream.sendMessage({ type: 'id', conversation_id })
    stream.sendMessage({ type: 'tool_start', tool_name })
    stream.sendMessage({ type: 'chunk', chunk: text })
    stream.sendMessage({ type: 'tool_complete', tool_name })
    stream.sendMessage({ type: 'message_complete' })
    stream.sendMessage({ type: 'end_turn' })
})
```

#### Frontend Event Handling
```javascript
// Real-time event processing
handleStreamEvent(data) {
    switch (data.type) {
        case 'chunk': updateMessageContent()
        case 'tool_start': showToolIndicator()
        case 'product_results': displayProductCards()
        case 'cart_updated': syncStorefrontCart()
        case 'auth_required': openAuthPopup()
    }
}
```

### 6. **Cart Management Flow**

#### Cart Synchronization
```javascript
// Cart lifecycle management
1. Chat opens → Create Shopify cart → Store cart ID
2. User adds items → MCP updates cart → Return cart details
3. Frontend receives cart_updated event → Sync with storefront
4. User requests checkout → Detect intent → Redirect to checkout URL
```

#### Cart Operations
```javascript
// Add to cart flow
add_to_cart tool call
├── Extract product variant ID
├── Use existing cart ID or create new
├── Call Shopify Storefront API
├── Return updated cart details
└── Frontend syncs cart state
```

### 7. **Database Schema & Persistence**

#### Core Data Models
```sql
-- Conversation tracking
Conversation (id, createdAt, updatedAt)
Message (id, conversationId, role, content, createdAt)

-- Authentication
CustomerToken (id, conversationId, accessToken, refreshToken, expiresAt)
CodeVerifier (id, state, verifier, createdAt, expiresAt)

-- Shop context
CustomerAccountUrl (id, conversationId, url, createdAt, updatedAt)
```

#### Message Storage
```javascript
// Message persistence
saveMessage(conversationId, role, content)
├── Store in SQLite database
├── Support both JSON and text content
├── Index by conversation ID
└── Enable history retrieval
```

### 8. **AI Prompt Engineering**

#### System Prompts
```javascript
// Prompt types
standardAssistant: "Professional shopping assistant"
enthusiasticAssistant: "Energetic and bubbly assistant"  
responseGenerator: "Natural response formatting"
```

#### Anti-Hallucination Rules
- **NEVER** invent products, prices, or information
- **ALWAYS** use tools before providing product data
- **MANDATORY** search_catalog for ANY product request
- **FORBIDDEN** generic examples when no products found

### 9. **Error Handling & Fallbacks**

#### Multi-LLM Architecture
```javascript
// Primary: External LLM (grigo-llm.com)
// Fallback: Google Gemini (configured but not active)
// Error handling: Graceful degradation with user-friendly messages
```

#### Error Types
- Authentication failures → OAuth flow
- Rate limiting → Retry with backoff
- Tool failures → User-friendly error messages
- Network issues → Fallback responses

### 10. **Voice Integration**

#### Speech Recognition
```javascript
// Voice input flow
VoiceHandler.startListening()
├── Check browser support (Chrome/Chromium preferred)
├── Request microphone permissions
├── Start speech recognition
├── Convert speech to text
├── Auto-send message
└── Handle recognition errors
```

### 11. **Mobile Optimization**

#### Responsive Design
- Full-screen mobile experience
- iOS Safari viewport handling
- Touch-optimized controls
- Keyboard management
- Scroll behavior optimization

### 12. **Performance Features**

#### Optimization Strategies
- **Lazy Loading**: Product images and content
- **Caching**: Conversation history and cart state
- **Streaming**: Real-time response delivery
- **Compression**: Asset optimization
- **CDN**: Static asset delivery

## 🔧 Technical Implementation Details

### Frontend Technologies
- **Liquid Templates**: Shopify theme integration
- **Vanilla JavaScript**: No framework dependencies
- **CSS Grid/Flexbox**: Responsive layouts
- **Web Speech API**: Voice recognition
- **SessionStorage**: Client-side persistence

### Backend Technologies
- **Remix Framework**: Full-stack React framework
- **Prisma ORM**: Database management
- **SQLite**: Local database storage
- **Server-Sent Events**: Real-time streaming
- **JSON-RPC**: MCP communication protocol

### External Integrations
- **External LLM API**: grigo-llm.com (GPT-5-nano)
- **Shopify Storefront API**: Product and cart operations
- **Shopify Customer Account API**: Authenticated operations
- **OAuth 2.0 + PKCE**: Secure authentication

## 🎯 Key Features

### Natural Language Processing
- Intent recognition for shopping actions
- Context-aware responses
- Multi-turn conversation support
- Tool selection based on user intent

### E-commerce Integration
- Real-time product search
- Cart management
- Checkout flow integration
- Policy and FAQ lookup

### User Experience
- Instant responses via streaming
- Visual product displays
- Voice input support
- Mobile-first design
- Conversation persistence

## 🚦 Flow Summary

1. **User opens chat** → Initialize services and load history
2. **User sends message** → Save to DB and process with LLM
3. **LLM analyzes intent** → Decide on tools or direct response
4. **Tools execute** → Call Shopify APIs via MCP
5. **Results stream back** → Real-time updates to user
6. **Cart operations** → Sync with Shopify storefront
7. **Conversation continues** → Maintain context and state

This architecture ensures a seamless, intelligent shopping experience that feels natural while leveraging the full power of Shopify's e-commerce platform.