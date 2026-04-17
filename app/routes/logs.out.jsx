import fs from "fs/promises";

export async function loader({ request }) {
  const logPath = "/home/shopify-apps/.pm2/logs/chatbot-out.log";

  try {
    const url = new URL(request.url);
    const clear = url.searchParams.get("clear");

    if (clear === "true") {
      // ✅ Clear the file by truncating
      await fs.writeFile(logPath, "");
      return new Response(
        `<html><body><h2>PM2 Out Logs</h2><p>✅ Logs cleared successfully.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ✅ Otherwise read and display
    const data = await fs.readFile(logPath, "utf8");
    const formattedData = data
      .split("\n")
      .map((line) => `<div>${line}</div>`)
      .join("");

    return new Response(
      `<html><body>
        <h2>PM2 Out Logs</h2>
        <a href="?clear=true" style="color:red;">Clear Logs</a>
        ${formattedData}
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    throw new Response(
      JSON.stringify({ error: "Error reading log file", details: err.message }),
      { status: 500 }
    );
  }
}
