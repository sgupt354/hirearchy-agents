-- Live Discord mode: Aditya's Discord replies, waiting for the web demo to pick them up.
-- Additive t2_ migration for the existing Supabase project (run once in the SQL editor).
-- RLS ON with no policies; only the service_role (used server-side by the Vercel functions) may call the
-- functions, so the public anon key can neither read nor forge a reply.

create table if not exists public.t2_live_replies (
  session_id  text        not null check (session_id ~ '^[0-9a-fA-F-]{36}$'),
  prompt_id   integer     not null check (prompt_id > 0),
  action      text        not null check (action in ('accept', 'decline', 'counter')),
  text        text        check (text is null or length(text) <= 40),
  created_at  timestamptz not null default now(),
  primary key (session_id, prompt_id)
);

alter table public.t2_live_replies enable row level security;
revoke all on public.t2_live_replies from anon, authenticated;

-- First answer wins: a second tap on the same prompt changes nothing. Returns true if stored.
create or replace function public.t2_live_put_reply(p_session text, p_prompt integer, p_action text, p_text text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  inserted integer;
begin
  insert into t2_live_replies (session_id, prompt_id, action, text)
  values (p_session, p_prompt, p_action, p_text)
  on conflict (session_id, prompt_id) do nothing;
  get diagnostics inserted = row_count;
  -- Housekeeping: demo replies only matter for a few minutes.
  delete from t2_live_replies where created_at < now() - interval '1 day';
  return inserted = 1;
end;
$$;

create or replace function public.t2_live_get_reply(p_session text, p_prompt integer)
returns table (action text, text text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.action, r.text, r.created_at from t2_live_replies r
  where r.session_id = p_session and r.prompt_id = p_prompt;
$$;

revoke all on function public.t2_live_put_reply(text, integer, text, text) from public, anon, authenticated;
revoke all on function public.t2_live_get_reply(text, integer) from public, anon, authenticated;
grant execute on function public.t2_live_put_reply(text, integer, text, text) to service_role;
grant execute on function public.t2_live_get_reply(text, integer) to service_role;

-- Additive: per-student replies, outbound prompt metadata (for typed DMs), private ratings.
create table if not exists public.t2_live_student_replies (
  session_id  text        not null check (session_id ~ '^[0-9a-fA-F-]{36}$'),
  prompt_id   integer     not null check (prompt_id > 0),
  student_id  text        not null check (student_id in ('a1', 'a2', 'a3')),
  action      text        not null check (action in ('accept', 'decline', 'counter')),
  text        text        check (text is null or length(text) <= 40),
  created_at  timestamptz not null default now(),
  primary key (session_id, prompt_id, student_id)
);

create table if not exists public.t2_live_prompts (
  session_id      text        not null check (session_id ~ '^[0-9a-fA-F-]{36}$'),
  prompt_id       integer     not null check (prompt_id > 0),
  student_id      text        not null check (student_id in ('a1', 'a2', 'a3')),
  discord_user    text        not null,
  channel_id      text,
  prompt_window   text,
  last_message_id text,
  created_at      timestamptz not null default now(),
  primary key (session_id, prompt_id, student_id)
);

create table if not exists public.t2_live_ratings (
  session_id  text        not null check (session_id ~ '^[0-9a-fA-F-]{36}$'),
  rater_id    text        not null check (rater_id in ('a1', 'a2', 'a3')),
  subject_id  text        not null,
  helpful     integer     check (helpful is null or (helpful >= 1 and helpful <= 5)),
  showed_up   boolean,
  created_at  timestamptz not null default now(),
  primary key (session_id, rater_id, subject_id)
);

alter table public.t2_live_student_replies enable row level security;
alter table public.t2_live_prompts enable row level security;
alter table public.t2_live_ratings enable row level security;
revoke all on public.t2_live_student_replies, public.t2_live_prompts, public.t2_live_ratings from anon, authenticated;

create or replace function public.t2_live_put_student_reply(p_session text, p_prompt integer, p_student text, p_action text, p_text text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
  insert into t2_live_student_replies (session_id, prompt_id, student_id, action, text)
  values (p_session, p_prompt, p_student, p_action, p_text)
  on conflict (session_id, prompt_id, student_id) do nothing;
  get diagnostics inserted = row_count;
  delete from t2_live_student_replies where created_at < now() - interval '1 day';
  return inserted = 1;
end;
$$;

create or replace function public.t2_live_get_student_reply(p_session text, p_prompt integer, p_student text)
returns table (action text, text text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.action, r.text, r.created_at from t2_live_student_replies r
  where r.session_id = p_session and r.prompt_id = p_prompt and r.student_id = p_student;
$$;

create or replace function public.t2_live_record_prompt(p_session text, p_prompt integer, p_student text, p_discord_user text, p_channel text, p_window text, p_last_message text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into t2_live_prompts (session_id, prompt_id, student_id, discord_user, channel_id, prompt_window, last_message_id)
  values (p_session, p_prompt, p_student, p_discord_user, p_channel, p_window, p_last_message)
  on conflict (session_id, prompt_id, student_id) do update set
    discord_user = excluded.discord_user,
    channel_id = coalesce(excluded.channel_id, t2_live_prompts.channel_id),
    prompt_window = coalesce(excluded.prompt_window, t2_live_prompts.prompt_window),
    last_message_id = coalesce(excluded.last_message_id, t2_live_prompts.last_message_id);
end;
$$;

create or replace function public.t2_live_get_prompt(p_session text, p_prompt integer, p_student text)
returns table (discord_user text, channel_id text, prompt_window text, last_message_id text)
language sql stable security definer set search_path = public as $$
  select p.discord_user, p.channel_id, p.prompt_window, p.last_message_id from t2_live_prompts p
  where p.session_id = p_session and p.prompt_id = p_prompt and p.student_id = p_student;
$$;

create or replace function public.t2_live_count_prompts(p_session text)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from t2_live_prompts where session_id = p_session;
$$;

revoke all on function public.t2_live_put_student_reply(text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.t2_live_get_student_reply(text, integer, text) from public, anon, authenticated;
revoke all on function public.t2_live_record_prompt(text, integer, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.t2_live_get_prompt(text, integer, text) from public, anon, authenticated;
revoke all on function public.t2_live_count_prompts(text) from public, anon, authenticated;
grant execute on function public.t2_live_put_student_reply(text, integer, text, text, text) to service_role;
grant execute on function public.t2_live_get_student_reply(text, integer, text) to service_role;
grant execute on function public.t2_live_record_prompt(text, integer, text, text, text, text, text) to service_role;
grant execute on function public.t2_live_get_prompt(text, integer, text) to service_role;
grant execute on function public.t2_live_count_prompts(text) to service_role;

-- Additive: private post-session ratings from Discord (written and read by the server only).
create or replace function public.t2_live_put_rating(p_session text, p_rater text, p_subject text, p_helpful integer, p_showed_up boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare inserted integer;
begin
  if p_subject !~ '^a[1-8]$' or p_subject = p_rater then return false; end if;
  insert into t2_live_ratings (session_id, rater_id, subject_id, helpful, showed_up)
  values (p_session, p_rater, p_subject, p_helpful, p_showed_up)
  on conflict (session_id, rater_id, subject_id) do nothing;
  get diagnostics inserted = row_count;
  delete from t2_live_ratings where created_at < now() - interval '1 day';
  return inserted = 1;
end;
$$;

create or replace function public.t2_live_get_ratings(p_session text, p_rater text)
returns table (subject_id text, helpful integer, showed_up boolean)
language sql stable security definer set search_path = public as $$
  select r.subject_id, r.helpful, r.showed_up from t2_live_ratings r
  where r.session_id = p_session and r.rater_id = p_rater;
$$;

revoke all on function public.t2_live_put_rating(text, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.t2_live_get_ratings(text, text) from public, anon, authenticated;
grant execute on function public.t2_live_put_rating(text, text, text, integer, boolean) to service_role;
grant execute on function public.t2_live_get_ratings(text, text) to service_role;
