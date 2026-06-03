# PMC Ping Bot
UBC Product Management Club slack workspace bot

* **User management**: Ping and assign workspace users by user groups i.e. @events, @leadership, @community, etc.
* Automated birthday message for workspace members

### Deprecation
Static sourcing from `roles.json` is deprecated in favor of fetching from the Supabase DB. 

## Features
<!-- COMMANDS_START -->

### Team-wide Mentions
**Tag all members of a department:** Mention any active department (e.g. `@tech`, `@events`, `@community`) in a message in any channel the bot is a member of.

### Commands
`/assign`: Assigns the user to the given department.

Usage: /assign <@slack_user> [department]
Only users with the `leadership` or `pres` role can use this command.

`/help`: Displays bot usage instructions.

Usage: /help

`/query`: Displays the target user's name, departments, and birthday.

Usage: /query <@slack_user>

`/unassign`: Removes the user from the given department or all departments.

Usage: /unassign <@slack_user> [department] or /unassign <@slack_user>
Only users with the `leadership` or `pres` role can use this command.

<!-- COMMANDS_END -->

When adding a command: Remember to register it in the [Slack App Dashboard](https://api.slack.com/apps/A08N0934MDG/slash-commands?saved=1).

## Environment
You will need the following variables in your `.env` to run the bot:
```
SLACK_BOT_TOKEN=xoxb-1234
SLACK_CLIENT_SECRET=xxx
SLACK_SIGNING_SECRET=xxx
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_PUBLIC_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

## Deployment
The UBC PMC instance is deployed on an EC2 instance. Contact tech@ubcpmc.com / Notion for access.

## To-do
* [Urgent] Allow users to view CRUD webUI through admin-portal integration
* [Non-urgent] Notion integration for birthday updates
