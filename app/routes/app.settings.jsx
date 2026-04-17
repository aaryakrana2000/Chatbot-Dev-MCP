/**
 * Chatbot settings – left-side menu, human-readable forms, many dynamic options (no DB yet).
 */
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Text,
  Select,
  Checkbox,
  Button,
  Box,
  Banner,
  InlineStack,
  Divider,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

const SECTIONS = [
  { id: "look", label: "How the chat looks", icon: "💬" },
  { id: "design", label: "Chatbot design", icon: "🎨" },
  { id: "tone", label: "Tone & behaviour", icon: "✨" },
  { id: "features", label: "What the assistant can do", icon: "🛠️" },
  { id: "uploads", label: "Uploads & limits", icon: "📤" },
  { id: "window", label: "Chat window & buttons", icon: "🪟" },
  { id: "errors", label: "When something goes wrong", icon: "⚠️" },
  { id: "tryon", label: "Virtual try-on", icon: "👗" },
  { id: "theme", label: "Position & size", icon: "📍" },
  { id: "advanced", label: "Advanced", icon: "⚙️" },
];

const DEFAULT_VALUES = {
  // Look
  botName: "AVA",
  welcomeMessage: "👋 Hi there! How can I help you today?",
  chatTitle: "Store Assistant",
  inputPlaceholder: "Type your message...",
  suggestiveQuestion1: "Hello, how are you?",
  suggestiveQuestion2: "What is this store about?",
  suggestiveQuestion3: "Hey, please show me some products",
  suggestiveQuestion4: "What are your best sellers?",
  maxSuggestiveQuestions: 4,
  // Tone
  systemPromptType: "standardAssistant",
  customSystemPrompt: "",
  askGenderOnStart: true,
  defaultGender: "",
  maxResponseLength: "medium",
  // Features
  maxProductsToDisplay: 15,
  enableProductSearch: true,
  enableCart: true,
  enablePoliciesFaq: true,
  enableGetProductDetails: true,
  showPriceOnProductCards: true,
  showAddToCartOnCards: true,
  // Uploads & limits
  maxImageUploadMB: 10,
  tryOnMaxImageMB: 20,
  maxMessagesInHistory: 15,
  // Window & buttons
  showVoiceInput: true,
  showImageUploadButton: true,
  closeConfirmationTitle: "Close Chat",
  closeConfirmationMessage: "Do you want to close this chat? This will clear your conversation history.",
  // Errors
  errorApiKey: "Our chat service is temporarily misconfigured. Please contact the store owner.",
  errorRateLimit: "We're getting a lot of requests right now. Please wait a moment and try again.",
  errorGeneric: "Something went wrong on our side. Please try again in a moment.",
  errorMissingMessage: "Please type a message or attach an image.",
  errorAuthFailed: "Authentication failed. Please try again.",
  errorApiUnsupported: "This chat only supports certain types of requests. Please refresh and try again.",
  // Try-on
  enableTryOn: true,
  enableImageGeneration: true,
  tryOnProvider: "openai",
  tryOnPrompt: "Generate a realistic virtual try-on image. Preserve the person's exact face, use realistic lighting and background, composite the apparel so the product looks its best.",
  // Design (colors, sizes, typography – for storefront)
  bubbleSizePx: 60,
  bubbleColor: "#5046e4",
  bubbleIconColor: "#ffffff",
  bubbleRadiusPx: 50,
  windowBg: "#ffffff",
  windowRadiusPx: 20,
  headerBg: "#667eea",
  headerTextColor: "#ffffff",
  headerFontSizePx: 16,
  messagesBg: "#f8f9ff",
  messageUserBg: "#e5e7eb",
  messageAssistantBg: "#667eea",
  messageFontSizePx: 14,
  inputBg: "#f8f9ff",
  inputTextColor: "#1f2937",
  inputRadiusPx: 20,
  sendButtonColor: "#5046e4",
  voiceButtonColor: "#6b7280",
  questionsBg: "#f3f4f6",
  questionsTextColor: "#374151",
  productCardRadiusPx: 12,
  fontFamily: "inherit, sans-serif",
  // Position & size (for future sync to storefront)
  chatPosition: "bottom-right",
  windowWidthPercent: 50,
  windowMaxHeightPx: 650,
  // Advanced
  toolPromptType: "standardAssistant",
  responsePromptType: "responseGenerator",
  defaultModel: "gpt-5.2-2025-12-11",
  maxTokens: 1000,
  temperature: 0.7,
  rateLimitRetries: 3,
  rateLimitDelay: 2000,
  enableConversationLogging: true,
  logLevel: "info",
  logsDirectory: "logs",
  apiMode: "silent",
};

export default function Settings() {
  const [formValues, setFormValues] = useState(DEFAULT_VALUES);
  const [sectionId, setSectionId] = useState(SECTIONS[0].id);
  const [saved, setSaved] = useState(false);

  const update = useCallback((key, value) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  const handleSave = useCallback(() => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, []);

  return (
    <Page>
      <TitleBar title="Chatbot settings" />
      <BlockStack gap="400">
        <Banner tone="info">
          Change how your store’s chat looks and behaves. Settings are saved in this session only until database is connected.
        </Banner>
        {saved && (
          <Banner tone="success" onDismiss={() => setSaved(false)}>
            Settings saved. Connect a database later to persist them.
          </Banner>
        )}
        <Layout>
          {/* ——— Left sidebar menu ——— */}
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Settings</Text>
                <Divider />
                {SECTIONS.map(({ id, label, icon }) => (
                  <Button
                    key={id}
                    variant={sectionId === id ? "primary" : "plain"}
                    fullWidth
                    textAlign="left"
                    onClick={() => setSectionId(id)}
                  >
                    <InlineStack gap="200" blockAlign="center">
                      <span>{icon}</span>
                      <span>{label}</span>
                    </InlineStack>
                  </Button>
                ))}
                <Box paddingBlockStart="400">
                  <Divider />
                  <Box paddingBlockStart="300">
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Save changes</Text>
                    <Text as="p" variant="bodySm" tone="subdued">Session only until DB is connected.</Text>
                    <Box paddingBlockStart="200">
                      <Button variant="primary" onClick={handleSave}>Save settings</Button>
                    </Box>
                  </Box>
                </Box>
              </BlockStack>
            </Card>
          </Layout.Section>
          {/* ——— Main content ——— */}
          <Layout.Section>
            <Box paddingBlockEnd="400" minWidth={0}>
              {sectionId === "look" && (
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Chat window</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Name and text customers see when they open the chat.</Text>
                      <TextField label="Assistant's name" value={formValues.botName} onChange={(v) => update("botName", v)} helpText="e.g. AVA, Zara" autoComplete="off" />
                      <TextField label="Welcome message" value={formValues.welcomeMessage} onChange={(v) => update("welcomeMessage", v)} multiline={2} autoComplete="off" />
                      <TextField label="Title at the top of the chat" value={formValues.chatTitle} onChange={(v) => update("chatTitle", v)} autoComplete="off" />
                      <TextField label="Placeholder in the message box" value={formValues.inputPlaceholder} onChange={(v) => update("inputPlaceholder", v)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Quick-reply buttons</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Suggestions shown when the conversation is empty.</Text>
                      <TextField label="Suggestion 1" value={formValues.suggestiveQuestion1} onChange={(v) => update("suggestiveQuestion1", v)} autoComplete="off" />
                      <TextField label="Suggestion 2" value={formValues.suggestiveQuestion2} onChange={(v) => update("suggestiveQuestion2", v)} autoComplete="off" />
                      <TextField label="Suggestion 3" value={formValues.suggestiveQuestion3} onChange={(v) => update("suggestiveQuestion3", v)} autoComplete="off" />
                      <TextField label="Suggestion 4" value={formValues.suggestiveQuestion4} onChange={(v) => update("suggestiveQuestion4", v)} autoComplete="off" />
                      <Select label="How many suggestions to show" options={[1,2,3,4].map(n => ({ label: String(n), value: String(n) }))} value={String(formValues.maxSuggestiveQuestions)} onChange={(v) => update("maxSuggestiveQuestions", Number(v))} />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {sectionId === "design" && (
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Floating bubble</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">The button that opens the chat on your storefront.</Text>
                      <TextField type="number" label="Bubble size (px)" value={String(formValues.bubbleSizePx)} onChange={(v) => update("bubbleSizePx", v ? parseInt(v, 10) : 60)} helpText="e.g. 60" autoComplete="off" />
                      <TextField label="Bubble color (hex)" value={formValues.bubbleColor} onChange={(v) => update("bubbleColor", v)} helpText="e.g. #5046e4" autoComplete="off" />
                      <TextField label="Bubble icon color (hex)" value={formValues.bubbleIconColor} onChange={(v) => update("bubbleIconColor", v)} helpText="e.g. #ffffff" autoComplete="off" />
                      <TextField type="number" label="Bubble corner radius (px)" value={String(formValues.bubbleRadiusPx)} onChange={(v) => update("bubbleRadiusPx", v ? parseInt(v, 10) : 50)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Chat window</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Background and shape of the chat panel.</Text>
                      <TextField label="Window background (hex)" value={formValues.windowBg} onChange={(v) => update("windowBg", v)} autoComplete="off" />
                      <TextField type="number" label="Window corner radius (px)" value={String(formValues.windowRadiusPx)} onChange={(v) => update("windowRadiusPx", v ? parseInt(v, 10) : 20)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Header bar</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">The top bar with the chat title.</Text>
                      <TextField label="Header background (hex)" value={formValues.headerBg} onChange={(v) => update("headerBg", v)} autoComplete="off" />
                      <TextField label="Header text color (hex)" value={formValues.headerTextColor} onChange={(v) => update("headerTextColor", v)} autoComplete="off" />
                      <TextField type="number" label="Header font size (px)" value={String(formValues.headerFontSizePx)} onChange={(v) => update("headerFontSizePx", v ? parseInt(v, 10) : 16)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Messages area</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Background and message bubbles.</Text>
                      <TextField label="Messages area background (hex)" value={formValues.messagesBg} onChange={(v) => update("messagesBg", v)} autoComplete="off" />
                      <TextField label="Customer message bubble (hex)" value={formValues.messageUserBg} onChange={(v) => update("messageUserBg", v)} autoComplete="off" />
                      <TextField label="Assistant message bubble (hex)" value={formValues.messageAssistantBg} onChange={(v) => update("messageAssistantBg", v)} autoComplete="off" />
                      <TextField type="number" label="Message font size (px)" value={String(formValues.messageFontSizePx)} onChange={(v) => update("messageFontSizePx", v ? parseInt(v, 10) : 14)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Input area</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">The message box and send/voice buttons.</Text>
                      <TextField label="Input background (hex)" value={formValues.inputBg} onChange={(v) => update("inputBg", v)} autoComplete="off" />
                      <TextField label="Input text color (hex)" value={formValues.inputTextColor} onChange={(v) => update("inputTextColor", v)} autoComplete="off" />
                      <TextField type="number" label="Input corner radius (px)" value={String(formValues.inputRadiusPx)} onChange={(v) => update("inputRadiusPx", v ? parseInt(v, 10) : 20)} autoComplete="off" />
                      <TextField label="Send button color (hex)" value={formValues.sendButtonColor} onChange={(v) => update("sendButtonColor", v)} autoComplete="off" />
                      <TextField label="Voice button color (hex)" value={formValues.voiceButtonColor} onChange={(v) => update("voiceButtonColor", v)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Quick-reply chips</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">The suggestion buttons (e.g. “What are your best sellers?”).</Text>
                      <TextField label="Chips background (hex)" value={formValues.questionsBg} onChange={(v) => update("questionsBg", v)} autoComplete="off" />
                      <TextField label="Chips text color (hex)" value={formValues.questionsTextColor} onChange={(v) => update("questionsTextColor", v)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Product cards</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Cards that show recommended products in the chat.</Text>
                      <TextField type="number" label="Card corner radius (px)" value={String(formValues.productCardRadiusPx)} onChange={(v) => update("productCardRadiusPx", v ? parseInt(v, 10) : 12)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Typography</Text>
                      <Text as="p" variant="bodyMd" tone="subdued">Font used for the whole chat. Use “inherit” to match your theme.</Text>
                      <TextField label="Font family (CSS)" value={formValues.fontFamily} onChange={(v) => update("fontFamily", v)} placeholder="inherit, sans-serif" helpText="e.g. inherit, sans-serif or a Google Font name" autoComplete="off" />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {sectionId === "tone" && (
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Tone of voice</Text>
                      <Select label="Style" options={[{ label: "Friendly and helpful (recommended)", value: "standardAssistant" }, { label: "Enthusiastic and upbeat", value: "enthusiasticAssistant" }]} value={formValues.systemPromptType} onChange={(v) => update("systemPromptType", v)} />
                      <TextField label="Custom instructions (optional)" value={formValues.customSystemPrompt} onChange={(v) => update("customSystemPrompt", v)} multiline={5} placeholder="e.g. Always mention free shipping." autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Conversation flow</Text>
                      <Checkbox label="Ask “Men’s or women’s?” at the start of a new chat" checked={formValues.askGenderOnStart} onChange={(v) => update("askGenderOnStart", v)} />
                      <Select label="If you don’t ask, assume" options={[{ label: "Don’t assume", value: "" }, { label: "Men’s", value: "men" }, { label: "Women’s", value: "women" }]} value={formValues.defaultGender} onChange={(v) => update("defaultGender", v)} />
                      <Select label="Reply length" options={[{ label: "Short (2–3 sentences)", value: "short" }, { label: "Medium (recommended)", value: "medium" }, { label: "Long (paragraphs)", value: "long" }]} value={formValues.maxResponseLength} onChange={(v) => update("maxResponseLength", v)} />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {sectionId === "features" && (
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Store features</Text>
                      <Checkbox label="Let customers search and browse products" checked={formValues.enableProductSearch} onChange={(v) => update("enableProductSearch", v)} />
                      <Checkbox label="Let customers view and edit their cart" checked={formValues.enableCart} onChange={(v) => update("enableCart", v)} />
                      <Checkbox label="Answer shipping, returns, and policy questions" checked={formValues.enablePoliciesFaq} onChange={(v) => update("enablePoliciesFaq", v)} />
                      <Checkbox label="Allow “Tell me more about this product”" checked={formValues.enableGetProductDetails} onChange={(v) => update("enableGetProductDetails", v)} />
                      <TextField type="number" label="Maximum number of products to show at once" value={String(formValues.maxProductsToDisplay)} onChange={(v) => update("maxProductsToDisplay", v ? parseInt(v, 10) : 15)} autoComplete="off" />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Product cards in chat</Text>
                      <Checkbox label="Show price on product cards" checked={formValues.showPriceOnProductCards} onChange={(v) => update("showPriceOnProductCards", v)} />
                      <Checkbox label="Show “Add to cart” on product cards" checked={formValues.showAddToCartOnCards} onChange={(v) => update("showAddToCartOnCards", v)} />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}

              {sectionId === "uploads" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Uploads & limits</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Limits for images and how much conversation history is sent to the AI.</Text>
                    <TextField type="number" label="Max image size for chat upload (MB)" value={String(formValues.maxImageUploadMB)} onChange={(v) => update("maxImageUploadMB", v ? parseInt(v, 10) : 10)} helpText="e.g. 10. Larger files are rejected." autoComplete="off" />
                    <TextField type="number" label="Max image size for try-on (MB)" value={String(formValues.tryOnMaxImageMB)} onChange={(v) => update("tryOnMaxImageMB", v ? parseInt(v, 10) : 20)} autoComplete="off" />
                    <TextField type="number" label="Max messages sent to AI per request" value={String(formValues.maxMessagesInHistory)} onChange={(v) => update("maxMessagesInHistory", v ? parseInt(v, 10) : 15)} helpText="Last N messages from history. Keeps context manageable." autoComplete="off" />
                  </BlockStack>
                </Card>
              )}

              {sectionId === "window" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Chat window & buttons</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Which buttons appear and what happens when the customer closes the chat.</Text>
                    <Checkbox label="Show voice input button (microphone)" checked={formValues.showVoiceInput} onChange={(v) => update("showVoiceInput", v)} />
                    <Checkbox label="Show image upload button" checked={formValues.showImageUploadButton} onChange={(v) => update("showImageUploadButton", v)} />
                    <TextField label="Close confirmation – title" value={formValues.closeConfirmationTitle} onChange={(v) => update("closeConfirmationTitle", v)} autoComplete="off" />
                    <TextField label="Close confirmation – message" value={formValues.closeConfirmationMessage} onChange={(v) => update("closeConfirmationMessage", v)} multiline={2} autoComplete="off" />
                  </BlockStack>
                </Card>
              )}

              {sectionId === "errors" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">When something goes wrong</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">What customers see when the chat can’t work. Keep these friendly.</Text>
                    <TextField label="When the chat service is misconfigured" value={formValues.errorApiKey} onChange={(v) => update("errorApiKey", v)} multiline={2} autoComplete="off" />
                    <TextField label="When there are too many requests" value={formValues.errorRateLimit} onChange={(v) => update("errorRateLimit", v)} multiline={2} autoComplete="off" />
                    <TextField label="When something else goes wrong" value={formValues.errorGeneric} onChange={(v) => update("errorGeneric", v)} multiline={2} autoComplete="off" />
                    <TextField label="When the customer sends an empty message" value={formValues.errorMissingMessage} onChange={(v) => update("errorMissingMessage", v)} autoComplete="off" />
                    <TextField label="When authentication fails" value={formValues.errorAuthFailed} onChange={(v) => update("errorAuthFailed", v)} autoComplete="off" />
                    <TextField label="When the request type is not supported" value={formValues.errorApiUnsupported} onChange={(v) => update("errorApiUnsupported", v)} multiline={2} autoComplete="off" />
                  </BlockStack>
                </Card>
              )}

              {sectionId === "tryon" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Virtual try-on</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Let customers see how clothing looks on them using a photo.</Text>
                    <Checkbox label="Show “Try on” on product cards" checked={formValues.enableTryOn} onChange={(v) => update("enableTryOn", v)} />
                    <Checkbox label="Generate try-on images in the chat" checked={formValues.enableImageGeneration} onChange={(v) => update("enableImageGeneration", v)} />
                    <Select label="Try-on service" options={[{ label: "OpenAI", value: "openai" }, { label: "Google Gemini", value: "gemini" }]} value={formValues.tryOnProvider} onChange={(v) => update("tryOnProvider", v)} />
                    <TextField label="Try-on image instructions (for experts)" value={formValues.tryOnPrompt} onChange={(v) => update("tryOnPrompt", v)} multiline={3} autoComplete="off" />
                  </BlockStack>
                </Card>
              )}

              {sectionId === "theme" && (
                <Card>
                  <BlockStack gap="400">
                    <Text as="h2" variant="headingMd">Position & size</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">Where the chat appears on the page and how large the window is. Can be synced to the theme extension later.</Text>
                    <Select label="Chat position on screen" options={[{ label: "Bottom right", value: "bottom-right" }, { label: "Bottom left", value: "bottom-left" }, { label: "Top right", value: "top-right" }, { label: "Top left", value: "top-left" }]} value={formValues.chatPosition} onChange={(v) => update("chatPosition", v)} />
                    <TextField type="number" label="Window width (%)" value={String(formValues.windowWidthPercent)} onChange={(v) => update("windowWidthPercent", v ? parseInt(v, 10) : 50)} helpText="Desktop; mobile often full width." autoComplete="off" />
                    <TextField type="number" label="Window max height (px)" value={String(formValues.windowMaxHeightPx)} onChange={(v) => update("windowMaxHeightPx", v ? parseInt(v, 10) : 650)} autoComplete="off" />
                  </BlockStack>
                </Card>
              )}

              {sectionId === "advanced" && (
                <BlockStack gap="400">
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">AI model & prompts</Text>
                      <Select label="Main assistant prompt" options={[{ label: "Standard", value: "standardAssistant" }, { label: "Enthusiastic", value: "enthusiasticAssistant" }]} value={formValues.toolPromptType} onChange={(v) => update("toolPromptType", v)} />
                      <TextField label="Model name" value={formValues.defaultModel} onChange={(v) => update("defaultModel", v)} autoComplete="off" />
                      <TextField type="number" label="Max tokens per reply" value={String(formValues.maxTokens)} onChange={(v) => update("maxTokens", v ? parseInt(v, 10) : 1000)} autoComplete="off" />
                      <TextField type="number" label="Temperature (0–2)" value={String(formValues.temperature)} onChange={(v) => update("temperature", v ? parseFloat(v) : 0.7)} autoComplete="off" />
                      <TextField type="number" label="Retries when AI is busy" value={String(formValues.rateLimitRetries)} onChange={(v) => update("rateLimitRetries", v ? parseInt(v, 10) : 3)} autoComplete="off" />
                      <TextField type="number" label="Wait between retries (ms)" value={String(formValues.rateLimitDelay)} onChange={(v) => update("rateLimitDelay", v ? parseInt(v, 10) : 2000)} autoComplete="off" />
                      <Select label="API mode" options={[{ label: "Silent", value: "silent" }]} value={formValues.apiMode} onChange={(v) => update("apiMode", v)} />
                    </BlockStack>
                  </Card>
                  <Card>
                    <BlockStack gap="400">
                      <Text as="h2" variant="headingMd">Logging</Text>
                      <Checkbox label="Save conversations to log files" checked={formValues.enableConversationLogging} onChange={(v) => update("enableConversationLogging", v)} />
                      <Select label="Log detail level" options={[{ label: "Errors only", value: "error" }, { label: "Info", value: "info" }, { label: "Debug", value: "debug" }]} value={formValues.logLevel} onChange={(v) => update("logLevel", v)} />
                      <TextField label="Logs folder path" value={formValues.logsDirectory} onChange={(v) => update("logsDirectory", v)} helpText="Relative to app root." autoComplete="off" />
                    </BlockStack>
                  </Card>
                </BlockStack>
              )}
            </Box>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
