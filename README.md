# PMC Ping Bot
UBC Product Management Club internal slack bot

* Ping workspace users by user groups i.e. @events, @leadership, @community, etc.
* Automated birthday message for workspace members

### Deprecation
Static sourcing from `roles.json` is deprecated in favor of fetching from the Supabase DB. 

<!-- COMMANDS_START -->

## Features

### Role Pinging / Mentions
**Tag all members of a department:** Mention any active department (e.g. `@tech`, `@events`, `@community`) in a message in any channel the bot is a member of.

## Commands

### `/assign`

Listens for the `assign` command and assigns the user to the given department.

Usage: /assign <@slack_user> [department]
Only users with the `leadership` or `pres` role can use this command.

### `/help`

Listens for the `help` command and displays bot usage instructions.

Usage: /help

### `/remove`

Listens for the `remove` command and removes the user from the given department or all departments.

Usage: /remove <@slack_user> [department] or /remove <@slack_user>
Only users with the `leadership` or `pres` role can use this command.

<!-- COMMANDS_END -->

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
