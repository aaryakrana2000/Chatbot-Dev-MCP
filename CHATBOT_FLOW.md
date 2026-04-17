# Shopify AI Chatbot Flow Diagram

## Complete System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           SHOPIFY AI CHATBOT SYSTEM                            │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   🛒 Customer   │
│   Chat Widget   │
│                 │
│ User: "show me  │
│ winter boots"   │
└─────────┬───────┘
          │ POST /chat
          │ { message: "show me winter boots", conversation_id: "123" }
          ▼
┌─────────────────┐
│  📡 chat.jsx    │
│  Entry Point    │
│                 │
│ • Parse request │
│ • Validate msg  │
│ • Create stream │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ 🔧 Initialize   │
│    Services     │
│                 │
│ • OpenAI Service│
│ • Tool Service  │
│ • MCP Client    │
│ • Shop Context  │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ 🔌 MCP Client   │
│ Connect to APIs │
│                 │
│ Storefront:     │
│ shop.com/api/mcp│
│                 │
│ Customer:       │
│ account.com/    │
│ customer/api/mcp│
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ 🛠️ Tool Discovery│
│                 │
│ Available Tools:│
│ • search_shop_  │
│   catalog       │
│ • add_to_cart   │
│ • get_cart      │
│ • update_cart   │
│ • get_product_  │
│   details       │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ 💾 Save & Load  │
│   Conversation  │
│                 │
│ • Save user msg │
│ • Load history  │
│   (last 5 msgs) │
└─────────┬───────┘
          │
          ▼
┌─────────────────┐
│ 🧠 External LLM │
│ grigo-llm.com   │
│                 │
│ REQUEST:        │
│ {               │
│   model: "gpt-5-│
│   nano-2025...", │
│   messages: [   │
│     {role: "sys",│
│      content:   │
│      "You are   │
│      AVA..."},  │
│     {role: "user"│
│      content:   │
│      "show me   │
│      boots"}    │
│   ],            │
│   tools: [...]  │
│ }               │
└─────────┬───────┘
          │
          ▼
    ┌─────┴─────┐
    │ LLM DECISION │
    └─────┬─────┘
          │
    ┌─────┴─────┐
    │           │
    ▼           ▼
┌───────────┐ ┌─────────────┐
│ 💬 TEXT   │ │ 🔧 TOOL     │
│ RESPONSE  │ │ CALLS       │
│           │ │             │
│ "Hi! How  │ │ tool_calls: │
│ can I     │ │ [{          │
│ help?"    │ │   name:     │
│           │ │   "search_  │
│           │ │   shop_     │
│           │ │   catalog", │
│           │ │   input: {  │
│           │ │     query:  │
│           │ │     "boots" │
│           │ │   }         │
│           │ │ }]          │
└─────┬─────┘ └─────┬───────┘
      │             │
      │             ▼
      │       ┌─────────────┐
      │       │ 🔄 Execute  │
      │       │   Tools     │
      │       │             │
      │       │ For each    │
      │       │ tool call:  │
      │       │             │
      │       │ 1. Add shop │
      │       │    context  │
      │       │ 2. Call MCP │
      │       │ 3. Get data │
      │       │    from     │
      │       │    Shopify  │
      │       └─────┬───────┘
      │             │
      │             ▼
      │       ┌─────────────┐
      │       │ 📊 Tool     │
      │       │   Results   │
      │       │             │
      │       │ SUCCESS:    │
      │       │ • Products  │
      │       │   found     │
      │       │ • Cart data │
      │       │ • Order info│
      │       │             │
      │       │ ERROR:      │
      │       │ • Auth      │
      │       │   required  │
      │       │ • Not found │
      │       └─────┬───────┘
      │             │
      │             ▼
      │       ┌─────────────┐
      │       │ 🧠 2nd LLM  │
      │       │   Call      │
      │       │             │
      │       │ REQUEST:    │
      │       │ {           │
      │       │   messages: │
      │       │   [...      │
      │       │   history,  │
      │       │   {role:    │
      │       │   "user",   │
      │       │   content:  │
      │       │   "Here are │
      │       │   product   │
      │       │   details:  │
      │       │   {...}     │
      │       │   Provide   │
      │       │   natural   │
      │       │   response"}│
      │       │   ],        │
      │       │   tools: [] │
      │       │ }           │
      │       └─────┬───────┘
      │             │
      │             ▼
      │       ┌─────────────┐
      │       │ 💬 Natural  │
      │       │   Response  │
      │       │             │
      │       │ "I found 3  │
      │       │ great winter│
      │       │ boots for   │
      │       │ you! Here   │
      │       │ are some    │
      │       │ options..." │
      │       └─────┬───────┘
      │             │
      ▼             ▼
┌─────────────────────┐
│ 📱 Stream to User   │
│                     │
│ • Text chunks       │
│ • Product display   │
│ • Message complete  │
│ • End turn          │
└─────────────────────┘

┌─────────────────────┐
│ 💾 Save to Database │
│                     │
│ • Assistant message │
│ • Tool results      │
│ • Conversation      │
│   history           │
└─────────────────────┘
```

## Key Components Breakdown

### 1. **Entry Point** (`chat.jsx`)
- Handles POST requests to `/chat`
- Validates user input
- Creates SSE stream for real-time responses

### 2. **Service Initialization**
- **OpenAI Service**: Connects to your external LLM
- **Tool Service**: Handles tool execution results
- **MCP Client**: Connects to Shopify APIs

### 3. **MCP Tool Discovery**
```javascript
// Available Shopify tools:
- search_catalog    // Product search
- add_to_cart           // Add items to cart
- get_cart              // View cart contents
- update_cart           // Modify cart
- get_product_details   // Product info
- get_order_status      // Order tracking
```

### 4. **LLM Decision Making**
Your external LLM (`grigo-llm.com`) receives:
- System prompt (AVA shopping assistant)
- Conversation history
- Available tools
- User message

**Returns either:**
- Text response (for greetings/chat)
- Tool calls (for shopping actions)

### 5. **Tool Execution Flow**
```javascript
// If tools called:
1. Add shop context (country, language, currency)
2. Execute via MCP → Shopify APIs
3. Handle results (success/error)
4. Send results back to LLM for natural response
5. Stream final response to user
```

### 6. **Response Types**
- **Text chunks**: Streamed in real-time
- **Product results**: Displayed as cards
- **Error handling**: Auth prompts, not found messages

## Data Flow Summary

1. **User Input** → Chat widget
2. **Request Processing** → chat.jsx
3. **Tool Discovery** → MCP Client → Shopify
4. **Intent Detection** → External LLM
5. **Tool Execution** → MCP → Shopify APIs
6. **Natural Response** → 2nd LLM call
7. **Stream Output** → User interface
8. **Save History** → Database

This creates a seamless shopping experience where your LLM handles conversation flow while Shopify MCP provides e-commerce functionality.