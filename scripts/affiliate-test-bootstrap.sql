-- Synthetic local cluster ONLY. Do not execute against Supabase/production.
do $$begin
 if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
 if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
-- Relevant identity columns match the read-only production inventory (PostgreSQL 17.6).
-- GoTrue and the remainder of auth.users are NOT emulated; no real identities are copied.
create table auth.users(id uuid primary key,email character varying,email_confirmed_at timestamptz,is_anonymous boolean not null default false);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,public to authenticated,anon,service_role;
grant select on auth.users to service_role;
create table public.subscriptions(
 id uuid primary key default gen_random_uuid(),user_id uuid not null unique references auth.users(id) on delete cascade,
 provider text not null default 'manual',provider_customer_id text,provider_subscription_id text unique,
 plan text not null default 'free' check(plan in ('free','monthly','yearly','crypto_30','crypto_365')),
 status text not null default 'inactive' check(status in ('inactive','active','trialing','past_due','cancelled','expired')),
 current_period_end timestamptz,cancel_at_period_end boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 provider_status text,provider_created_at timestamptz,provider_updated_at timestamptz
);
create index subscriptions_provider_id on public.subscriptions(provider,provider_subscription_id);
alter table public.subscriptions enable row level security;
grant select on public.subscriptions to authenticated;
create policy subscriptions_read_own on public.subscriptions for select to authenticated using(user_id=(select auth.uid()));
create table public.paypal_webhook_events(
 event_id text primary key,event_type text not null,resource_id text,event_created_at timestamptz,
 received_at timestamptz not null default now(),processed_at timestamptz,
 attempt_count integer not null default 1 check(attempt_count>0),last_error text
);
create index paypal_webhook_retry on public.paypal_webhook_events(processed_at,received_at desc);
alter table public.paypal_webhook_events enable row level security;
grant select on public.subscriptions to service_role;
