# Progress — Track 2 (hirearchy-agents)

Full spec: [SPEC.md](SPEC.md). `main` = the shipped prep-circle demo. Active branch: **`feature/full-journey`**
(branched from `main` at `a3ce531`; not merged to `main` until reviewed).

## Full journey ("Hirearchy: your agent for the whole job hunt")
Hero line: "Find the job. Prep with your pipeline. Earn the referral. Your agent negotiates; you decide."
Key idea: "Your prep circle becomes your proof of work."

| Phase | Scope | Status |
|---|---|---|
| 0 | Journey shell, tab registry, `TabProps`, UI kit, global speed + Reset | ✅ done |
| B | Mock interview swap (`src/features/mock/`) | next |
| D | Trust ratings + evidence file (`src/features/trust/`) | todo |
| E | Referral Bridge (`src/features/referral/`) | todo |
| F | Polish, sabotage additions, browser checks, README | todo |
| G | Merge `aditya/journey` (only on "merge Aditya") | waiting |

### Contract for Aditya (branch `aditya/journey`: Find, Pipeline, Intel)
- Each tab is a React component taking `TabProps` from `src/features/types.ts`:
  `export type TabProps = { speed: "slow" | "normal" | "fast"; resetKey: number };`
  Reset your tab's state whenever `resetKey` changes; read pacing from `SPEEDS[speed]` (`src/app/speed.ts`).
- Suggested exports: `FindTab` from `src/features/find/index.tsx`, `PipelineTab` from `src/features/pipeline/`,
  `IntelTab` from `src/features/intel/`. At merge they replace the `soon(...)` placeholders in `src/app/tabs.tsx`.
- Reusable UI: import from `src/ui/kit.ts` (PhoneFrame, IPhone, ChatBubble, TypingIndicator, QuickReplies,
  NotificationBanner, CalendarCard, useChatReveal, Drawer, UnderTheHood, Inspector, JudgeLegend, Graph, lenses,
  12-hour time helpers, SPEEDS). Styles are global in `src/ui/styles.css`.
- For the evidence file: please export a function or count for "intel reports contributed" per student;
  it gets wired in at merge (Phase G).
- Off-limits for Sumedha's side: `src/features/{find,pipeline,intel}/`, `tests/features/{find,pipeline,intel}/`.

### Phase 0 — done
- `src/app/Shell.tsx`: top nav tabs in order Find · Pipeline · Prep circle · Mock interview · Intel · Referral; opens
  on Prep circle. Global speed control and global Reset (bumps `resetKey` for every tab). Tab panels stay mounted
  and are only hidden, so switching tabs never interrupts a run.
- `src/app/tabs.tsx`: the registry. Find, Pipeline, Intel (Aditya) and Mock interview, Referral (later phases)
  show a "Coming soon" card.
- Prep circle moved into `src/features/prep/PrepCircleTab.tsx`, behavior unchanged; its "See what the agents are
  doing" button moved from the top bar into the tab's hero.
- `src/ui/chat.tsx` splits the phone into reusable pieces (same markup and classes); `src/ui/Drawer.tsx` is a
  generic drawer; `src/ui/kit.ts` re-exports the kit.
- Verified: 133 tests (131 + 2 registry tests), test:sabotage 6/6, typecheck, build, demo:run. Browser at
  1440×900 and 1280×800: prep golden path and decline branch inside the tab (no page scroll), tab switch mid-run
  keeps the run going, every placeholder renders, global Reset from another tab gives a page identical to a fresh
  load, no console errors.


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
- **Integration stubs + demo polish.** `src/ui/integrationsStub.ts` with the agreed signatures
  (`parseInvite`, `generateMessage`, `notifyPhone`, `downloadIcs`). Structured phone messages go through
  `generateMessage` (engine template as fallback); Aditya's "human required" messages call `notifyPhone`;
  the .ics button works via `downloadIcs`. "📩 Paste an interview invite" box (calls `parseInvite`, starts the
  run only for a Microsoft / SWE Intern interview, otherwise "Not an interview invite"). Slow / Normal / Fast
  playback. Reset returns to the exact start state (verified in a browser: page identical to a fresh load,
  both mid-replay and after a completed run).
- **Paste-invite fix.** `parseInvite` returning null -> "Not an interview invite". A real invite for another
  pipeline -> "Interview invite detected: <Company> / <Role>. No agents in this pipeline yet; the demo network is
  Microsoft SWE Intern." (no run started). Microsoft / SWE Intern starts the run.
- **Judge legend** (now at the top of the Under the hood drawer): three toggle chips (⚠ Conflicting constraints, ↗ What's shared,
  ⏸️ When humans are asked) that outline the matching events and fade the rest. Pure UI.
- **Phase 6 — README**: one-liner, tagline, screenshots, judging-criteria mapping, privacy proof, how to run,
  demo steps, architecture diagram, team.
- **`npm run test:sabotage`**: plants 6 privacy bugs one at a time and checks the suite catches each (all 6 caught).
- **Consumer redesign (UI only; `src/engine`, `tests/` and `scripts/` untouched, 36/36 tests still pass).**
  Landing hero ("Hirearchy"), three iMessage-style iPhones as the default student view (typing dots, iOS
  notification banner before anything that needs the human, quick-reply chips ✅ I'm in / 🕗 Suggest a time / Not
  this time with an inline time picker, blue reply bubbles, a calendar-invite card with a 🔓 unlock of avatars and
  names plus Add to calendar). Graph + agent feed moved into an "Under the hood" drawer with plain-English event
  titles, a raw-type tag, a compact "Shared · Summarized · Hidden" line that expands, a green "Window agreed",
  filter reasons next to the greyed nodes, and the judging-lens chips on top. "Paste a real invite" opens a modal
  ("Check invite"). Verified in Chromium at 1440×900 and 1280×800: no page scroll in the student view (four phones
  fit in the decline branch too), no "->", no 24-hour times and no raw ids in any visible text, no console errors,
  and Reset (mid-run, drawer open, lens on) gives a page identical to a fresh load.
- **Merged `aditya/integrations`** (3 commits: invite parsing + .ics, message generation with privacy fallbacks,
  Discord notifications). No conflicts: Aditya only added files. Reviewed before merging: no secrets, API keys
  or webhook URLs anywhere in its history (only env reads and obvious test fakes).
- **Wired up** through `src/ui/integrations.ts`: real `parseInvite`, `notifyPhone`, `downloadIcs` and (opt-in)
  `generateMessage` from `src/integrations`, with `integrationsStub.ts` as the fallback if a call throws. Phone
  text defaults to the `copy.ts` student copy; `VITE_USE_LLM_COPY=true` switches structured messages to Claude.
- 131 Vitest tests, all passing (our 36 + Aditya's 95); `api/` is now included in `npm run typecheck`.

## Team / ownership
- **Sumedha:** engine, UI (`src/engine/`, `src/ui/`, `scripts/`, `tests/*.test.ts`).
- **Aditya:** integrations and deployment (`src/integrations/`, `api/`, `tests/integrations/`). Merged.
- Don't edit `api/` or `src/integrations/` from the engine/UI side; the UI only uses them through
  `src/ui/integrations.ts`.
- `supabase/track2.sql` stays as written and is **not wired**.

## For Aditya (found while reviewing the merge; not changed, since these are his files)
- `api/voice.ts` hardcodes `MODEL = 'claude-sonnet-4-5'`. The current Sonnet is `claude-sonnet-5-5`; if the old
  id is retired, every call errors and silently falls back to templates. Suggest updating it.
- His tests live in `tests/integrations/`, outside the agreed `api/` + `src/integrations/` paths. Kept: they're
  new files that only test his module.
- His `generateMessage` fallback reads `details.start` / `details.end`; the engine sends `details.window`. The
  UI adapter now adds `start` / `end`, so the fallback text includes the time.

## Open issue: requester id in track2.sql (must fix before wiring Supabase)
`t2_get_identity`, `t2_record_consent`, `t2_get_events` and `t2_append_event` take the requester / agent id as a
plain parameter and are executable by `anon`. The consent gate itself holds (no identity until every member has
accepted), but any caller can claim to be any agent: record a "yes" for someone else, read another agent's
events, or append events as them. Fix before connecting: derive the caller's agent from `auth.uid()` (a
`t2_agent_profiles.user_id` column checked inside each function), or call these functions only from a server
route with the service key. Left as is for now, per instruction.

## In progress
- `feature/full-journey`: Phase B (mock interview swap) next.

## Exact next step
Deploy to Vercel (see README → Deployment) with `ANTHROPIC_API_KEY`, `DISCORD_WEBHOOK_URL` and, optionally,
`VITE_USE_LLM_COPY=true`. Then run the README demo steps on the deployed URL to confirm `/api/voice` and
`/api/notify` work with real keys.

## How to run
```
npm install
npm run typecheck  # TypeScript over src, api, tests and scripts
npm test           # all tests (engine, UI view model, integrations, api handlers)
npm run demo:run   # prints the golden path and the backup branch as event lines
npm run dev        # UI at http://localhost:5173 (runs the tests first to refresh the Privacy proof badge)
npm run build      # typecheck + production build
npm run test:badge # rerun tests and rewrite src/ui/test-summary.json
npm run test:sabotage # plant privacy bugs one at a time; every one must be caught
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
- **#6's rejection now also emits a FILTERED event to Aditya**, so Aditya's graph can grey #6 out with a reason
  (the REJECT itself only goes to the broker).
- **Graph uses only events visible to Aditya; the Inspector shows the full audit log** (with routing on
  every line so judges can see who received what). After a decline, the graph never marks who left.
- **Live replay:** the engine is synchronous; the UI replays new events at 260 ms each. Phones update and
  buttons enable once the replay catches up.
- **Phone headers use persona names** ("Maya's phone"): each is that student's own device, and the spec
  asks for "Decline as Maya". Names on the graph come only from `getIdentity()`.
- **Jordan's phone appears only after Jordan gets a message**, so the backup circle can be completed.
- **Final card reads "Microsoft SWE Intern"** (from the pipeline data), not "Microsoft SWE".
- **.ics button is shown but disabled** until phase 5. *Superseded: now enabled via the `downloadIcs` stub.*
- **Privacy proof badge** reads `src/ui/test-summary.json`, written by `npm run test:badge` from a real
  Vitest run (runs automatically before `dev` and `build`; committed so it shows without running).
- **track2.sql security caveat:** functions are executable by `anon` and take the requester as a parameter.
  The consent gate still holds, but anyone could call `t2_record_consent` for anyone. Before connecting it,
  requester should be bound to `auth.uid()` (or calls moved server-side).
- **Supabase wiring skipped** per instruction; `@supabase/supabase-js` is not installed.

Integration-stub decisions:
- **Engine phone messages now carry `kind` + `details`** (proposal / counter / reveal / complete) next to the
  template `text`. One template function (`messageText` in `src/engine/voice.ts`) produces the fallback, and the
  stub's `generateMessage` calls the same function. A test checks they match for every structured message.
- **"Counter" kind covers all counter feedback:** proposing, rejected by another member, outside your own
  hours, and unreadable reply.
- **Not routed through `generateMessage`:** plain status lines that don't fit the four kinds (welcome on invite,
  "You accepted", "You declined", "One member couldn't join"). They show the engine text directly.
- **`notifyPhone` is called for every Aditya message that needs Aditya's action** (the proposal, the updated time,
  and a rejected counter), once per message, with the generated text.
- **Reveal details include names/emails/Discord** (only after full consent). When `generateMessage` becomes a
  server call, those identities leave the browser; that's fine post-consent but worth knowing.
- **.ics stub:** date is today's local date (the seed has no session date); time is the agreed window;
  description lists skills and the revealed member names. Floating local time, no timezone.
- **Paste invite:** the stub's `parseInvite` is a keyword match (needs "interview", a known company, and no
  rejection wording). Anything other than Microsoft / SWE Intern shows "Not an interview invite", as asked.
  The run it starts is the same golden path as the Simulate button.
- **Speed:** Slow 700 ms, Normal 260 ms, Fast 80 ms per event. It's a presenter setting, so Reset keeps it.
- **Reset** also drops in-flight async results (message generation, invite parsing) from the previous run, clears
  the invite box and status, and remounts the phones so typed counters are cleared.

Final-polish decisions:
- **Invite outcomes** live in a pure `inviteOutcome()` in `src/ui/view.ts` (tested). Rule: null -> "Not an interview
  invite"; any non-null result is treated as a real invite, as you specified. If Aditya's `parseInvite` can return a
  non-interview stage (e.g. "applied"), that would still read "Interview invite detected"; a stage check is one line.
  A Microsoft invite for a different role (e.g. "SWE") gets the "detected" message, not a run.
- **Judge legend lenses** (`matchesLens` in `src/ui/view.ts`, tested): conflict = CONFLICT / COUNTER / REJECT (this
  includes the ✓ "Common window found" event, since it is a CONFLICT event with `resolved: true`); shared = any
  non-empty disclosure; humans = ESCALATE / CONSENT. Chips toggle independently; with several on, an event takes the
  colour of the first matching lens. Turning a lens on scrolls the feed to its first match. Reset turns lenses off.
- **⏸️ uses the emoji form** (with a variation selector) because the plain character rendered as a bar.
- **Sabotage tests** were added so the README's privacy claim is reproducible. They edit engine files temporarily and
  always restore them (also on Ctrl-C). If the engine code changes, a sabotage that no longer applies fails loudly.
- **README screenshots** (`docs/`) were taken from the real app with Playwright; the Mermaid diagram was checked to
  render.

Consumer-redesign decisions:
- **Student copy lives in the UI** (`src/ui/copy.ts`). The stub's `generateMessage` must keep returning the engine
  template (a test checks they match), so the phones show the UI's short student copy whenever `generateMessage`
  returns exactly the template. Once Aditya's real `generateMessage` returns its own wording, that wording is shown
  instead (with times and arrows normalised).
- **The under-the-hood feed is rebuilt from structured payloads**, not the engine's `human_readable` strings, so it can
  use 12-hour times, → arrows and labels. The engine strings are unchanged (demo:run and the event log still use them).
- **Phones replay in step with the feed.** `messagesAvailable()` (added to `src/ui/view.ts`; existing functions
  unchanged) ties each phone message to the event that produced it, so Aditya's congrats appears at the start and
  each request arrives when its event does.
- **"Decline as Maya" button removed**: tapping **Not this time** on Maya's phone is the same action, in the product's
  own UI. Jordan's phone appears only once Jordan's agent sends a message.
- **Calendar card uses `getIdentity(owner, member)`** for every avatar and name, so names still come only through the
  consent gate. The owner's own avatar shows their initials, labelled "You".
- **Time picker chips** are fixed at 7:30, 8:00 and 8:30 PM, as specified. 7:30 PM equals the current start, so it
  re-confirms the same window, which is harmless. Free text goes through the engine's own counter parser.
- **Status-bar clock and message timestamps use the real local time**; the .ics date is still today.
- **Escape closes the drawer and the modal.** The drawer covers the corner controls, so close it before Reset.
- **No new tests**, per instruction. The redesign was verified with scripted Playwright runs instead.
- **README** demo steps and screenshots were updated to the new UI.

Merge decisions:
- **Adapter instead of a direct import.** `src/ui/integrations.ts` calls the real module and falls back to the stub
  only if a call throws. Aditya's functions already never throw (they return their own fallbacks), so the stub is a
  second safety net. `integrationsStub.ts` and its tests stay.
- **Default phone copy is `copy.ts`.** `generateMessage` is not called at all unless `VITE_USE_LLM_COPY=true`. In LLM
  mode a structured message is held until its wording arrives (at most ~3 s, his timeout) so bubbles never flicker
  between two wordings. Plain status lines (welcome, "You're in", dissolved) always use `copy.ts`.
- **`notifyPhone` sends the text the student actually sees** (the student copy, or Claude's wording in LLM mode).
- **In LLM mode the reveal message includes names and contacts** (it's past consent, and his server passes reveal
  details through by design). Default mode shows "Names are unlocked" plus the calendar card instead.
- **Invite outcomes now use his parser.** It's stricter than the stub (it needs an invite phrase, a known company and a
  known role) and returns "Software Engineer" rather than "SWE" for non-intern roles. Our three outcome messages
  are unchanged.
- **`prettify` also normalises "7:30 PM–9:00 PM"** (en dash), which his fallback produces.
- **`.gitignore` now ignores every `.env*` file except `.env.example`**, plus `.vercel/`.
- **Verified locally**, where `/api/*` returns 404: default mode (golden path, decline branch, three invite outcomes,
  reset) and LLM mode with the API down, mocked-working and hanging past the 3-second timeout. All complete with
  no console errors besides the expected 404s.
