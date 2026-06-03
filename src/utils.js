import { cache, supabase } from "./cache.js";

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
        return lowerRole === "leadership" || lowerRole === "pres";
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

/**
 * Resolves a target user input (either a Slack mention or a raw name/username)
 * to a validated Slack User ID and user details.
 */
export async function resolveTargetUser(input, client, respond) {
  if (!input) {
    await respond({
      text: "No member specified.",
      response_type: "ephemeral",
    });
    return null;
  }

  const cleanInput = cleanCommandText(input);

  let targetUserId = null;

  // TODO: Clean up slop logic, deterministically match on :lt<@hash1234|name>;gt format
  const match = cleanInput.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/i);
  if (match) {
    targetUserId = match[1];
  } else {
    const searchName = cleanInput.replace(/^@/, "").trim().toLowerCase();
    if (searchName.length > 0) {
      const foundMember = cache.members.find(
        (m) =>
          (m.name && m.name.toLowerCase().includes(searchName)) ||
          (m.slack_user_id && m.slack_user_id.toLowerCase() === searchName)
      );
      if (foundMember) {
        targetUserId = foundMember.slack_user_id;
      } else if (cache.slackUsers) {
        const foundSlackUser = cache.slackUsers.find(
          (u) =>
            (u.name && u.name.toLowerCase() === searchName) ||
            (u.real_name && u.real_name.toLowerCase().includes(searchName)) ||
            (u.profile?.display_name && u.profile.display_name.toLowerCase() === searchName)
        );
        if (foundSlackUser) {
          targetUserId = foundSlackUser.id;
        }
      }
    }
  }

  if (!targetUserId) {
    await respond({
      text: `Could not resolve member: *${cleanInput}*. Make sure to tag them (e.g. @member) or use their exact name.`,
      response_type: "ephemeral",
    });
    return null;
  }

  const targetUser = await getValidTargetUser(targetUserId, client, respond);
  if (!targetUser) return null;

  return { targetUserId, targetUser };
}
