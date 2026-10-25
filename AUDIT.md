# Audit: what exists, what's real, what's missing

Snapshot of `main` at `d7009b8` plus the read-only predecessor repo
[sumedha092/hiring-pulse](https://github.com/sumedha092/hiring-pulse) (README, SKILL.md, `scripts/jobs_core.py`,
`scripts/jobs.py`, `scripts/boards.csv`). Written before building the apply suite (`feature/apply-suite`).

"Seeded" means deterministic demo data checked into the repo. "Real" means it talks to a live outside system when
configured.

## Features

| Feature | Exists? | Where | Real or seeded | Gaps |
|---|---|---|---|---|
| Job Sniper (live board search) | Partly | hirearchy-agents: `src/features/find/` (seeded postings, Track it / Not for me). hiring-pulse: `scripts/jobs_core.py` + `jobs.py` (Python, real fetch of 443 boards) | Find tab: **seeded** (12 fixed postings). hiring-pulse: **real** but Python, runs in a chat sandbox, not in this app | No live search in the web app. Needs a TypeScript port, a server function with a time budget, and a fallback |
| Resume tailoring | No (spec only) | hiring-pulse `SKILL.md` §7 describes it ("never invent experience… flag requirements they don't meet"), no code | n/a | Profile model, deterministic tailoring that only selects the student's own text, unmet-requirement list |
| LaTeX resume download | No | n/a | n/a | One-page template, escaping, Overleaf hand-off, PDF via print |
| Cold email drafting | No | n/a | n/a | Templates, optional LLM wording with timeout + fallback, length cap |
| One-click send / compose | No | n/a | n/a | Must stay human-sent: Copy, Gmail compose URL, `mailto:`. No server-side sending |
| Huntr integration | No | n/a | n/a | No public API for individual job seekers (see research). Honest export + link only |
| Apollo integration | No | n/a | n/a | Official People API Search behind a server-side key, demo contacts without it |
| Prep circle | Yes | `src/engine/` (agents, broker, scheduler, negotiation, consent, identity vault), `src/features/prep/` | **Real engine, seeded people** (8 students, one pipeline) | Not connected to real postings |
| Mock interview | Yes | `src/features/mock/` | Real logic, **seeded** people, question pack from seeded reports | Same |
| Intel | Yes | `src/features/intel/` (Aditya) | Real anonymizer + give-to-get gate, **seeded** reports | No backend |
| Pipeline stats | Yes | `src/features/pipeline/` (Aditya) | Real 3-report threshold, **seeded** cohorts | No backend (hiring-pulse has a real Supabase backend for this, not wired here) |
| Trust / proof of work | Yes | `src/features/trust/` | Real ledger + staged disclosure, **seeded** history | In memory only |
| Referral bridge | Yes | `src/features/referral/` | Real fit check / consent / human decision, **seeded** people | Doesn't use real postings or produce application materials |
| Live Discord mode | Yes | `src/live/`, `api/discord-interactions.ts`, `api/live-*.ts`, `supabase/live.sql` | **Real** (signed Discord interactions, Supabase storage) once env vars are set; `/api/live-state?health=1` returns `{"ok":true}` on production | Only Aditya's side is live; the rest of the circle is simulated |

## Research (official docs, checked 2026-10-25)

### Huntr
- The only documented API is the **Organization API** ([docs.huntr.co](https://docs.huntr.co/)): base
  `https://api.huntr.co/org`, `Authorization: Bearer <ORG_ACCESS_TOKEN>`, tokens created in an *organization's*
  admin dashboard. It's for career centres and coaches following their members (members, jobs, job posts,
  activities, webhooks). A student with a personal account can't get a token.
- For individuals, Huntr documents saving jobs through its Chrome extension or manual entry
  ([Saving jobs to Huntr](https://help.huntr.co/en/articles/11479680-saving-jobs-to-huntr)) and a data **export**
  as a ZIP of CSVs ([Download/Export your board](https://help.huntr.co/en/articles/11757717-download-export-your-board)).
  No documented **import** format for job cards.
- **Decision:** option (3) from the brief. A generic tracker export (CSV + JSON) plus an "Open Huntr" link, and the UI
  and README say plainly that Huntr has no public integration for individual students. (If a school's career centre
  uses Huntr for Organizations, its org token could post jobs to members; out of scope for a student account.)

### Apollo.io
- **People API Search** ([docs](https://docs.apollo.io/reference/people-api-search)):
  `POST https://api.apollo.io/api/v1/mixed_people/api_search` with `person_titles[]`,
  `q_organization_domains_list[]`, `organization_ids[]`, `person_seniorities[]`, `page`, `per_page`.
  **Uses 0 credits and does not return emails or phone numbers.** Getting an email needs the separate People
  Enrichment endpoint, which costs credits; we don't call it.
- API keys ([Create an API key](https://docs.apollo.io/docs/create-api-key)): access depends on the Apollo plan; keys
  are scoped to chosen endpoints (a call outside the scope returns 403) or set as a master key. Free accounts need a
  work email. Per-endpoint rate limits (per minute / hour / day) are shown in the account's API usage page; we
  handle 429 by backing off and serving the cached / demo result.
- Key sent as the `x-api-key` header, server-side only (`APOLLO_API_KEY`, never `VITE_`).
- **Decision:** `api/apollo-search.ts` calls only this endpoint; results are names, titles, company and LinkedIn
  URL. Without a key: three contacts clearly labelled "Demo data".

### Public job-board endpoints (no auth; companies publish these for aggregators)
| ATS | Endpoint | Docs |
|---|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs` (+ `/jobs/{id}` for the description) | [Job Board API](https://docs.greenhouse.io/job-board.html) |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` | [lever/postings-api](https://github.com/lever/postings-api) |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{name}` | [Public job posting API](https://developers.ashbyhq.com/docs/public-job-posting-api) |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/{id}/postings` | [Posting API](https://developers.smartrecruiters.com/docs/posting-api) |

`boards.csv` lists 443 boards: 254 Ashby, 142 Greenhouse, 43 Lever, 4 SmartRecruiters. We read only these official
JSON endpoints (no HTML scraping), identify ourselves with a User-Agent, cap concurrency and cache for 10 minutes.

### Overleaf
- "Open in Overleaf" is a documented form POST to `https://www.overleaf.com/docs`
  ([Overleaf developer docs](https://www.overleaf.com/devs)). It accepts `snip_uri` (a URL Overleaf downloads) and
  the URL-encoded source in `encoded_snip`; `snip_name` sets the file name. We POST `encoded_snip` with the generated
  `.tex`, from the student's own click.

### Gmail / mail clients
- Draft hand-off uses the Gmail compose URL (`https://mail.google.com/mail/?view=cm&fs=1&to=…&su=…&body=…`) and
  `mailto:`. Both open a draft in the student's own client; nothing is sent by us.

## Constraints we keep
- Engine, live mode and existing feature logic and tests untouched.
- Every integration is server-side, behind a flag or key, with a deterministic offline fallback.
- Nothing is ever sent automatically. Resumes only use the student's own text.
- This build container can't reach the job boards, Apollo or Overleaf (egress is restricted), so integration tests
  use recorded fixtures and mocked `fetch`; the live paths run on Vercel.
