import fs from "fs/promises";
import path from "path";
import { app } from "./index.js";
import { cache, refreshCache, supabase } from "./cache.js";

const deptsPath = path.join(process.cwd(), "departments.json");
const deptsData = await fs.readFile(deptsPath, "utf8");
const departments = JSON.parse(deptsData);

/**
 * Helper to verify if the requester has permission (is leadership or president).
 * Responds ephemerally if permission is denied.
 */
async function verifyPermission(requesterId, respond) {
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
async function getValidTargetUser(targetUserId, client, respond) {
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
 * Listens for the `assign` command and assigns the user to the given department.
 * 
 * Usage: /assign <@slack_user> [department]
 * Only users with the `leadership` or `pres` role can use this command.
 */
app.command("/assign", async ({ command, ack, respond, client }) => {
  await ack();

  try {
    if (!(await verifyPermission(command.user_id, respond))) {
      return;
    }

    const text = command.text.trim();
    const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>\s+(\S+)/i);

    if (!match) {
      await respond({
        text: "Invalid command format. Usage: `/assign @member [department]`",
        response_type: "ephemeral",
      });
      return;
    }

    const targetUserId = match[1];
    const deptInput = match[2].toLowerCase();

    if (!departments.includes(deptInput)) {
      const validDeptsList = departments.map((d) => `\`${d}\``).join(", ");
      await respond({
        text: `Invalid department: *${match[2]}*. Valid departments are: ${validDeptsList}`,
        response_type: "ephemeral",
      });
      return;
    }

    const targetUser = await getValidTargetUser(targetUserId, client, respond);
    if (!targetUser) return;

    if (!supabase) {
      await respond({
        text: "Database connection is not available.",
        response_type: "ephemeral",
      });
      return;
    }

    const { data: existingUser, error: selectError } = await supabase
      .from("execs")
      .select("*")
      .eq("slack_user_id", targetUserId)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase select error:", selectError);
      await respond({
        text: `Database error checking user: ${selectError.message}`,
        response_type: "ephemeral",
      });
      return;
    }

    const targetUserName = targetUser.real_name || targetUser.name || "Unknown User";

    if (!existingUser) {
      const { error: insertError } = await supabase
        .from("execs")
        .insert({
          name: targetUserName,
          slack_user_id: targetUserId,
          roles: [deptInput],
          birthday: null,
        });

      if (insertError) {
        console.error("Supabase insert error:", insertError);
        await respond({
          text: `Database error adding user: ${insertError.message}`,
          response_type: "ephemeral",
        });
        return;
      }
    } else {
      const { error: updateError } = await supabase
        .from("execs")
        .update({
          roles: [deptInput],
        })
        .eq("slack_user_id", targetUserId);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        await respond({
          text: `Database error updating user: ${updateError.message}`,
          response_type: "ephemeral",
        });
        return;
      }
    }

    await refreshCache();

    await respond({
      text: `Successfully reassigned <@${targetUserId}> to department: *${deptInput}*`,
      response_type: "in_channel",
    });
  } catch (error) {
    console.error("Error executing /assign command:", error);
    await respond({
      text: `An error occurred: ${error.message}`,
      response_type: "ephemeral",
    });
  }
});

/**
 * Listens for the `unassign` command and removes the user from the given department or all departments.
 * 
 * Usage: /unassign <@slack_user> [department] or /unassign <@slack_user>
 * Only users with the `leadership` or `pres` role can use this command.
 */
app.command("/unassign", async ({ command, ack, respond, client }) => {
  await ack();

  try {
    if (!(await verifyPermission(command.user_id, respond))) {
      return;
    }

    const text = command.text.trim();
    // Parse target user (e.g. <@U12345678>) and optional department (e.g. community)
    const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>\s*(\S+)?/i);

    if (!match) {
      await respond({
        text: "Invalid command format. Usage: `/unassign @member [department]` or `/unassign @member`",
        response_type: "ephemeral",
      });
      return;
    }

    const targetUserId = match[1];
    const deptInput = match[2] ? match[2].toLowerCase() : null;

    if (deptInput && !departments.includes(deptInput)) {
      const validDeptsList = departments.map((d) => `\`${d}\``).join(", ");
      await respond({
        text: `Invalid department: *${match[2]}*. Valid departments are: ${validDeptsList}`,
        response_type: "ephemeral",
      });
      return;
    }

    const targetUser = await getValidTargetUser(targetUserId, client, respond);
    if (!targetUser) return;

    if (!supabase) {
      await respond({
        text: "Database connection is not available.",
        response_type: "ephemeral",
      });
      return;
    }

    const { data: existingUser, error: selectError } = await supabase
      .from("execs")
      .select("*")
      .eq("slack_user_id", targetUserId)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase select error:", selectError);
      await respond({
        text: `Database error checking user: ${selectError.message}`,
        response_type: "ephemeral",
      });
      return;
    }

    if (!existingUser) {
      await respond({
        text: `<@${targetUserId}> has no departments assigned in the database.`,
        response_type: "ephemeral",
      });
      return;
    }

    if (deptInput) {
      const lowerRoles = (existingUser.roles || []).map((r) => r.toLowerCase());
      if (!lowerRoles.includes(deptInput)) {
        await respond({
          text: `<@${targetUserId}> is not assigned to the department: *${deptInput}*`,
          response_type: "ephemeral",
        });
        return;
      }

      const updatedRoles = (existingUser.roles || []).filter(
        (role) => role.toLowerCase() !== deptInput
      );

      const { error: updateError } = await supabase
        .from("execs")
        .update({ roles: updatedRoles })
        .eq("slack_user_id", targetUserId);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        await respond({
          text: `Database error updating user: ${updateError.message}`,
          response_type: "ephemeral",
        });
        return;
      }

      await refreshCache();

      await respond({
        text: `Successfully removed <@${targetUserId}> from department: *${deptInput}*`,
        response_type: "in_channel",
      });
    } else {
      const { error: updateError } = await supabase
        .from("execs")
        .update({ roles: [] })
        .eq("slack_user_id", targetUserId);

      if (updateError) {
        console.error("Supabase update error:", updateError);
        await respond({
          text: `Database error updating user: ${updateError.message}`,
          response_type: "ephemeral",
        });
        return;
      }

      await refreshCache();

      await respond({
        text: `Successfully removed <@${targetUserId}> from all departments.`,
        response_type: "in_channel",
      });
    }
  } catch (error) {
    console.error("Error executing /unassign command:", error);
    await respond({
      text: `An error occurred: ${error.message}`,
      response_type: "ephemeral",
    });
  }
});