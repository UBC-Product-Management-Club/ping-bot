## PMC Ping Bot
UBC Product Management Club internal slack bot

* Ping workspace users by user groups i.e. @events, @leadership, @community, etc.
* Automated birthday message for workspace members

### Deprecation
Static sourcing from `roles.json` is deprecated in favor of fetching from the Supabase DB. 

### Environment
You will need the following variables in your `.env` to run the bot:
```
SLACK_BOT_TOKEN=xoxb-1234
SLACK_CLIENT_SECRET=xxx
SLACK_SIGNING_SECRET=xxx
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_PUBLIC_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### Deployment
The UBC PMC instance is deployed on an EC2 instance. Contact tech@ubcpmc.com / Notion for access.
