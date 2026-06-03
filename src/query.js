import { app } from "./index.js";
import { cache, supabase } from "./cache.js";
import { getValidTargetUser } from "./utils.js";

/**
 * `/query`: Displays the target user's name, departments, and birthday.
 * 
 * Usage: /query <@slack_user> or /query [name]
 */
app.command("/query", async ({ command, ack, respond, client }) => {
  await ack();

  try {
    const text = command.text.trim();
    let targetUserId = null;

    // Try to match standard Slack user tag: <@U12345678> or <@U12345678|name>
    const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/i);
    
    if (match) {
      targetUserId = match[1];
    } else if (text.length > 0) {
      // Fallback: search by name/username in the local database cache
      const searchName = text.replace(/^@/, "").trim().toLowerCase();
      
      const foundMember = cache.members.find(
        (m) =>
          (m.name && m.name.toLowerCase().includes(searchName)) ||
          (m.slack_user_id && m.slack_user_id.toLowerCase() === searchName)
      );
      
      if (foundMember) {
        targetUserId = foundMember.slack_user_id;
      }
    }

    if (!targetUserId) {
      await respond({
        text: "Invalid command format or member not found. Usage: `/query @member` or `/query [name]`",
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

    const { data: memberData, error: selectError } = await supabase
      .from("execs")
      .select("*")
      .eq("slack_user_id", targetUserId)
      .maybeSingle();

    if (selectError) {
      console.error("Supabase select error:", selectError);
      await respond({
        text: `Database error retrieving user: ${selectError.message}`,
        response_type: "ephemeral",
      });
      return;
    }

    const name = memberData?.name || targetUser.real_name || targetUser.name || "Unknown";
    
    let deptsString = "Unknown";
    if (memberData?.roles && Array.isArray(memberData.roles) && memberData.roles.length > 0) {
      deptsString = memberData.roles.map((r) => `\`${r}\``).join(", ");
    }
    
    const birthday = memberData?.birthday || "Unknown";

    const responseText = `*User Information for <@${targetUserId}>:*\n` +
      `• *Name:* ${name}\n` +
      `• *Departments:* ${deptsString}\n` +
      `• *Birthday:* ${birthday}`;

    await respond({
      text: responseText,
      response_type: "ephemeral",
    });

  } catch (error) {
    console.error("Error executing /query command:", error);
    await respond({
      text: `An error occurred: ${error.message}`,
      response_type: "ephemeral",
    });
  }
});
