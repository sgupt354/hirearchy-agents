-- Track 2 (hirearchy-agents) — additive migration for the EXISTING Supabase project.
-- Only creates t2_ objects. Never touches Pulse (Track 1) tables or functions.
-- RLS is ON for every t2_ table with NO policies, so anon/authenticated can't read tables directly;
-- all access goes through the SECURITY DEFINER functions below.
-- Not wired to the app yet: the engine runs fully in memory (see PROGRESS.md).

create table if not exists public.t2_agent_profiles (
  agent_id        text primary key,
  label           text not null,
  company         text not null,
  role            text not null,
  stage_public    text not null check (stage_public in ('interview', 'applied')),
  offers          text[] not null default '{}',
  needs           text[] not null default '{}',
  availability    jsonb not null default '[]',   -- [{start:"HH:MM", end:"HH:MM"}]
  policy          jsonb not null,
  -- PRIVATE: only returned by t2_get_identity after full consent
  name            text not null,
  email           text not null,
  discord_id      text not null,
  -- PRIVATE: never returned by any function (interview_date only as an abstraction)
  interview_date  date,
  stage           text not null,
  notes           text not null default ''
);

create table if not exists public.t2_coordination_sessions (
  coordination_id text primary key,
  trigger_agent   text not null references public.t2_agent_profiles (agent_id),
  state           text not null default 'IDLE',
  window_start    text,
  window_end      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.t2_coordination_members (
  coordination_id text not null references public.t2_coordination_sessions (coordination_id) on delete cascade,
  agent_id        text not null references public.t2_agent_profiles (agent_id),
  consent         text not null default 'pending' check (consent in ('pending', 'accepted', 'declined')),
  primary key (coordination_id, agent_id)
);

create table if not exists public.t2_agent_events (
  id              text primary key,
  coordination_id text not null references public.t2_coordination_sessions (coordination_id) on delete cascade,
  from_agent      text not null,
  to_agents       text[] not null,
  type            text not null check (type in ('TRIGGER','DISCOVER','FILTERED','PROPOSE','COUNTER','ACCEPT','REJECT',
                                                'CONFLICT','ESCALATE','CONSENT','DECLINE','DISSOLVED','REVEAL','COMPLETE')),
  payload         jsonb not null default '{}',
  disclosure      jsonb not null default '{"shared":[],"abstracted":[],"withheld":[]}',
  human_readable  text not null,
  created_at      timestamptz not null default now()
);

alter table public.t2_agent_profiles        enable row level security;
alter table public.t2_coordination_sessions enable row level security;
alter table public.t2_coordination_members  enable row level security;
alter table public.t2_agent_events          enable row level security;

revoke all on public.t2_agent_profiles, public.t2_coordination_sessions,
              public.t2_coordination_members, public.t2_agent_events from anon, authenticated;

-- Anonymized listings for one pipeline, built from each agent's policy (never PRIVATE columns).
create or replace function public.t2_get_listings(p_company text, p_role text)
returns table (agent_id text, label text, stage_public text, offers text[], needs text[],
               availability jsonb, urgency text, min_session_minutes int)
language sql stable security definer set search_path = public as $$
  select p.agent_id, p.label, p.stage_public, p.offers, p.needs,
         case when (p.policy->>'share_approx_availability')::boolean then p.availability end,
         case when (p.policy->>'abstract_interview_date')::boolean and p.interview_date is not null
              then 'time-sensitive prep need' end,
         (p.policy->>'min_session_minutes')::int
  from t2_agent_profiles p
  where p.company = p_company and p.role = p_role
    and (p.policy->>'share_skills')::boolean
  order by p.agent_id;
$$;

-- Events a viewer is party to (sender or recipient).
create or replace function public.t2_get_events(p_coordination_id text, p_viewer text)
returns setof public.t2_agent_events
language sql stable security definer set search_path = public as $$
  select * from t2_agent_events
  where coordination_id = p_coordination_id
    and (from_agent = p_viewer or p_viewer = any (to_agents))
  order by id;
$$;

create or replace function public.t2_append_event(
  p_id text, p_coordination_id text, p_from text, p_to text[], p_type text,
  p_payload jsonb, p_disclosure jsonb, p_human_readable text)
returns public.t2_agent_events
language sql security definer set search_path = public as $$
  insert into t2_agent_events (id, coordination_id, from_agent, to_agents, type, payload, disclosure, human_readable)
  values (p_id, p_coordination_id, p_from, p_to, p_type, p_payload, p_disclosure, p_human_readable)
  returning *;
$$;

create or replace function public.t2_record_consent(p_coordination_id text, p_agent_id text, p_consent text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  update t2_coordination_members set consent = p_consent
  where coordination_id = p_coordination_id and agent_id = p_agent_id;
  if not found then
    raise exception '% is not a member of %', p_agent_id, p_coordination_id;
  end if;
end;
$$;

-- The ONLY path to name / email / discord: both must be members and EVERY member must have accepted.
create or replace function public.t2_get_identity(p_coordination_id text, p_requester text, p_target text)
returns table (agent_id text, name text, email text, discord_id text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from t2_coordination_members m
                 where m.coordination_id = p_coordination_id and m.agent_id = p_requester)
     or not exists (select 1 from t2_coordination_members m
                    where m.coordination_id = p_coordination_id and m.agent_id = p_target)
     or exists (select 1 from t2_coordination_members m
                where m.coordination_id = p_coordination_id and m.consent <> 'accepted') then
    raise exception 'Identity is locked until every circle member consents';
  end if;
  return query
    select p.agent_id, p.name, p.email, p.discord_id from t2_agent_profiles p where p.agent_id = p_target;
end;
$$;

-- Restores the demo seed (mirrors src/engine/seed.ts). Touches ONLY t2_ tables.
create or replace function public.t2_demo_reset()
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from t2_agent_events where true;
  delete from t2_coordination_members where true;
  delete from t2_coordination_sessions where true;
  delete from t2_agent_profiles where true;

  insert into t2_agent_profiles (agent_id, label, company, role, stage_public, offers, needs,
                                 availability, policy, name, email, discord_id, interview_date, stage, notes)
  values
    ('a1', 'Applicant #1', 'Microsoft', 'SWE Intern', 'applied', array['DSA']::text[], array['Behavioral']::text[],
     '[{"start":"18:00","end":"21:30"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":false,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Aditya Raman', 'aditya.raman@example.edu', 'aditya_r#1001', null, 'Application submitted', 'Nervous about behavioral rounds.'),
    ('a2', 'Applicant #2', 'Microsoft', 'SWE Intern', 'interview', array['Behavioral']::text[], array['System Design']::text[],
     '[{"start":"19:00","end":"21:00"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Sumit Kulkarni', 'sumit.k@example.edu', 'sumitk#2002', '2026-11-05'::date, 'Final round loop', 'Has done 20+ mock behavioral interviews.'),
    ('a3', 'Applicant #3', 'Microsoft', 'SWE Intern', 'interview', array['System Design']::text[], array['DSA']::text[],
     '[{"start":"19:30","end":"22:00"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":true,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Maya Okonkwo', 'maya.o@example.edu', 'mayao#3003', '2026-11-03'::date, 'Technical round 2', 'Interned on a distributed systems team.'),
    ('a4', 'Applicant #4', 'Microsoft', 'SWE Intern', 'interview', array['System Design']::text[], array['DSA']::text[],
     '[{"start":"19:00","end":"21:30"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Jordan Ellis', 'jordan.ellis@example.edu', 'jellis#4004', '2026-11-07'::date, 'Technical round 1', 'Backend-focused, built a sharded KV store.'),
    ('a5', 'Applicant #5', 'Microsoft', 'SWE Intern', 'interview', array['DSA']::text[], array['DSA']::text[],
     '[{"start":"19:00","end":"21:00"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Priya Desai', 'priya.d@example.edu', 'priyad#5005', '2026-11-06'::date, 'Technical round 1', ''),
    ('a6', 'Applicant #6', 'Microsoft', 'SWE Intern', 'interview', array['Behavioral']::text[], array['DSA']::text[],
     '[{"start":"08:00","end":"10:00"}]'::jsonb, '{"share_skills":true,"share_approx_availability":false,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Leo Martins', 'leo.m@example.edu', 'leom#6006', '2026-11-06'::date, 'Technical round 1', 'Early riser, works evenings.'),
    ('a7', 'Applicant #7', 'Microsoft', 'SWE Intern', 'interview', array['System Design']::text[], array['Behavioral']::text[],
     '[{"start":"18:00","end":"22:00"}]'::jsonb, '{"share_skills":false,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Sam Okafor', 'sam.o@example.edu', 'samo#7007', '2026-11-08'::date, 'Technical round 1', ''),
    ('a8', 'Applicant #8', 'Google', 'SWE', 'interview', array['DSA']::text[], array['Behavioral']::text[],
     '[{"start":"19:00","end":"21:00"}]'::jsonb, '{"share_skills":true,"share_approx_availability":true,"share_exact_stage":true,"abstract_interview_date":false,"negotiate_schedule":true,"join_session":"ask","reveal_identity":"ask","share_contact":"ask","min_session_minutes":45}'::jsonb,
     'Riya Kapoor', 'riya.k@example.edu', 'riyak#8008', '2026-11-05'::date, 'Technical round 1', '')
;

  insert into t2_coordination_sessions (coordination_id, trigger_agent) values ('coord-1', 'a1');
end;
$$;

grant execute on function public.t2_get_listings(text, text)                 to anon, authenticated;
grant execute on function public.t2_get_events(text, text)                   to anon, authenticated;
grant execute on function public.t2_append_event(text, text, text, text[], text, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.t2_record_consent(text, text, text)         to anon, authenticated;
grant execute on function public.t2_get_identity(text, text, text)           to anon, authenticated;
grant execute on function public.t2_demo_reset()                             to anon, authenticated;

-- Realtime (not enabled yet; the app is in-memory only):
-- alter publication supabase_realtime add table public.t2_agent_events;
