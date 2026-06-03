import { cache, supabase } from "./cache.js";

/**
 * Helper to verify if the requester has permission (is leadership or president).
 * Responds ephemerally if permission is denied.
 */
export async function verifyPermission(requesterId, respond) {
  let requester = cache.members.find((m) => m.slack_user_id === requesterId);

  if (!requester && supabase) {
    const { data } = await supabase
      .from("execs")
      .select("*")
      .eq("slack_user_id", requesterId)
      .maybeSingle();
    if (data) {
      requester = data;
    }
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
