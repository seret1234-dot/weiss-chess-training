begin;

alter table public.user_auto_profile
  add column if not exists manual_current_rating integer check (manual_current_rating between 100 and 3000),
  add column if not exists goal_timeframe_months smallint check (goal_timeframe_months between 1 and 120),
  add column if not exists current_milestone_rating integer check (current_milestone_rating between 100 and 3000);

comment on column public.user_auto_profile.manual_current_rating is
  'Optional user-entered fallback. estimated_rating remains the canonical normalized training rating when available.';
comment on column public.user_auto_profile.goal_timeframe_months is
  'Optional target duration in months; null means a long-term goal with no deadline.';
comment on column public.user_auto_profile.current_milestone_rating is
  'Optional nearer training milestone while target_rating remains the long-term goal.';

commit;
