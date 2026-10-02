import { cache, supabase, refreshSlackUsersCache } from "./cache.js";

/**
 * Helper to verify if the requester has permission (is leadership or president).
 * Responds ephemerally if permission is denied.
 */
export async function verifyPermission(requesterId, respond) {
  if (!supabase) {
    await respond({
      text: "Database connection is not available.",
      response_type: "ephemeral",
    });
    return false;
  }

  try {
    const { data: requester, error } = await supabase
      .from("execs")
      .select("*")
      .eq("slack_user_id", requesterId)
      .maybeSingle();

    if (error) {
      console.error("Supabase select error in verifyPermission:", error);
      await respond({
        text: `Database error checking permissions: ${error.message}`,
        response_type: "ephemeral",
      });
      return false;
    }

    const hasPermission = requester && requester.roles && requester.roles.some(
      (role) => {
        const lowerRole = role.toLowerCase();
        return (
          lowerRole === "leadership" ||
          lowerRole === "pres" ||
          lowerRole === "advisors" ||
          lowerRole === "tech"
        );
      }
    );

    if (!hasPermission) {
      await respond({
        text: "You do not have permission to manage departments. Only leadership and presidents can perform this action.",
        response_type: "ephemeral",
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error verifying permissions:", err);
    await respond({
      text: `An error occurred while verifying permissions: ${err.message}`,
      response_type: "ephemeral",
    });
    return false;
  }
}

/**
 * Helper to retrieve user details and validate that the target is a real person.
 * Responds ephemerally if validation fails.
 */
export async function getValidTargetUser(targetUserId, client, respond) {
  const userInfoResp = await client.users.info({ user: targetUserId });
  if (!userInfoResp.ok || !userInfoResp.user) {
    await respond({
      text: `Failed to retrieve user information for <@${targetUserId}> from Slack.`,
      response_type: "ephemeral",
    });
    return null;
  }

  const targetUser = userInfoResp.user;

  if (targetUser.is_bot || targetUser.id === "USLACKBOT") {
    await respond({
      text: `Cannot manage roles/departments for bots (<@${targetUserId}>).`,
      response_type: "ephemeral",
    });
    return null;
  }

  if (targetUser.deleted) {
    await respond({
      text: `Cannot manage roles/departments for deleted users (<@${targetUserId}>).`,
      response_type: "ephemeral",
    });
    return null;
  }

  return targetUser;
}

/**
 * Clean and unescape HTML entities from a Slack slash command input string.
 */
export function cleanCommandText(text) {
  if (!text) return "";
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

const MENTION_RE = /^<@([UW][A-Z0-9]+)(?:\|[^>]*)?>$/;
const USER_ID_RE = /^[UW][A-Z0-9]{8,}$/;

/**
 * Extracts a user ID from an escaped Slack mention (<@U123|name>) or an ID.
 */
function parseUserId(text) {
  const mention = text.match(MENTION_RE);
  if (mention) return mention[1];
  return USER_ID_RE.test(text) ? text : null;
}

/**
 * Returns active Slack users whose username, display name, or real name match the query.
 */
function searchSlackUsers(query) {
  const q = query.toLowerCase();
  const people = cache.slackUsers.filter(
    (u) => !u.is_bot && !u.deleted && u.id !== "USLACKBOT"
  );
  const namesOf = (u) =>
    [u.name, u.real_name, u.profile?.display_name]
      .filter(Boolean)
      .map((n) => n.toLowerCase());

  const exact = people.filter((u) => namesOf(u).includes(q));
  if (exact.length > 0) return exact;
  return people.filter((u) => namesOf(u).some((n) => n.includes(q)));
}

/**
 * Searches Slack users by name, refreshing the cache once on a miss
 * (e.g. the member joined after the cache was loaded).
 */
async function findUsersByName(text) {
  const query = text.replace(/^@/, "").trim();
  if (!query) return [];

  let matches = searchSlackUsers(query);
  if (matches.length === 0) {
    await refreshSlackUsersCache();
    matches = searchSlackUsers(query);
  }
  return matches;
}

async function reject(respond, text) {
  await respond({ text, response_type: "ephemeral" });
  return null;
}

/**
 * Resolves a target user input (a Slack mention, user ID, or name)
 * to a validated Slack User ID and user details.
 */
export async function resolveTargetUser(input, client, respond) {
  const text = cleanCommandText(input);
  if (!text) return reject(respond, "No member specified.");

  let userId = parseUserId(text);
  if (!userId) {
    const matches = await findUsersByName(text);
    if (matches.length === 0) {
      return reject(
        respond,
        `Could not find a member matching *${text}*. Try tagging them (e.g. @member).`
      );
    }
    if (matches.length > 1) {
      const options = matches.slice(0, 5).map((u) => `<@${u.id}>`).join(", ");
      return reject(
        respond,
        `*${text}* matches multiple members: ${options}. Please tag the one you mean.`
      );
    }
    userId = matches[0].id;
  }

  const targetUser = await getValidTargetUser(userId, client, respond);
  return targetUser ? { targetUserId: userId, targetUser } : null;
}
