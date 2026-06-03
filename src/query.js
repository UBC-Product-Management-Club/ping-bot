import { app } from "./index.js";
import { supabase } from "./cache.js";
import { getValidTargetUser } from "./utils.js";

/**
 * `/query`: Displays the target user's name, departments, and birthday.
 * 
 * Usage: /query <@slack_user>
 */
app.command("/query", async ({ command, ack, respond, client }) => {
  await ack();

  try {
    const text = command.text.trim();
    const match = text.match(/<@([A-Z0-9]+)(?:\|[^>]+)?>/i);

    if (!match) {
      await respond({
        text: "Invalid command format. Usage: `/query @member`",
        response_type: "ephemeral",
      });
      return;
    }

    const targetUserId = match[1];
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
