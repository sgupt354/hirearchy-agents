/**
 * One-time: register the /reply slash command on the Hirearchy Discord application.
 * Usage (never print tokens): DISCORD_BOT_TOKEN=… DISCORD_APP_ID=… npx tsx scripts/register-commands.ts
 */
export {};

const token = process.env.DISCORD_BOT_TOKEN;
const appId = process.env.DISCORD_APP_ID;
if (!token || !appId) {
  console.error('Set DISCORD_BOT_TOKEN and DISCORD_APP_ID in the environment (do not commit them).');
  process.exit(1);
}

const res = await fetch(`https://discord.com/api/v10/applications/${appId}/commands`, {
  method: 'PUT',
  headers: { Authorization: `Bot ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([
    {
      name: 'reply',
      description: 'Answer your Hirearchy prep-circle prompt (yes, no, or a time like 8pm)',
      options: [{ name: 'text', type: 3, description: 'yes, no, or 8pm', required: true }],
    },
  ]),
});

if (!res.ok) {
  console.error('Discord command register failed', res.status);
  process.exit(1);
}
console.log('Registered /reply');
