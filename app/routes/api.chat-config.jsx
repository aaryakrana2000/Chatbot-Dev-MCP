import { authenticate } from "../shopify.server";
import { getChatConfig, upsertChatConfig, syncChatConfigFromArray } from "../db.server";

export async function loader({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const shop = admin.session.shop;

    const config = await getChatConfig(shop);
    
    // Return default config if none exists
    if (!config) {
      const AppConfig = (await import("../services/config.server")).default;
      return ({
        suggestiveQuestions: AppConfig.chat?.suggestiveQuestions || [],
        maxSuggestiveQuestions: AppConfig.chat?.maxSuggestiveQuestions || 4
      });
    }

    return json({
      suggestiveQuestions: config.suggestiveQuestions,
      maxSuggestiveQuestions: config.maxSuggestiveQuestions
    });
  } catch (error) {
    console.error('Error loading chat config:', error);
    return ({ error: error.message }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const shop = admin.session.shop;
    const method = request.method;

    if (method === "POST") {
      const body = await request.json();
      const { 
        suggestiveQuestions, 
        suggestiveQuestion1,
        suggestiveQuestion2,
        suggestiveQuestion3,
        suggestiveQuestion4,
        maxSuggestiveQuestions 
      } = body;

      // Support both array format (for admin UI) and individual fields (for customizer sync)
      let config;
      if (suggestiveQuestion1 !== undefined) {
        // Individual fields format (from customizer)
        config = await upsertChatConfig(
          shop,
          suggestiveQuestion1 || null,
          suggestiveQuestion2 || null,
          suggestiveQuestion3 || null,
          suggestiveQuestion4 || null,
          null, // question5 always null now
          maxSuggestiveQuestions || 4
        );
      } else if (Array.isArray(suggestiveQuestions)) {
        // Array format (for admin UI backward compatibility)
        config = await syncChatConfigFromArray(
          shop,
          suggestiveQuestions,
          maxSuggestiveQuestions || 4
        );
      } else {
        return ({ error: "Invalid request format" }, { status: 400 });
      }

      return ({ success: true, config });
    }

    return ({ error: "Method not allowed" }, { status: 405 });
  } catch (error) {
    console.error('Error in chat config action:', error);
    return ({ error: error.message }, { status: 500 });
  }
}
