// Try-on services temporarily disabled
// import { createTryOnService } from "../services/try-on.server.js";
// import { createOpenAITryOnService } from "../services/try-on-openai.server.js";

/**
 * API route for try-on image generation
 * POST /api/try-on
 * Body: {
 *   userImage: string (base64 data URL),
 *   productImage: string (base64 data URL),
 *   prompt?: string (optional custom prompt),
 *   provider?: string (optional: "gemini" | "openai", defaults to "gemini")
 * }
 */
// Try-on API route temporarily disabled
export async function action({ request }) {
  return (
    {
      success: false,
      error: "Try-on feature is temporarily disabled",
    },
    {
      status: 503,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
    }
  );
}

// Handle GET requests (for testing)
export async function loader({ request }) {
  return (
    {
      message: "Try-On API endpoint",
      usage: "POST /api/try-on with { userImage, productImage, prompt?, productId?, productTitle?, provider? }",
      providers: ["gemini", "openai"],
      defaultProvider: "openai"
    },
    {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}

