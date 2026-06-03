import { app } from "./index.js";
import { supabase } from "./cache.js";
import { resolveTargetUser, cleanCommandText } from "./utils.js";

/**
 * `/query`: Displays the target user's name, departments, and birthday.
 * 
 * Usage: /query <@slack_user> or /query [name]
 */
app.command("/query", async ({ command, ack, respond, client }) => {
  await ack();
  console.log(`Command received - /query: "${command.text}" from user: ${command.user_id}`);

  try {
    const text = cleanCommandText(command.text);
    if (!text) {
      await respond({
        text: "Invalid command format. Usage: `/query @member` or `/query [name]`",
        response_type: "ephemeral",
      });
      return;
    }

    const resolved = await resolveTargetUser(text, client, respond);
    if (!resolved) return;

    const { targetUserId, targetUser } = resolved;

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
