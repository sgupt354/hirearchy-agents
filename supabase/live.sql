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
