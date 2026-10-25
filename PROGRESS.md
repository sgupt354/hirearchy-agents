# Progress — Track 2 (hirearchy-agents)

Full spec: [SPEC.md](SPEC.md). Branch: `claude/focused-archimedes-i453fr`.

## Done
- **Phase 1 — seed + engine + tests + demo:run.** `src/engine/`: seed, policy, discovery, cycles,
  scheduler, negotiation, consent, stateMachine, voice (template + regex counter parse), identity vault,
  event log, `Agent` (one instance per student), `Broker` (listings only), `Engine` (in-memory runtime).
- **Phase 2 — decline branch + reset.** Decline -> DISSOLVED -> rediscovery finds Jordan; `resetDemo()`.
- **Phase 3 — UI wired to the engine.** One dark page: network graph from Aditya's view (filtered nodes
  greyed with reasons, animated cycle edges with skill labels, names fade in only after REVEAL via
  `getIdentity()`), Agent Inspector feed with icons + disclosure chips + state badge, phones with
  Accept / Counter / Decline, final card, "Privacy proof" badge, hidden ↺ reset (bottom right).
- Golden path shows the conflict explicitly: ⚠ "Schedules conflict: #1 18:00-21:30, #2 19:00-21:00,
  #3 19:30-22:00 — no one's full window works for everyone" -> ↔ "Agents negotiating overlap" ->
  ✓ "Common window found: 19:30-21:00" (CONFLICT_FOUND -> CONFLICT_RESOLVED).
- `supabase/track2.sql` written (t2_ tables, RLS on, functions only). **Not connected** — the app is in-memory only.
  Checked by running it on PGlite (Postgres in WASM): seed loads, identity locked at 2/3 consents, open at 3/3.
- 28 Vitest tests, all passing.

## In progress
- Nothing. Waiting for go-ahead on phase 4.

## Exact next step
Phase 4 — voice: Claude API rewrite of the template phone messages (ANTHROPIC_API_KEY, 3s timeout,
template fallback) and LLM fallback for counter parsing when the regex finds no time.

## How to run
```
npm install
npm test           # all engine tests
npm run demo:run   # prints the golden path and the backup branch as event lines
npm run dev        # UI at http://localhost:5173 (runs the tests first to refresh the Privacy proof badge)
npm run build      # typecheck + production build
npm run test:badge # rerun tests and rewrite src/ui/test-summary.json
```

## Decisions
Ambiguity calls from phases 1–2:
1. **Maya over Jordan.** Both form a valid 3-cycle with Aditya and Sumit; Jordan's window is actually
   longer (2h vs 90m). Ranking is: 3-cycles first, then listing order of the other members (#3 before #4).
2. **How #6 "rejects on its own".** #6 keeps availability private (`share_approx_availability=false`),
   so the broker must ask its agent about 18:00-21:30, and the agent rejects against its private hours.
3. **#5's "no complementary skills" rule.** Filtered when everything it needs is something it already offers.
4. **One Accept = join + reveal name + share contact.** No second consent round. AWAITING_CONSENT means
   at least one (not all) accepted. A counter resets consents, so all three accept again.
5. **No conflict on the golden path** (phases 1–2). *Superseded in phase 3 by your instruction*: a conflict is
   now raised whenever the circle's shared windows differ, then resolved by negotiating the overlap.
6. **Rediscovery reuses cached listings** (no re-poll of all 8 agents). The decliner is never named in any
   event others can see, though others can infer it by comparing old and new circles.
7. **interview_date is never shared raw** — abstracted to "time-sensitive prep need" or withheld.
   A bare hour like "8" in a counter is read as PM.
8. **Phases 1 and 2 shipped in one commit**, because tests 10 and 11 need the decline/reset code.

Other decisions:
- Agents talk only through structured events; the broker delivers an event and logs each agent's reply.
- Event `to` is a list of recipients; "visible to X" means X sent or received it.
- Identity lives in an `IdentityVault`; `Engine.getIdentity()` is the only read path and throws
  `IdentityLockedError` unless requester and target are members and every member consented.
- Event ids and timestamps are deterministic so reruns are byte-identical.
- Approximate availability = private windows widened to 30-minute boundaries.
- Conflict = overlap shorter than the largest `min_session_minutes` in the circle.
- No `supabase/schema.sql` exists in this repo, so `track2.sql` follows a standard RLS-on, functions-only pattern.

Phase 3 decisions:
- **Conflict rule:** CONFLICT when circle members' shared windows aren't identical; resolved when the
  overlap meets every minimum and every agent accepts it. If all windows match, there's no conflict
  (NEGOTIATING -> AWAITING_HUMANS, tested).
- **"Resolved" is a CONFLICT event with `payload.resolved = true`**, so the event types stay exactly the
  14 in the spec. The feed and demo:run show it with ✓.
- **#6's rejection now also emits a FILTERED event to Aditya**, so his graph can grey #6 out with a reason
  (the REJECT itself only goes to the broker).
- **Graph uses only events visible to Aditya; the Inspector shows the full audit log** (with routing on
  every line so judges can see who received what). After a decline, the graph never marks who left.
- **Live replay:** the engine is synchronous; the UI replays new events at 260 ms each. Phones update and
  buttons enable once the replay catches up.
- **Phone headers use persona names** ("Maya's phone"): each is that student's own device, and the spec
  asks for "Decline as Maya". Names on the graph come only from `getIdentity()`.
- **Jordan's phone appears only after Jordan gets a message**, so the backup circle can be completed.
- **Final card reads "Microsoft SWE Intern"** (from the pipeline data), not "Microsoft SWE".
- **.ics button is shown but disabled** until phase 5.
- **Privacy proof badge** reads `src/ui/test-summary.json`, written by `npm run test:badge` from a real
  Vitest run (runs automatically before `dev` and `build`; committed so it shows without running).
- **track2.sql security caveat:** functions are executable by `anon` and take the requester as a parameter.
  The consent gate still holds, but anyone could call `t2_record_consent` for anyone. Before connecting it,
  requester should be bound to `auth.uid()` (or calls moved server-side).
- **Supabase wiring skipped** per instruction; `@supabase/supabase-js` is not installed.
