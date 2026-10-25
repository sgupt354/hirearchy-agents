You are building Track 2 of our hackathon project in this NEW repo (hirearchy-agents).

## FIRST STEPS
1. This is a NEW repo for Track 2. Our Track 1 repo (sumedha092/hiring-pulse) must not be touched.
2. If supabase/schema.sql exists here, it is copied from Track 1 for REFERENCE ONLY. That schema is
   already deployed and live. Never drop or alter its tables or functions. Only ADD new Track 2 objects
   in a separate migration file: supabase/track2.sql.
3. Stack: React + Vite + TypeScript, Vitest for tests, Supabase JS for persistence. Tell me the plan in
   5 lines, then proceed without asking.
4. Use the EXISTING Supabase project (same URL/anon key, provided later via env vars VITE_SUPABASE_URL
   and VITE_SUPABASE_ANON_KEY). Prefix ALL new tables and functions with t2_. RLS on for every t2_
   table. t2_demo_reset() may only touch t2_ tables. Never modify Pulse objects. Never commit keys;
   add a .env.example only.

## THE PRODUCT (one line)
The moment a student lands an interview, their personal AI agent finds other students in the same
hiring pipeline who can cover their weak spots (while they cover others'), negotiates a time with
those students' agents, and shares names only once everyone says yes.

## CORE PRINCIPLES (non-negotiable)
- Each student has a SEPARATE agent instance with its own private profile, its own policy
  (permissions), and its own inbox. Agents decide accept/counter/reject/escalate themselves.
- A neutral BROKER only sees anonymized listings, finds matches/cycles, and relays messages. It never
  reads private profiles and never decides on anyone's behalf.
- All matching, scheduling, permissions, consent and state transitions are DETERMINISTIC CODE. The
  LLM is never used for those.
- Identity (name, contact) is PRIVATE and cannot be read through any function/API until ALL members of
  a circle have consented. Enforce this in the engine/data layer, not just the UI.
- Agents talk via structured events, not free text.
- Seed the starting conditions, but the engine must actually compute every result. Don't hardcode outcomes.

## DATA MODEL
AgentProfile:
{ agent_id, label (viewer-relative display e.g. "Applicant #2"), private: { name, email, discord_id,
  interview_date, stage, notes }, pipeline: { company, role }, stage_public: "interview"|"applied",
  offers: string[], needs: string[], availability: [{start:"HH:MM", end:"HH:MM"}],
  policy: { share_skills: bool, share_approx_availability: bool, share_exact_stage: bool,
  abstract_interview_date: bool, negotiate_schedule: bool, join_session: "ask",
  reveal_identity: "ask", share_contact: "ask", min_session_minutes: 45 } }

Privacy levels: PUBLIC (same pipeline), SHAREABLE (offers/needs/availability band if policy allows),
ABSTRACTABLE (interview_date -> "time-sensitive prep need"), PRIVATE (name/email/discord/notes).

Event (also the audit feed):
{ id, coordination_id, from, to, type, payload, disclosure: { shared:[], abstracted:[], withheld:[] },
  human_readable: string, created_at }
Types: TRIGGER, DISCOVER, FILTERED, PROPOSE, COUNTER, ACCEPT, REJECT, CONFLICT, ESCALATE, CONSENT,
DECLINE, DISSOLVED, REVEAL, COMPLETE

Coordination states:
IDLE -> TRIGGERED -> DISCOVERING -> MATCH_FOUND -> NEGOTIATING -> CONFLICT_FOUND ->
CONFLICT_RESOLVED -> AWAITING_HUMANS <-> COUNTERED -> AWAITING_CONSENT -> CONSENT_COMPLETE ->
IDENTITIES_REVEALED -> COMPLETED ; plus DECLINED -> DISSOLVED -> REDISCOVERING (back to MATCH_FOUND)

## SEED DATA (pipeline: Microsoft / SWE Intern), exactly 8 agents
1 Aditya  offers DSA            needs Behavioral     18:00-21:30  stage_public applied (becomes interview on trigger); share_exact_stage false
2 Sumit   offers Behavioral     needs System Design  19:00-21:00  interview
3 Maya    offers System Design  needs DSA            19:30-22:00  interview; abstract_interview_date true
4 Jordan  offers System Design  needs DSA            19:00-21:30  interview  (backup if Maya declines)
5 Decoy   offers DSA            needs DSA            19:00-21:00  -> filtered: no complementary skills
6 Decoy   offers Behavioral     needs DSA            08:00-10:00  -> its agent auto-REJECTS evening proposals
7 Decoy   offers System Design  needs Behavioral     evenings     share_skills false -> invisible to discovery
8 Decoy   pipeline Google/SWE   offers DSA needs Behavioral       -> filtered: different pipeline
Give each agent fake names/emails. Store the seed in one file. Provide resetDemo() that restores it exactly.

## ENGINE MODULES (small, pure, testable)
- policy: canShare(agent, field) / abstract(agent, field) / requiresHuman(agent, action)
- discovery: build anonymized listings from each agent's policy; filter by pipeline, stage, visibility;
  emit FILTERED events with reasons
- cycles: find 2-person reciprocal matches and 3-person cycles over a directed graph
  (edge A->B if A.offers ∩ B.needs ≠ ∅). Prefer a 3-cycle that includes the triggering agent.
- scheduler: intersect windows; return the window or CONFLICT if shorter than every member's
  min_session_minutes; validate a counter against each member's PRIVATE availability
- negotiation: each agent evaluates proposals against its own private data and policy and returns
  ACCEPT / REJECT (with reason) / ESCALATE
- consent: record per-member consent; reveal allowed only when ALL members consent; on any DECLINE ->
  DISSOLVED, never reveal the decliner to others ("one member couldn't join"), rerun discovery
  excluding them
- stateMachine: explicit transitions; reject invalid ones
- voice: turn structured proposals into a friendly message to the human using the Claude API
  (ANTHROPIC_API_KEY env var) with a 3-second timeout and TEMPLATE FALLBACK so the demo works offline.
  Also parse human replies like "8pm instead?" into a COUNTER {start:"20:00"} (regex first, LLM second).
- notify: in-app phone panel message; OPTIONAL Discord DM to Aditya behind a DISCORD_BOT_TOKEN env flag
  (skip silently if not set)
- ics: generate a downloadable .ics calendar file for the final circle

## GOLDEN PATH THE ENGINE MUST PRODUCE
1. TRIGGER: "Simulate interview invite" -> Aditya's stage becomes interview -> his agent wakes up
2. Discovery: 8 discovered -> #8 filtered (pipeline) -> #7 invisible (privacy) -> #5 filtered (no
   complementary skills) -> #6 rejects the evening window on its own -> cycle Aditya->Maya (DSA),
   Maya->Sumit (System Design), Sumit->Aditya (Behavioral). Jordan is held as the backup.
3. Disclosure events show: Maya's interview date abstracted to "time-sensitive"; Aditya's exact stage
   withheld; identities withheld for everyone.
4. Schedule: 18:00-21:30 ∩ 19:00-21:00 ∩ 19:30-22:00 = 19:30-21:00. Agents accept on their own
   (negotiate_schedule = true).
5. ESCALATE: joining requires a human -> each student gets a message with Accept / Counter / Decline
6. Maya counters "8pm?" -> 20:00-21:00 validated against all private ranges -> re-sent to humans
7. All three accept -> CONSENT_COMPLETE -> REVEAL (names swap in) -> COMPLETE with .ics
8. Backup branch: if Maya declines -> DISSOLVED, nothing revealed -> rediscovery finds Jordan ->
   19:00-21:00 -> humans asked again

## TESTS (write these BEFORE the UI; all must pass)
1. complementary skills match; non-complementary don't
2. 3-cycle Aditya->Maya->Sumit->Aditya found; no false cycle among decoys
3. different pipeline filtered; share_skills=false agent never appears in listings
4. intersection = 19:30-21:00
5. window shorter than 45 min -> CONFLICT, never a fake solution
6. counter 20:00 validated against every member's private range; invalid counter rejected
7. agent #6 auto-rejects an evening proposal
8. identity unreadable before full consent (test the data/API function, not the UI)
9. 2 of 3 consents -> no reveal
10. decline -> DISSOLVED -> Jordan found; decliner never named in any event visible to others
11. resetDemo() produces an identical run twice
Also add a script `npm run demo:run` that prints the full golden path as event lines.
STOP after this phase and show me the script output and test results before building UI.

## PERSISTENCE
Build the engine to run fully IN MEMORY first. Then write supabase/track2.sql with t2_agent_profiles,
t2_coordination_sessions, t2_coordination_members, t2_agent_events (RLS on, access only via functions,
same pattern as the existing Pulse schema). Private identity columns are only returned by a function
that checks full consent. Add t2_demo_reset(). Use Supabase Realtime on t2_agent_events for the live
UI when env vars are present; otherwise keep using in-memory state. If network access to Supabase
fails in this environment, don't get stuck: keep in-memory and tell me.

## UI (one page, judge-friendly, dark theme)
Left: network graph with 8 nodes from Aditya's view ("You", "Applicant #2", ...); filtered nodes greyed
out with a reason tooltip; cycle edges labeled with skills and animated when found; names fade in only
after REVEAL.
Right: "Agent Inspector" live feed of events with icons: ✓ match, ↗ shared, ≈ abstracted, 🔒 withheld,
⚠ conflict, ↔ negotiating, ⏸ human required, 🔓 revealed. A state badge on top.
Bottom: three phone-style panels (Aditya, Sumit, Maya) showing each student's private messages with
Accept / Counter (text box) / Decline buttons.
Controls: "📩 Simulate interview invite" (start), "Decline as Maya" (backup branch), hidden "Reset demo".
Final card: "Prep Circle Created ✓ · Microsoft SWE · 8:00-9:00 PM · DSA, Behavioral, System Design" with
a .ics download button.

## BUILD ORDER (stop and report after each)
1 seed + engine + tests + demo:run script  2 decline branch + reset  3 UI wired to engine
4 voice (Claude + fallback)  5 optional Discord DM + .ics  6 README with the one-liner, how to run
(npm install, npm run dev, npm test, npm run demo:run), and the demo steps.

Commit after each phase with a clear message and push to a branch. Keep code simple and readable.
No unrequested features. If something is ambiguous, pick the simplest option that keeps the golden
path working and note it in your report.
