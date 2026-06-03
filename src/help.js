import fs from "fs/promises";
import path from "path";
import { app } from "./index.js";

/**
 * Helper to convert standard Markdown to Slack's custom mrkdwn format.
 */
function markdownToMrkdwn(text) {
  return text
    .replace(/^#+\s*(.+)$/gm, "*$1*")
    .replace(/\*\*([^*]+)\*\*/g, "*$1*")
    .replace(/^\s*[-*]\s+/gm, "• ");
}

/**
 * Listens for the `help` command and displays bot usage instructions.
 * 
 * Usage: /help
 */
app.command("/help", async ({ ack, respond }) => {
  await ack();
  try {
    const helpPath = path.join(process.cwd(), "commands.md");
    const helpText = await fs.readFile(helpPath, "utf8");
    await respond({
      text: markdownToMrkdwn(helpText),
      response_type: "ephemeral",
    });
  } catch (err) {
    console.error("Failed to read commands.md:", err);
    await respond({
      text: "Error: Could not load the help documentation.",
      response_type: "ephemeral",
    });
  }
});
