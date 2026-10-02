import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import "dotenv/config";
import { WebClient } from "@slack/web-api";

export const slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_PUBLIC_KEY ||
  "";
export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
        },
        realtime: {
          transport: WebSocket,
        },
      })
    : null;

export const cache = {
  members: [],    // Array of DB rows: { id, name, slack_user_id, birthday, roles }
  rolesMap: {},   // Map of role -> Set of slack_user_ids
  slackUsers: [], // Array of raw Slack user objects for username resolution
};

/**
 * Refreshes the cache from Supabase from the `execs` table. Semantics are merge-on-conflict.
 */
export const refreshCache = async () => {
  if (!supabase) {
    console.error("Supabase client not initialized. Check .env variables.");
    return;
  }

  try {
    const { data, error } = await supabase.from("execs").select("*");
    if (error) throw error;

    if (data) {
      cache.members = data;

      const newRolesMap = {};
      for (const member of data) {
        if (member.roles && Array.isArray(member.roles)) {
          for (const role of member.roles) {
            const lowerRole = role.toLowerCase();
            if (!newRolesMap[lowerRole]) newRolesMap[lowerRole] = new Set();
            newRolesMap[lowerRole].add(member.slack_user_id);
          }
        }
      }
      cache.rolesMap = newRolesMap;
      // TODO: Remove debug log
      console.log(`Cache refreshed: ${data.length} members loaded.`);
    }
  } catch (err) {
    console.error("Failed to refresh Supabase cache:", err);
  }
};

/**
 * Refreshes the in-memory cache of Slack users from the Slack API.
 */
export const refreshSlackUsersCache = async () => {
  try {
    let cursor;
    const slackUsers = [];
    do {
      const resp = await slackClient.users.list({
        limit: 200,
        cursor,
      });
      slackUsers.push(...(resp.members || []));
      cursor = resp.response_metadata?.next_cursor;
    } while (cursor);
    cache.slackUsers = slackUsers;
    console.log(`Slack users cache refreshed: ${slackUsers.length} users loaded.`);
  } catch (err) {
    console.error("Failed to refresh Slack users cache:", err);
  }
};

/**
 * Syncs Slack users to the Supabase database, filtering out bots and deleted users.
 */
export const syncSlackUsers = async () => {
  console.log("Running Slack sync...");
  if (!supabase) {
    // TODO: Remove debug log
    console.log("Supabase client not initialized.");
    return;
  }

  try {
    let cursor;
    const slackUsers = [];

    do {
      const resp = await slackClient.users.list({
        limit: 200,
        cursor,
      });
      slackUsers.push(...(resp.members || []));
      cursor = resp.response_metadata?.next_cursor;
    } while (cursor);

    const validUsers = slackUsers.filter(
      (u) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT",
    );

    const { data: dbMembers, error } = await supabase
      .from("execs")
      .select("id, slack_user_id, name");
    if (error) throw error;

    const dbMap = new Map(dbMembers.map((m) => [m.slack_user_id, m]));

    for (const u of validUsers) {
      const name = u.real_name || u.name;
      const slackId = u.id;

      if (dbMap.has(slackId)) {
        const dbUser = dbMap.get(slackId);
        if (dbUser.name !== name) {
          const { error: err } = await supabase
            .from("execs")
            .update({ name })
            .eq("id", dbUser.id);
          if (err) throw new Error(`Supabase Update Error: ${err.message}`);
          // TODO: Remove debug log
          console.log(
            `Updated name for ${slackId}: from ${dbUser.name} to ${name}`,
          );
        }
      } else {
        const { error: err } = await supabase.from("execs").insert({
          name,
          slack_user_id: slackId,
          roles: [],
          birthday: null,
        });
        if (err) throw new Error(`Supabase Insert Error: ${err.message}`);
        // TODO: Remove debug log
        console.log(`Inserted new user ${slackId}: ${name}`);
      }
    }
    cache.slackUsers = slackUsers;
    await refreshCache();
    console.log("Slack sync complete.");
  } catch (err) {
    console.error("Error running Slack sync:", err);
  }
};

/**
 * Adds a single newly joined Slack user to the `execs` table (if not already present)
 * and updates both in-memory caches.
 */
export const addSlackUser = async (user) => {
  if (!user || user.is_bot || user.deleted || user.id === "USLACKBOT") return;

  if (!cache.slackUsers.some((u) => u.id === user.id)) {
    cache.slackUsers.push(user);
  }

  if (!supabase) {
    console.error("Supabase client not initialized. Check .env variables.");
    return;
  }

  try {
    const { data: existing, error } = await supabase
      .from("execs")
      .select("id")
      .eq("slack_user_id", user.id)
      .maybeSingle();
    if (error) throw error;

    if (!existing) {
      const name = user.real_name || user.name;
      const { error: err } = await supabase.from("execs").insert({
        name,
        slack_user_id: user.id,
        roles: [],
        birthday: null,
      });
      if (err) throw new Error(`Supabase Insert Error: ${err.message}`);
      console.log(`Inserted new user ${user.id}: ${name}`);
    }

    await refreshCache();
  } catch (err) {
    console.error(`Failed to add Slack user ${user.id}:`, err);
  }
};
