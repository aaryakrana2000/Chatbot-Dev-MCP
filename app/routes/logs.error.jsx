import fs from "fs/promises";

export async function loader({ request }) {
  const logPath = "/home/shopify-apps/.pm2/logs/chatbot-error.log";

  try {
    const url = new URL(request.url);
    const clear = url.searchParams.get("clear");

    if (clear === "true") {
      // ✅ Clear the file
      await fs.writeFile(logPath, "");
      return new Response(
        `<html><body><h2>PM2 Error Logs</h2><p>✅ Error logs cleared successfully.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ✅ Read and display
    const data = await fs.readFile(logPath, "utf8");
    const formattedData = data
      .split("\n")
      .map((line) => `<div>${line}</div>`)
      .join("");

    return new Response(
      `<html><body>
        <h2>PM2 Error Logs</h2>
        <a href="?clear=true" style="color:red;">Clear Logs</a>
        ${formattedData}
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (err) {
    return new Response(
      `<html><body><h2>❌ Error reading error log file</h2><pre>${err.message}</pre></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html" } }
    );
  }
}
