# Progress — Track 2 (hirearchy-agents)

Full spec: [SPEC.md](SPEC.md). `main` = the shipped prep-circle demo. Active branch: **`feature/full-journey`**
(branched from `main` at `a3ce531`; not merged to `main` until reviewed).

## Full journey ("Hirearchy: your agent for the whole job hunt")
Hero line: "Find the job. Prep with your pipeline. Earn the referral. Your agent negotiates; you decide."
Key idea: "Your prep circle becomes your proof of work."

| Phase | Scope | Status |
|---|---|---|
| 0 | Journey shell, tab registry, `TabProps`, UI kit, global speed + Reset | ✅ done |
| B | Mock interview swap (`src/features/mock/`) | ✅ done |
| Live | Live Discord mode for Aditya (`?live=1`), before D/E per the organizers | ✅ done (needs setup, see LIVE_DISCORD.md) |
| D | Trust ratings + evidence file (`src/features/trust/`) | ✅ done |
| E | Referral Bridge (`src/features/referral/`) | ✅ done |
| F | Polish, sabotage additions, browser checks, README | ✅ done |
| G | Merge `aditya/journey` (done early, at `da49902`) | ✅ done |

### Contract for Aditya (branch `aditya/journey`: Find, Pipeline, Intel)
- Each tab is a React component taking `TabProps` from `src/features/types.ts`:
  `export type TabProps = { speed: "slow" | "normal" | "fast"; resetKey: number };`
  Reset your tab's state whenever `resetKey` changes; read pacing from `SPEEDS[speed]` (`src/app/speed.ts`).
- Suggested exports: `FindTab` from `src/features/find/index.tsx`, `PipelineTab` from `src/features/pipeline/`,
  `IntelTab` from `src/features/intel/`. At merge they fill the `Component: null` entries in `src/app/tabs.tsx`,
  and each tab appears in the nav automatically.
- Reusable UI: import from `src/ui/kit.ts` (PhoneFrame, IPhone, ChatBubble, TypingIndicator, QuickReplies,
  NotificationBanner, CalendarCard, useChatReveal, Drawer, UnderTheHood, Inspector, JudgeLegend, Graph, lenses,
  12-hour time helpers, SPEEDS). Styles are global in `src/ui/styles.css`.
- For the evidence file: please export a function or count for "intel reports contributed" per student;
  it gets wired in at merge (Phase G).
- Off-limits for Sumedha's side: `src/features/{find,pipeline,intel}/`, `tests/features/{find,pipeline,intel}/`.

### Deploy prep: placeholder tabs hidden
- The nav shows only tabs with a real component (`VISIBLE_TABS` in `src/app/tabs.tsx`): currently **Prep circle** and
  **Mock interview**; default stays Prep circle. Find, Pipeline, Intel and Referral have `Component: null` and appear
  automatically once a component is registered. The "Coming soon" card was removed.
- To be deployed from `feature/full-journey` (see LIVE_DISCORD.md for the order).

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

### Phase B — Mock interview swap: done (`src/features/mock/`, `tests/features/mock/`)
- **Match rules (deterministic):** same pipeline AND round, at least 60 minutes free together, compatible difficulty
  preference, never a 3rd mock with the same person, complementary weak areas ranked first (then reliability, a
  hook Phase D fills in, then listing order). Pipeline, round, difficulty and time are filtered by the broker from
  anonymized listings. The repeat limit is checked by the seeker's own agent against its private practice
  history; the broker only sees "skip".
- **Engine reuse:** listings via `buildListing` (strong areas = `offers`, weak = `needs`), time via the scheduler
  (`schedule`), each agent decides with `evaluateSchedule` / `evaluateJoin`, consent via the consent functions,
  names via `IdentityVault`, feed via `EventLog`, and a feature state machine (`src/features/shared/machine.ts`)
  that throws the engine's `InvalidTransitionError`.
- **Golden path:** Aditya (Microsoft technical) → #2 other round, #6 only 30 min together, #7 wants hard, #8 Google
  are filtered; #3 Maya is skipped on Aditya's private repeat limit (practiced twice); Jordan is picked over Priya
  (covers DSA + System Design both ways). 7:00–8:00 PM, both agents accept, both humans say yes, names unlock.
  Round 1: Aditya interviews Jordan with DSA questions; round 2: Jordan interviews Aditya with System Design
  questions. Each side scores the other (4-part rubric, 1–5) plus one note.
- **Question packs** come from seeded anonymized reports (`questions.ts`, no author fields) for that company and
  round: the interviewee's weak areas first, then their difficulty. Interviewees never see their own questions.
- **Scores** live only in `ScoreVault`: readable by the person scored, or by someone they grant. Never in events
  or on the other person's phone. Practice self-scores are kept but excluded from peer averages.
- **Fallback:** "Practice with your agent" is offered only in `NO_PEER` (no one fits, or every peer declined):
  a scripted mock from the question pack, then a private self-assessment. Demo: "See Riya's Google round".
- **Decline:** goes to the next ranked peer (Priya) without naming who left.
- **UI:** Mock interview tab in the same iMessage style: question-pack card, round card with a built-in timer
  (30 min per round, sped up by the demo speed: ×10 slow, ×30 normal, ×120 fast) and End round, rubric form,
  private scores card. Under the hood: match board (every candidate and why), the five rules, the agent feed
  with judging lenses.
- **Verified:** 153 tests (20 new mock tests), test:sabotage 6/6, typecheck, build, demo:run. Browser at 1440×900
  and 1280×800: full swap, decline → backup, solo fallback, drawer with lens; each phone shows only its owner's
  scores; no "->", 24-hour times, raw ids or scores in the feed; no page scroll; global Reset restores both the
  prep and mock tabs exactly (pressed from a third tab, both mid-run); no console errors. Prep circle unchanged.

### Phase G (early) — merged `aditya/journey` at `da49902`: done
- **Review:** 6 commits by Aditya (one is a sync merge of our Phase 0). Net change: 16 new files, all inside
  `src/features/{find,pipeline,intel}/` and `tests/features/{find,pipeline,intel}/`; nothing outside, no shared file
  touched. Secret scan over every commit's patch: none (no keys, tokens, webhooks, env or network use; the `SECRETS`
  in `tests/features/intel/sabotage.test.ts` are fake PII like `maya@example.com` / 555 numbers for the anonymizer).
- **Registered** `FindTab`, `PipelineTab`, `IntelTab` in `src/app/tabs.tsx`. Visible tabs: Find · Pipeline · Prep
  circle · Mock interview · Intel; Referral stays hidden until Phase E. Default tab: Prep circle.
- **Intel → evidence file:** `getIntelContributionCount` (in `src/features/intel/logic.ts`, keyed by prep agent id
  `a1…a8`) is now the evidence file's source for "intel reports shared" (person `p4` ↔ `a4`). The old seeded stub
  counts were removed from `trust/seed.ts`; a new test checks every student's evidence count equals Aditya's function.
- **Two of Aditya's contract tests updated (with your OK):** `tests/features/{find,pipeline}/contract.test.ts` asserted Aditya's
  tabs were *not* registered and still used the old `soon(` placeholder. They now assert the registry imports and
  registers them, and Find's still checks that the Find tab never imports `app/tabs`. Nothing else in Aditya's folders changed.
- **CSS fix (ours):** Aditya's side panels use `.sub` and `.tag`, which our stylesheet styled globally for the hero subline
  (collapsed once a demo starts) and the feed's type tag. That hid the report tips and overlapped labels. Scoped those
  rules to `.hero .sub` and `.row-head .tag`, and added plain `.card .sub` / `.card .tag` styles.
- **Verified:** typecheck, 386/386 tests (Aditya's 205 + ours), test:sabotage 6/6, build, demo:run. Browser at 1440×900
  and 1280×800: every visible tab opened and driven through its first action, no page scroll, no "->" or 24-hour
  times, no console errors; global Reset from the last tab gives a page identical to a fresh load across all five
  tabs (clock times masked).

For Aditya (not changed; Aditya's files):
- **Jordan's intel count:** Aditya's `CONTRIBUTION_COUNTS` gives `a4: 0`, but the Phase E referral story has Jordan with
  1 intel report. With that data as the source, Jordan's evidence now shows 0. If the story should hold, set `a4: 1`.
- **Pipeline headline numbers** ("23", "6") sit in an `h3`, which our cards style as small labels, so they render
  small. A dedicated class for the big number would fix it.

### Phase D — Trust ratings + evidence file: done (`src/features/trust/`, `tests/features/trust/`)
- **Ratings:** after a prep circle or a peer mock, each member privately rates the others: showed up (yes/no) and
  helpful (1–5). Only session members can rate each other, once per session. `TrustLedger` never returns a single
  rating (not even to the person rated): only the count, and a reliability score once there are ≥ 2 ratings
  (average of helpful; a no-show counts as 1). Show-up rate likewise only from 2 ratings.
- **Matching:** the mock tab ranks by complementary skills, then reliability (more reliable first; someone without a
  score ranks after someone with one). The Under the hood match board shows each candidate's aggregate (★ 4.8 · 5
  ratings, or "New").
- **Evidence file ("Your proof of work")**, private to its owner (`EvidenceLockedError` for anyone else): sessions
  attended (a no-show doesn't count), average rating, peer mock rubric averages (practice self-scores excluded),
  intel reports (seeded stub count; `setIntelCounter()` is the hook for Aditya's Intel feature), skills taught,
  target roles, and project links (stage 2 only).
- **Staged disclosure** (for Phase E): stage 1 = stats only; stage 2 adds the rubric breakdown and project links;
  identity is never in the evidence file (stage 3 comes from the consent-gated identity vault).
- **One trust network for the whole journey** (`trust` in `network.ts`), keyed by person (Applicant #n = `pn`), so a
  prep circle and a mock both build the same record. Global Reset restores the seeded history.
- **Seeded history** (raw sessions and ratings, nothing pre-aggregated): Jordan 3 sessions, 5 ratings → 4.8, one mock
  4.25, taught DSA + System Design, 1 intel report, targeting Stripe SWE Intern; Aditya 4.5; Maya 4.7; Priya 2.0 (one
  no-show); Sumit 1 rating (hidden until a second).
- **UI:** after the circle meets (or the mock is scored), each phone gets "Tonight's session is done 🎉", a private
  rating card, then "🔒 Rated privately" and the 🏅 Your proof of work card, which updates live as others rate.
- **Verified:** 179 tests (13 new trust tests: no individual rating exposed, the 2-rating threshold, reliability
  changing the match order, owner-only evidence, staged disclosure), test:sabotage 6/6, typecheck, build. Browser at
  1440×900 and 1280×800: ratings in both tabs, Sumit crossing the threshold, evidence carrying over from prep to mock,
  board stars, no page scroll, global Reset restores both tabs and the trust network exactly. Only console error is the
  expected local 404 for `/api/notify`.

Phase D decisions:
- **Jordan's mock average is 4.25 (shown 4.3), not 4.2:** rubric scores are whole numbers, so one mock can only
  average x.0/x.25/x.5/x.75. The referrer's rule (≥ 4.0) is unaffected. Rating 4.8 is exact (5, 5, 5, 5, 4).
- **Reliability uses one decimal.** Known limit: with only one new rating at a time, someone could compare their score
  before and after to infer that one rating. The 2-rating threshold (as specified) is enforced; coarser rounding or
  batching would be the next step if that matters.
- **Rating happens right after the session in the demo** ("Tonight's session is done 🎉"); in real use the agent would
  ask after the scheduled time.
- **Prep-circle matching order is unchanged** (it's engine code); reliability affects mock matching (and the referral
  fit check in Phase E).
- **Rating cards list the other members in circle order** (e.g. Aditya rates Maya, then Sumit).

### Apply suite (`feature/apply-suite`, not merged; deadline 12:00 PM Phoenix)
| Phase | Scope | Status |
|---|---|---|
| 0 | Audit + research (AUDIT.md); landing copy without hackathon / track mentions | done |
| 1 | Real Job Sniper: live board search behind a toggle | done |
| 2 | Resume builder + LaTeX / Overleaf / PDF | done |
| 3 | Outreach drafts (copy / Gmail / mailto, never sent by us) | done |
| 4 | Apollo contact lookup (official API, demo data without key) | done |
| 5 | Huntr: honest export (no public API for students) | done |
| 6 | Agent tie-in + 2 new sabotages | done |
| 7 | Alignment doc, README, full checks | done |

**Phase 1 (Job Sniper live):** `src/features/apply/jobs/` is the TypeScript port of hiring-pulse `jobs_core.py`
(parsers for the four public board shapes, role / level / US / visa-risk filters, resume-overlap score, dedupe) plus
all 443 boards (`boards.ts`). `api/jobs-search.ts` reads up to 60 boards (named companies, else a priority list of
well-known companies), 16 at a time, 3.5 s per board, 7 s total, caches raw results 10 min, `JOBS_SEARCH=off` turns it
off. The Find tab gets a **Live search** switch in the top bar (off by default, so the recorded demo is unchanged);
on, it shows real postings with Apply links and Track. Any failure falls back to the seeded postings, labelled
"Demo data". Global Reset turns live search off again. 21 new tests (fixtures for every board shape, filters,
scoring, dedupe, per-board timeout, overall budget, cache, off switch). Note: this build container can't reach the
boards, so the live path was checked with a recorded response; it runs for real on Vercel.

**Phase 2 (Apply tab, resume):** new **Apply** tab after Find (iPhone + side card). Profile = structured entries the
student types or pastes (deterministic parser, then editable); starts as a labelled demo profile. `tailor()` picks and
reorders the student's own bullets and skills by match to the chosen posting (tracked live postings, else three labelled
demo postings), keeps experience in the student's order, trims least-relevant bullets to a one-page budget, and lists
"Requirements you don't meet" (missing skills, degree level, years, clearance). Exports: `.tex` download (every special
character escaped), Open in Overleaf (documented form POST, `encoded_snip`), Save as PDF (print view; the default file
name is "Resume - <Company> - <Role>"). 14 new tests: escaping of `& % $ # _ { } ~ ^ \`, brace balance, one-page guard,
output text is a subset of the profile, unmet detection, parser, file names, Overleaf fields. The tab registry test now
expects the Apply tab (the one existing assertion changed). Optional LLM parsing was not added; parsing is deterministic.

**Phase 3 (outreach drafts):** Apply tab → **Outreach**. Recruiter / alum / referrer templates (under 120 words, filled from
the posting, the contact and one of the student's own resume bullets; cold contacts get a "won't follow up again"
line). Actions: Copy, Open in Gmail (compose URL), Email app (`mailto:`). Nothing is ever sent by us. `api/outreach-draft.ts`
returns the template, or, with `ANTHROPIC_API_KEY`, Claude's rewording (3 s timeout) only if it keeps the cap, leaves
no placeholder, names the company and adds no number that wasn't in the facts. Rate limits: 10 drafts / 10 min per
session, 20 / 10 min per IP on the server. 17 new tests.

**Phase 4 (Apollo contacts):** Outreach → **Find contacts at <company>**. `api/apollo-search.ts` calls only Apollo's
documented People API Search (`POST /api/v1/mixed_people/api_search`, `x-api-key`, 0 credits, no emails returned) with
recruiting titles plus the target role and the company domain (or keyword). Name, title, company, LinkedIn; an email only
if a plan ever returns a real one. No key, 401/403, 429, 5xx or network failure → three contacts labelled "Demo data"
with a note. 10-minute in-memory cache to spare Apollo's rate limits; nothing persisted, contacts live in the tab's
session state. Picking a contact fills the draft (recruiter template for recruiting titles, alum otherwise).
7 new tests (request shape, keyword fallback, missing key, 429 / 403 / 500 / network, cache, no fake emails).

**Phase 5 (Huntr):** Huntr's only API is the Organization API (career centres); there's no API or documented import
format for individual job seekers. So, option (3): Apply → **Tracker** lists the jobs tracked from live search and
exports them as CSV (RFC 4180, formulas neutralised) or versioned JSON, plus an **Open Huntr** link. The UI and README
say plainly that Huntr has no public integration for students. 4 new tests.

**Phase 6 (agent tie-in):** no engine changes.
- **Find → the agent network:** tracking a live posting makes the agent offer the existing flows (prep circle, mock
  swap, Referral Bridge, tailored resume) and opens that tab (`src/app/navigate.ts`), saying which demo network it runs
  in (Microsoft for circles and mocks, Stripe for the referral).
- **Referral → application packet** (`src/features/apply/packet.ts`): once names are unlocked, Jordan's agent prepares
  a resume tailored to the role from Jordan's own resume plus an intro draft, held by Jordan's agent. Nadia can request
  it (only Nadia, only after the chat is booked); Jordan's agent asks Jordan; shared to Nadia only on Jordan's yes; a no
  keeps it private. Nothing is emailed. The steps appear in the Referral feed (prepared → requested → asked → consent →
  shared) with what was shared / summarized / withheld, and the Apply tab has its own Under-the-hood steps list.
  The Referral tab only gained a card slot (`custom` items in `ReferralPhone`); `ReferralBridge` is unchanged.
- **Sabotage: 12/12.** New: "Outreach draft auto-sent without the student" (a mail-API call planted in
  `api/outreach-draft.ts`, caught by 3 tests) and "Resume export adds skills the student never listed" (planted in
  `tailor()`, caught by 3 tests). 6 new tests (packet gates, private by default, subset of the profile, outreach's only
  outbound call is the optional Claude rewording).

**Phase 7 (checks + docs):** README: new tab, an "Apply suite: what's live and what's demo" table, the new functions
and env vars, 12 sabotages, demo steps (prep circle stays the hero). `.env.example` lists `APOLLO_API_KEY`,
`OUTREACH_MODEL`, `JOBS_SEARCH` (server-side). Emoji now stripped at display in every phone card (Mock and Referral
cards rendered some copy raw). Landing terminal shows 12 sabotages / 482 tests. The eligibility mapping was delivered
separately, not committed (no event mentions in the public repo). Verified with zero keys (every fallback): typecheck,
482 tests, test:sabotage 12/12, build, demo:run; Chromium at 1440×900 and 1280×800: all 7 tabs fit, no emoji, no
"->", no 24-hour times, global Reset restores every tab; live search, Apply exports, outreach, contacts, tracker,
referral packet and landing interactions all run with no console errors (only the sandbox's blocked Google Fonts).

### Landing page integrated (`/`), demo app moved to `/app/`
- **Landing page:** the Lovable marketing site (hirearchy-prep-circle.lovable.app), ported into `src/landing/` as React:
  same sections, copy, Tailwind classes and timings (read from the site's own bundle), styled by its own compiled
  stylesheet (`site.css`, vendored). Framer Motion replaced by small hooks (`motion.tsx`: reveal on scroll, mount
  and exit fades, reduced-motion aware); exact Lucide icons (`icons.tsx`). No new dependencies.
- **Two pages** (`vite.config.ts`): `index.html` → landing, `app/index.html` → the demo app. Separate stylesheets, so
  neither page's CSS can affect the other. Every "Try the live demo" goes to `/app/`; the Demo section embeds `/app/`.
  `/?live=1` redirects to `/app/?live=1`, so live-mode links keep working.
- **App matched to the landing:** design tokens now the site's exact `oklch` values (ink, primary, muted, border,
  success, violet, bubble, shadows); the site's coloured logo mark (brand links to `/`) and tinted agent avatars;
  primary / outline buttons at the site's 44 px pill size; solid accent heading; the site's gradient mesh. Tabs drop
  their icons below 1180 px so all six fit in the landing page's demo frame.
- **Verified:** the port renders pixel-identical section heights to the original (9,668 px at 1440); hero loop,
  How-it-works stepper (auto-play, pick, Replay), product cards, FAQ, sabotage terminal, sticky header, mobile menu,
  links and the live redirect all work; no horizontal scroll at 390 / 768 / 1440; no console errors. App: 414 tests,
  10/10 sabotages, build, all six tabs at 1440×900 and 1280×800, global Reset exact.

### Deploy fix: api functions crashed on Vercel (FUNCTION_INVOCATION_FAILED)
- **Cause:** `"type": "module"` means Vercel runs each compiled `api/` file as native ES modules, and Node needs
  explicit file paths. `api/live-*.ts` and `api/discord-interactions.ts` imported `../src/live/http` (no extension),
  and `api/voice.ts` imported the `../src/integrations` directory, so all four crashed on load. Vite, Vitest and tsc
  resolve those paths, which is why nothing caught it locally. `api/notify.ts` has no local imports and was fine.
- **Fix:** explicit `.js` paths on the relative imports along those functions' runtime import chains (11 lines in
  9 files; `api/voice.ts` is Aditya's, one line). Reproduced by compiling every file the way Vercel does and
  importing each function: all five now load and respond (503 without env vars, as designed).
- **Guard:** `tests/api/esm-imports.test.ts` walks each function's runtime imports and fails on any path without
  `.js` (fails on the old code for 4 of 5 functions).

### Phase F — Polish, safety, README: done
- **Sabotage (`npm run test:sabotage`): 10/10 caught.** Four new planted bugs for the new features:
  rating leak (trust summary carries individual ratings) → 3 tests; referral auto-approved by the agent after the
  chat → 7 tests; evidence file (links + rubric) sent at stage 1, before the fit check → 2 tests; mock scores
  readable without the subject's grant → 3 tests. Every planted file is restored after each run.
- **Hero line** ("Find the job. Prep with your pipeline. Earn the referral. Your agent negotiates; you decide.")
  is a slim line under the tab bar on every tab, and the page title / meta description.
- **Same look everywhere:** all six tabs use the iMessage phones, the drawer, 12-hour times and plain English
  (checked: no "->", no 24-hour times in any tab's text). Every tab resets on `resetKey`; global ↺ restores all six
  tabs and the trust network exactly.
- **Real browser** (Chromium, 1440×900 and 1280×800): every tab opened and exercised (main action + first quick
  reply), full Referral flow (refer, not-yet form, decoy, drawer), ratings → evidence across Prep and Mock; no page
  scroll on any tab at either size; no console errors except the expected local `/api/notify` 404 (Vite dev doesn't
  serve `api/`). New screenshot `docs/referral.png`.
- **README rewritten:** the journey, one section per feature mapped to the three criteria (conflicting constraints /
  what's shared / when humans are asked), the 10 sabotages, Referral demo steps, updated architecture diagram, "Your
  prep circle becomes your proof of work.", and the Team section.
- **Verified:** typecheck, 409 tests, test:sabotage 10/10, build, demo:run.

Phase F notes:
- **Find, Pipeline and Intel don't use the shared judge-lens chips** (their drawers explain matches and redactions
  their own way). They're Aditya's files, so left as is; the README says which drawers have the chips. See "For
  Aditya" below.

### Phase E — Referral Bridge: done (`src/features/referral/`, `tests/features/referral/`)
Connection first, proof of work, the human decides. New tab **🤝 Referral** (6 tabs now visible).
- **Cast:** Jordan (Applicant #4) applied to Stripe SWE Intern; Nadia ("Stripe alum", `r1`) interned at Stripe and
  refers from the network; Theo (Applicant #10) is the decoy. Jordan's and Theo's records come from the shared trust
  network, so prep circles and mocks in the other tabs really change their referral outcome.
- **Nadia's PRIVATE rules** (`REFERRER_RULES`, only inside their agent): SWE / Software Engineer / Backend roles;
  ≥ 2 sessions; peer rating ≥ 4.5; mock average ≥ 4.0; must meet first; max 2 referrals/month (1 left).
- **Flow** (`ReferralBridge`, own state machine on the shared `machine()` helper; engine scheduler, negotiation,
  consent and identity vault reused unchanged):
  1. Jordan's agent asks Jordan first ("✅ Share my stats / Not now"). "Not now" shares nothing.
  2. Stage 1 (stats only) goes to the referrer's agent, which runs `fitCheck()`: deterministic, one pass/fail per
     rule. The result event is addressed to the referrer's agent only; their phone shows ✓/✗ per rule.
  3. Fit → stage 2 (project links + rubric breakdown, still anonymous) → a 15-minute coffee chat negotiated with the
     engine scheduler (7:00–7:15 PM) → both humans "✅ I'm in" → names unlock (stage 3, from the identity vault).
  4. Nadia taps "☕ We had the chat", then decides: **🤝 Refer / 🕗 Not yet (+ coaching note, default "Do one more
     system design mock first.") / No**. `decide()` is the only path to REFERRED and throws
     `HumanDecisionRequiredError` unless it's the referrer, after the chat. Refer uses one of the month's referrals
     and earns +1 give-back credit; Not yet and No use none.
- **Decoy:** Theo (2 sessions, ★ 4.3) fails the rating rule only. Theo hears just "This referrer isn't taking you on
  right now"; no rule, threshold, referrer name or stage 2 ever reaches Theo, and Nadia never learns Theo's name.
- **Limit in the demo:** after Jordan is referred, "Next applicant: Theo →" keeps Nadia's month (0 of 2 left), so the
  fit card shows ✗ rating and ✗ limit. Starting Theo from the idle screen shows the rating failure alone.
- **Under the hood:** fit check per rule (referrer's private view), staged disclosure (stage 1/2/3: shared / never
  shared / waiting), referrals left + credit, and the plain-English feed with judge lenses.
- **Verified:** 409 tests (23 new referral tests: each rule pass/fail, the monthly limit, no identity before consent,
  stage order, no referral without the referrer's human, decide() as the only path to REFERRED, give-back credit, the
  decoy learning nothing), test:sabotage 6/6, typecheck, build. Browser at 1440×900 and 1280×800: full Jordan flow to
  Refer, the Not yet note form, the drawer, the Theo follow-up, no page scroll, no console errors; global Reset
  restores all six tabs exactly.

Phase E decisions:
- **Found by the new tests: project links named the student.** The seeded links were `github.example/jellis/…`,
  which gives away Jordan's handle at stage 2 (before consent). Links are now anonymized project pages
  (`projects.example/j8f4/sharded-kv`); stage 2 must stay nameless.
- **Jordan's numbers:** mock average 4.3 (4.25, see Phase D), intel reports 0 (Aditya's `getIntelContributionCount`
  has a4 = 0; the spec said 1). Neither changes the fit.
- **"Must meet first" is enforced by the flow, not as a stat:** it always shows ✓ "chat will be scheduled", and no
  decision is possible before the chat.
- **The seeker doesn't learn why.** "Not a fit right now" is the only reason sent, so failing rules can't be probed
  one at a time.
- **Nadia's name** is shown on their own phone and, after consent, to Jordan. Before consent Jordan sees only "a
  student who interned at Stripe".

### Live Discord mode: done (code) · needs one-time setup (LIVE_DISCORD.md)
- `?live=1`: the Prep circle tab checks `/api/live-state?health=1`, shows "Live: Aditya is on Discord", DMs Aditya
  each prompt that needs them (`/api/live-notify`, buttons ✅ I'm in / 🕗 Suggest a time / Not this time; the time
  button turns into a 7:30 / 8:00 / 8:30 PM picker), polls `/api/live-state` every 1.5 s and applies their answer once,
  through the same `reply()` as a tap on their simulated phone (bubble tagged "· via Discord").
- `api/discord-interactions.ts` verifies Discord's Ed25519 signature with `node:crypto` (no new package), answers
  PING, accepts only `DISCORD_ADITYA_USER_ID`, stores the answer first-wins per (session, prompt).
- Storage: Supabase `t2_live_replies` (`supabase/live.sql`, RLS on, functions granted to `service_role` only),
  called server-side with `SUPABASE_SERVICE_ROLE_KEY`. Checked on PGlite: first answer wins, bad input rejected,
  anon can neither read nor write.
- Fallbacks: no `?live=1` → nothing changes (no live calls at all). Health fails, the DM fails, or 3 polls in a row
  fail → "Live mode unavailable, using simulated phone"; the simulated phone keeps working throughout.
- Tests (`tests/live/`, 12): signature valid/invalid, PING, interaction → reply mapping (buttons, picker,
  first-wins, other users, expired picks), the poller applies a reply exactly once, a signed click reaching the
  engine end to end, offline fallback (client + unconfigured server + failing Discord), DM text built only from
  validated fields.
- Browser (1440×900): without `?live=1` zero live calls; `?live=1` locally (no API) shows the unavailable badge and
  completes; with the live functions mocked, Aditya's counter (8:00 PM) and "I'm in" arrive from "Discord", the
  updated time is DM'd again, and the circle completes at 8:00–9:00 PM. No console errors.

Live-mode decisions:
- **Supabase over Vercel KV:** the project already exists, needs no new vendor or package, and the table follows the
  t2_ pattern. One SQL file to run.
- **Picker, not a modal:** "Suggest a time" swaps the buttons for a select menu (7:30 / 8:00 / 8:30 PM). Discord
  modals only take text inputs reliably, and free text would need parsing on the server.
- **Server builds the DM text** with the same `studentCopy` as the simulated phone, from whitelisted short fields.
- **Each prompt has its own id** (the phone message id), so a late tap on an old DM can never answer a newer prompt.
- **`/api/live-notify` is unauthenticated** (public demo): it can only DM Aditya, and only template text.
- **Not exercised against real Discord/Supabase here** (no credentials in this environment); verified with signed
  requests, PGlite, and mocked endpoints in the browser.

Phase B decisions:
- **Session = 60 minutes** (30 each way); the "≥ 60 min" rule means a full hour together. The agents propose the
  earliest such hour.
- **Difficulty is compatible** when equal or either side says "any".
- **"Complementary preferred", not required:** Priya (no overlap in weak spots) is a valid backup.
- **Timer is a UI aid.** Rounds end when a person taps End round (the timer shows "Time's up" at 0, it doesn't
  force the end).
- **Mock copy is templates** (no LLM call yet): `generateMessage` only knows the prep kinds. Can be routed
  through it later behind `VITE_USE_LLM_COPY`.
- **If the seeker declines**, the search ends (no agent-practice offer), since they said no to mocking now.
- **Solo self-scores don't count as evidence** (only peer scores feed the Phase D evidence file).
- `Inspector` gained an optional `describeEvent` prop so each feature words its own feed; the default is unchanged.


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

## For Aditya (found while reviewing the merge; not changed, since these are Aditya's files)
- `api/voice.ts` hardcodes `MODEL = 'claude-sonnet-4-5'`. The current Sonnet is `claude-sonnet-5-5`; if the old
  id is retired, every call errors and silently falls back to templates. Suggest updating it.
- Aditya's tests live in `tests/integrations/`, outside the agreed `api/` + `src/integrations/` paths. Kept: they're
  new files that only test that module.
- Aditya's `generateMessage` fallback reads `details.start` / `details.end`; the engine sends `details.window`. The
  UI adapter now adds `start` / `end`, so the fallback text includes the time.
- Find, Pipeline and Intel could adopt the shared `JudgeLegend` (from `src/ui/kit.ts`) so every drawer has the
  same three judging-lens chips.
- Intel copy uses an em dash ("…in your pipeline — and unlocks theirs."); the rest of the app avoids them.
- `getIntelContributionCount` has a4 = 0, so Jordan's proof of work shows 0 intel reports (the referral spec
  imagined 1). Doesn't change the fit.

## Open issue: requester id in track2.sql (must fix before wiring Supabase)
`t2_get_identity`, `t2_record_consent`, `t2_get_events` and `t2_append_event` take the requester / agent id as a
plain parameter and are executable by `anon`. The consent gate itself holds (no identity until every member has
accepted), but any caller can claim to be any agent: record a "yes" for someone else, read another agent's
events, or append events as them. Fix before connecting: derive the caller's agent from `auth.uid()` (a
`t2_agent_profiles.user_id` column checked inside each function), or call these functions only from a server
route with the service key. Left as is for now, per instruction.

## In progress
- `feature/apply-suite`: phases 0-7 done. Not merged to main; waiting for Sumedha's review.

## Exact next step
1. Sumedha reviews `feature/full-journey` (nothing is merged to main).
2. Deploy from `feature/full-journey` on the laptop: `git checkout feature/full-journey && git pull && npx vercel --prod`
   (env vars as in README → Deployment; live Discord setup in LIVE_DISCORD.md).
3. Walk the README demo steps on the deployed URL, all six tabs.

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
  mode a structured message is held until its wording arrives (at most ~3 s, Aditya's timeout) so bubbles never flicker
  between two wordings. Plain status lines (welcome, "You're in", dissolved) always use `copy.ts`.
- **`notifyPhone` sends the text the student actually sees** (the student copy, or Claude's wording in LLM mode).
- **In LLM mode the reveal message includes names and contacts** (it's past consent, and Aditya's server passes reveal
  details through by design). Default mode shows "Names are unlocked" plus the calendar card instead.
- **Invite outcomes now use Aditya's parser.** It's stricter than the stub (it needs an invite phrase, a known company and a
  known role) and returns "Software Engineer" rather than "SWE" for non-intern roles. Our three outcome messages
  are unchanged.
- **`prettify` also normalises "7:30 PM–9:00 PM"** (en dash), which Aditya's fallback produces.
- **`.gitignore` now ignores every `.env*` file except `.env.example`**, plus `.vercel/`.
- **Verified locally**, where `/api/*` returns 404: default mode (golden path, decline branch, three invite outcomes,
  reset) and LLM mode with the API down, mocked-working and hanging past the 3-second timeout. All complete with
  no console errors besides the expected 404s.
