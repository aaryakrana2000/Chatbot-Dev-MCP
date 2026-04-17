# Chatbot settings plan (app backend)

Settings are grouped so you can manage the chatbot from the admin frontend. Forms are implemented in **app backend** (`/app/settings`); **no database persistence** is in place yet—form state only.

---

## 1. Identity & copy

| Field | Type | Description |
|-------|------|--------------|
| Bot name | text | Display name of the assistant (e.g. AVA, Zara). |
| Welcome message | text (multiline) | First message when chat opens with no conversation. |
| Chat window title | text | Title shown in the chat header (e.g. "Store Assistant"). |
| Input placeholder | text | Placeholder for the message input (e.g. "Type your message..."). |

---

## 2. Personality

| Field | Type | Description |
|-------|------|--------------|
| System prompt preset | select | `standardAssistant` (AVA) or `enthusiasticAssistant` (Zara). |
| Custom system prompt | textarea | Optional override; if set, replaces the preset for the main assistant. |

---

## 3. Suggestive questions

| Field | Type | Description |
|-------|------|--------------|
| Question 1–4 | text | Quick-reply buttons when there is no conversation. |
| Max questions to show | select (1–4) | How many of the four to display. |

---

## 4. API & model

| Field | Type | Description |
|-------|------|--------------|
| Tool prompt type | select | Main assistant preset: standardAssistant, enthusiasticAssistant. |
| Response generator prompt | select | Prompt used for response generation (e.g. responseGenerator). |
| Default model | text | Model identifier (e.g. gpt-5.2-2025-12-11). |
| Max tokens | number | Maximum tokens per response. |
| Temperature | number (0–2) | Sampling temperature. |
| Rate limit retries | number | Retries on 429. |
| Rate limit delay (ms) | number | Delay between retries. |

---

## 5. Tools

| Field | Type | Description |
|-------|------|--------------|
| Max products to display | number | Cap for product grid (e.g. 15). |
| Enable product search | checkbox | search_catalog. |
| Enable cart | checkbox | get_cart, update_cart. |
| Enable policies & FAQ | checkbox | search_shop_policies_and_faqs. |
| Enable virtual try-on | checkbox | Try-on feature on product cards. |
| Enable image generation | checkbox | Try-on image generation in chat. |

---

## 6. Error messages

| Field | Type | Description |
|-------|------|--------------|
| API key / config error | text (multiline) | Shown when API key or config fails. |
| Rate limit error | text (multiline) | Shown on rate limit (429). |
| Generic error | text (multiline) | Fallback when no specific message applies. |
| Missing message error | text | When user sends empty message. |

---

## 7. Try-on

| Field | Type | Description |
|-------|------|--------------|
| Try-on provider | select | openai \| gemini. |
| Try-on image prompt | textarea | Prompt sent for virtual try-on image generation. |

---

## 8. Behaviour

| Field | Type | Description |
|-------|------|--------------|
| Ask for gender on start | checkbox | Whether to ask men's/women's at conversation start. |
| Default gender | select | None \| Men's \| Women's when not asking. |
| Max response length | select | Short \| Medium \| Long (guidance for response length). |

---

## 9. Logging

| Field | Type | Description |
|-------|------|--------------|
| Enable conversation logging | checkbox | Log conversations to files. |
| Log level | select | error \| info \| debug. |

---

## Implementation notes

- **Forms only**: All of the above are implemented as forms in `app/routes/app.settings.jsx` with local React state and default values. No DB read/write.
- **Save**: "Save settings" shows a success toast; persistence can be wired later (e.g. to `api.chat-config`, new settings API, or env/config file).
- **Theme vs app**: Storefront appearance (bubble color, position, etc.) is limited by the theme extension schema (max 6 settings). Identity copy (welcome, title, placeholder) and suggestive questions can be synced from app to theme later via existing or new sync APIs.
