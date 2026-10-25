# Progress — Track 2 (hirearchy-agents)

Full spec: [SPEC.md](SPEC.md). Branch: `claude/focused-archimedes-i453fr`.

## Done
- **Phase 1 — seed + engine + tests + demo:run.** `src/engine/`: seed, policy, discovery, cycles,
  scheduler, negotiation, consent, stateMachine, voice (template + regex counter parse), identity vault,
  event log, `Agent` (one instance per student), `Broker` (listings only), `Engine` (in-memory runtime).
- **Phase 2 — decline branch + reset.** Decline -> DISSOLVED -> rediscovery finds Jordan; `resetDemo()`.
- 24 Vitest tests covering the 11 required cases (all passing).

## In progress
- Phase 3 — UI wired to the engine (graph, inspector, three phones, final card), plus:
  explicit golden-path conflict events, `supabase/track2.sql` as a file only, "Privacy proof" badge.

## Exact next step
Add the explicit CONFLICT -> negotiating -> CONFLICT_RESOLVED events to the broker and a test for them.

## How to run
```
npm install
npm test           # all engine tests
npm run demo:run   # prints the golden path and the backup branch as event lines
npm run dev        # UI (from phase 3)
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
5. **No conflict on the golden path** (phases 1–2): NEGOTIATING -> AWAITING_HUMANS; conflict states only
   when the overlap is too short. *Superseded in phase 3: the golden path now shows the conflict explicitly.*
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
