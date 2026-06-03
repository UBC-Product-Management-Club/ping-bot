# Geary Bot Features & Commands

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

### `/unassign`

Listens for the `unassign` command and removes the user from the given department or all departments.

Usage: /unassign <@slack_user> [department] or /unassign <@slack_user>
Only users with the `leadership` or `pres` role can use this command.

