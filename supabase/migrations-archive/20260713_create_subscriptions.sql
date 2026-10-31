create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text unique,
  plan text not null default 'free',
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_plan_check
    check (plan in ('free', 'monthly', 'yearly', 'crypto_30', 'crypto_365')),

  constraint subscriptions_status_check
    check (status in ('inactive', 'active', 'trialing', 'past_due', 'cancelled', 'expired'))
);
alter table public.subscriptions enable row level security;
drop policy if exists "Users can view own subscription" on public.subscriptions;
create policy "Users can view own subscription"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id);
create or replace function public.set_subscription_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists set_subscription_updated_at on public.subscriptions;
create trigger set_subscription_updated_at
before update on public.subscriptions
for each row
execute function public.set_subscription_updated_at();
