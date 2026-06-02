import "dotenv/config";
import pkg from "@slack/bolt";
const { App } = pkg;

export const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: !!process.env.SLACK_APP_TOKEN,  // Set to false if token is missing
  appToken: process.env.SLACK_APP_TOKEN,      // Else use the app token if socket mode is enabled
});

import { cache, refreshCache } from "./cache.js";
import "./birthday.js";

const pingMap = new Map();

// TODO: Delete debug logs for socket mode
if (app.receiver.client) {
  app.receiver.client.on("connecting", () => {
    console.log("Connecting to Slack using Socket Mode...");
  });

  app.receiver.client.on("connected", () => {
    console.log("Socket Mode connection established.");
  });

  app.receiver.client.on("error", (error) => {
    console.error("Socket Mode connection error:", error);
  });
}

/**
 * Listens for messages in channels the bot is a member of. Looks for 
 * @mentions that match roles defined in the cache and responds by tagging 
 * all users associated with those roles in a thread.
 */
app.message(async ({ message, say }) => {
  if (message.subtype || message.bot_id) {
    return;
  }

  const regex = /@(\w+)/g;
  const found = [...message.text.matchAll(regex)];
  const usersToPing = new Set();

  for (const [, role] of found) {
    const lowerCaseRole = role.toLowerCase();
    if (cache.rolesMap[lowerCaseRole]) {
      cache.rolesMap[lowerCaseRole].forEach((userId) =>
        usersToPing.add(userId),
      );
    }
  }

  if (usersToPing.size > 0) {
    const tagString = Array.from(usersToPing)
      .map((u) => `<@${u}>`)
      .join(" ");
    console.log(tagString);
    const res = await say({ text: `${tagString}`, thread_ts: message.ts });
    pingMap.set(`${message.channel}:${message.ts}`, res.ts);
  }
});

(async () => {
  await refreshCache();

  await app.start(process.env.PORT || 3000);
  console.log("Geary bot running");
})();
