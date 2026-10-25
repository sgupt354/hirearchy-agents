# Live Discord mode

Aditya's agent really messages them in Discord, two-way. When the prep-circle run needs them, the bot DMs them the
same message their simulated phone shows, with **✅ I'm in · 🕗 Suggest a time · Not this time** buttons. "Suggest a
time" turns into a 7:30 / 8:00 / 8:30 PM picker. Their answer is applied to the engine exactly as if they'd tapped it
on the simulated phone (their phone shows it as "· via Discord").

Live mode is opt-in: open the demo app with **`/app/?live=1`** (`/?live=1` redirects there). Without it nothing changes. If anything is missing or
failing, the page says **"Live mode unavailable, using simulated phone"** and the demo carries on.

```
browser (?live=1) ──POST /api/live-notify──▶ Discord DM with buttons ──▶ Aditya taps
      ▲                                                                       │
      └──GET /api/live-state every 1.5 s◀── Supabase t2_live_replies ◀──POST /api/discord-interactions
                                                                      (signature-verified)
```

| Function | Does |
|---|---|
| `api/live-notify.ts` | Builds the DM text on the server from validated fields and sends it with the buttons |
| `api/discord-interactions.ts` | Discord's Interactions Endpoint: verifies the Ed25519 signature (node:crypto), answers PING, accepts only Aditya's clicks, stores their answer (first answer wins) |
| `api/live-state.ts` | `?health=1` says whether live mode is configured; `?session=…&prompt=…` returns their stored answer |

Storage is the existing Supabase project (`supabase/live.sql`: one `t2_live_replies` table, RLS on, two functions
executable by `service_role` only). The functions call it with the service-role key, server-side.

---

## Setup, in this order

The Interactions Endpoint must already be deployed **with `DISCORD_PUBLIC_KEY` set** before the URL is saved in the
Developer Portal: Discord checks it immediately with a signed PING and a deliberately bad signature.

### 1. Discord Developer Portal (Aditya)

1. Go to <https://discord.com/developers/applications> → **New Application** → name it `Hirearchy Agent` → Create.
2. **General Information:** copy **Application ID** → `DISCORD_APP_ID`, and **Public Key** → `DISCORD_PUBLIC_KEY`.
   Leave *Interactions Endpoint URL* empty for now (step 5).
3. **Bot:** click **Reset Token** → copy it → `DISCORD_BOT_TOKEN` (shown once; treat it like a password). No
   privileged gateway intents are needed.
4. **Invite the bot to a server Aditya is in** (a bot can only DM people it shares a server with). Open, with your
   Application ID filled in:
   `https://discord.com/oauth2/authorize?client_id=<DISCORD_APP_ID>&scope=bot&permissions=2048`
   (2048 = Send Messages) → pick the server → Authorize.
   Aditya must allow DMs from that server's members: right-click the server → **Privacy Settings** → turn on
   **Direct Messages**.
5. **Aditya's user id:** Discord → User Settings → Advanced → turn on **Developer Mode**; then right-click their own
   name → **Copy User ID** → `DISCORD_ADITYA_USER_ID`.

### 2. Supabase (Sumedha)

1. Supabase dashboard → SQL editor → run **`supabase/live.sql`** once (additive; touches only `t2_live_replies`
   and two `t2_live_*` functions).
2. Project Settings → API: copy **Project URL** → `SUPABASE_URL` and the **service_role** key →
   `SUPABASE_SERVICE_ROLE_KEY`. Server-side only: never prefix it with `VITE_`.

### 3. Vercel environment variables (Production)

| Variable | Secret? | From |
|---|---|---|
| `DISCORD_APP_ID` | no | Portal → General Information |
| `DISCORD_PUBLIC_KEY` | no (but required) | Portal → General Information |
| `DISCORD_BOT_TOKEN` | **yes** | Portal → Bot → Reset Token |
| `DISCORD_ADITYA_USER_ID` | no | Discord → Copy User ID |
| `SUPABASE_URL` | no | Supabase → Project Settings → API (`VITE_SUPABASE_URL` also works) |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Supabase → Project Settings → API |

Set them in the Vercel dashboard (Project → Settings → Environment Variables → Production) or from the CLI:

```bash
npx vercel env add DISCORD_APP_ID production
npx vercel env add DISCORD_PUBLIC_KEY production
npx vercel env add DISCORD_BOT_TOKEN production
npx vercel env add DISCORD_ADITYA_USER_ID production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
```

None of them are `VITE_` variables: they never reach the browser. Env changes only apply to the **next** deploy.

### 4. Deploy (Sumedha's laptop)

```bash
git fetch origin
git checkout feature/full-journey
git pull origin feature/full-journey
npx vercel --prod
```

Check the endpoints exist and are configured:

```bash
curl -s "https://hirearchy-agents.vercel.app/api/live-state?health=1"
#   {"ok":true}                     ← all six variables set and storage reachable
curl -s -X POST https://hirearchy-agents.vercel.app/api/discord-interactions -d '{}'
#   {"error":"invalid_signature"}   ← endpoint is up and has the public key (503 = env missing)
```

### 5. Set the Interactions Endpoint URL (Aditya)

Portal → General Information → **Interactions Endpoint URL** →
`https://hirearchy-agents.vercel.app/api/discord-interactions` → **Save Changes**. Discord verifies it on save.

### 6. Run it

Open **<https://hirearchy-agents.vercel.app/app/?live=1>** → the Prep circle tab shows **"Live: Aditya is on Discord"**
→ click **📩 Aditya just got a Microsoft interview invite →**. When the circle is found, Aditya gets the DM. Their
taps drive their side; Sumit and Maya still use their simulated phones.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Portal: "interactions endpoint URL could not be verified" | Not deployed yet, `DISCORD_PUBLIC_KEY` missing or wrong, or env set after the last deploy (redeploy) |
| Badge says "Live mode unavailable" | `?health=1` isn't `{"ok":true}`: a variable is missing, or env changed without a redeploy |
| Badge is live but no DM arrives | Bot not in a server with Aditya, their DMs from that server are off, or wrong `DISCORD_ADITYA_USER_ID` |
| Buttons say "These buttons belong to the student this agent works for" | Someone other than `DISCORD_ADITYA_USER_ID` pressed them |
| Buttons answer "I couldn't save that" | Supabase unreachable, `supabase/live.sql` not run, or wrong service-role key |

## Safety notes
- Every interaction is signature-checked; only Aditya's user id is accepted; answers are stored first-wins.
- The DM text is built server-side from a fixed template and a whitelist of short fields, so `/api/live-notify`
  can't be used to send arbitrary text. It can only ever DM `DISCORD_ADITYA_USER_ID`.
- `/api/live-notify` has no auth (it's a public demo), so someone who finds it could trigger repeat prompt DMs to
  Aditya. Acceptable for a demo; for real use, put it behind a session token.
- Stored rows hold only a random session id, a prompt number and the action; they expire after a day.
