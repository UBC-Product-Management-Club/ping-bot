import fs from "fs/promises";
import path from "path";
import { app } from "./index.js";
import { refreshCache, supabase } from "./cache.js";
import { verifyPermission, resolveTargetUser } from "./utils.js";

const deptsPath = path.join(process.cwd(), "departments.json");
const deptsData = await fs.readFile(deptsPath, "utf8");
const departments = JSON.parse(deptsData);

/**
 * `/assign`: Assigns the user to the given department.
 * 
 * Usage: /assign <@slack_user> [department] or /assign [name] [department]
 * Only users with the `leadership` or `pres` role can use this command.
 */
app.command("/assign", async ({ command, ack, respond, client }) => {
  await ack();

  try {
    if (!(await verifyPermission(command.user_id, respond))) {
      return;
    }

    const text = command.text.trim();
    const lastSpaceIndex = text.lastIndexOf(" ");
    if (lastSpaceIndex === -1) {
      await respond({
        text: "Invalid command format. Usage: `/assign @member [department]` or `/assign [name] [department]`",
        response_type: "ephemeral",
      });
      return;
    }

    const userInput = text.substring(0, lastSpaceIndex).trim();
    const deptInput = text.substring(lastSpaceIndex + 1).trim().toLowerCase();

    if (!departments.includes(deptInput)) {
      const validDeptsList = departments.map((d) => `\`${d}\``).join(", ");
      await respond({
        text: `Invalid department: *${deptInput}*. Valid departments are: ${validDeptsList}`,
        response_type: "ephemeral",
      });
      return;
    }

    const resolved = await resolveTargetUser(userInput, client, respond);
    if (!resolved) return;

    const { targetUserId, targetUser } = resolved;

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
 * `/unassign`: Removes the user from the given department or all departments.
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
    if (!text) {
      await respond({
        text: "Invalid command format. Usage: `/unassign @member [department]` or `/unassign @member`",
        response_type: "ephemeral",
      });
      return;
    }

    let userInput = text;
    let deptInput = null;

    const lastSpaceIndex = text.lastIndexOf(" ");
    if (lastSpaceIndex !== -1) {
      const possibleDept = text.substring(lastSpaceIndex + 1).trim().toLowerCase();
      if (departments.includes(possibleDept)) {
        userInput = text.substring(0, lastSpaceIndex).trim();
        deptInput = possibleDept;
      }
    }

    const resolved = await resolveTargetUser(userInput, client, respond);
    if (!resolved) return;

    const { targetUserId } = resolved;

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