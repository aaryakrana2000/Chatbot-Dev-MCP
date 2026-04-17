import { upsertChatConfig } from "../db.server";

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400"
  };
}

export async function loader({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { 
      status: 204, 
      headers: getCorsHeaders(request)
    });
  }
  return ({ error: "Method not allowed" }, { status: 405, headers: getCorsHeaders(request) });
}

export async function action({ request }) {
  try {
    if (request.method !== "POST") {
      return ({ error: "Method not allowed" }, { status: 405, headers: getCorsHeaders(request) });
    }

    const body = await request.json();
    const { 
      shop, 
      suggestiveQuestion1, 
      suggestiveQuestion2, 
      suggestiveQuestion3, 
      suggestiveQuestion4, 
      maxSuggestiveQuestions 
    } = body;

    if (!shop) {
      return ({ error: "Shop domain is required" }, { status: 400, headers: getCorsHeaders(request) });
    }

    console.log('[API] Syncing chat config for shop:', shop, {
      q1: suggestiveQuestion1,
      q2: suggestiveQuestion2,
      q3: suggestiveQuestion3,
      q4: suggestiveQuestion4,
      max: maxSuggestiveQuestions
    });

    const config = await upsertChatConfig(
      shop,
      suggestiveQuestion1 || null,
      suggestiveQuestion2 || null,
      suggestiveQuestion3 || null,
      suggestiveQuestion4 || null,
      null, // question5 always null now
      maxSuggestiveQuestions || 4
    );

    console.log('[API] ✅ Chat config synced successfully:', {
      shop: config.shop,
      questions: config.suggestiveQuestions,
      max: config.maxSuggestiveQuestions
    });

    return ({ 
      success: true, 
      config,
      message: "Chat configuration synced successfully"
    }, { headers: getCorsHeaders(request) });
  } catch (error) {
    console.error('Error syncing chat config:', error);
    return ({ error: error.message }, { status: 500, headers: getCorsHeaders(request) });
  }
}
