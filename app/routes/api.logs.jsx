import { json } from "@remix-run/node";
import { getLogger } from "../utils/logger.server";

/**
 * API endpoint to receive client-side logs
 */
export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json();
    const { level, message, metadata = {} } = body;

    if (!level || !message) {
      return json({ error: "Missing required fields: level, message" }, { status: 400 });
    }

    // Get logger instance and log client message
    const logger = getLogger();
    logger.logClient(level, message, metadata);

    return json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error logging client message:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
