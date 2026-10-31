-- Local-only first pass. Existing progress, AI quotas, subscriptions and RLS are untouched.
begin;
create schema if not exists private;
create table public.auto_training_chunk_unlocks (
 user_id uuid not null references auth.users(id) on delete cascade,
 course text not null check (course in ('pattern','endgame','vision','openings','master_games')),
 trainer_key text not null,
 unit_key text not null,
 unlocked_at timestamptz not null default now(),
 charged_on date,
 primary key (user_id,course,trainer_key,unit_key)
);
create index auto_training_chunk_daily_idx on public.auto_training_chunk_unlocks(user_id,charged_on) where charged_on is not null;
alter table public.auto_training_chunk_unlocks enable row level security;
revoke all on public.auto_training_chunk_unlocks from public,anon,authenticated;
grant select on public.auto_training_chunk_unlocks to authenticated;
create policy auto_chunk_read_own on public.auto_training_chunk_unlocks for select to authenticated using ((select auth.uid())=user_id);

-- Definer is needed ONLY for the quota ledger write. No client INSERT/UPDATE/DELETE
-- grants. The public invoker wrapper cannot choose a user, tier, date or review flag.
create function private.claim_auto_training_chunk(p_course text,p_trainer_key text,p_unit_key text,p_item_ids text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_user uuid := auth.uid();
 v_now timestamptz;
 v_day date;
 v_premium boolean;
 v_existing boolean;
 v_used integer;
 v_source_key text;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_course is null or p_course not in ('pattern','endgame','vision','openings','master_games')
   or p_trainer_key is null or length(p_trainer_key) not between 1 and 300
   or p_unit_key is null or length(p_unit_key) not between 1 and 500
   or coalesce(cardinality(p_item_ids),0)>2000 then raise exception 'INVALID_AUTO_UNIT'; end if;
 if p_course='pattern' and p_unit_key !~ '^[1-9][0-9]{0,8}$' then raise exception 'INVALID_CHUNK'; end if;
 perform pg_advisory_xact_lock(hashtextextended('auto-chunk:'||v_user::text,0));
 -- Read the clock AFTER waiting for the lock: midnight cannot leave a stale day.
 v_now := clock_timestamp(); v_day := (v_now at time zone 'UTC')::date;
 select exists(select 1 from public.subscriptions s where s.user_id=v_user
   and s.status in ('active','trialing')
   and (s.current_period_end>v_now or (s.current_period_end is null and s.provider='manual'))) into v_premium;
 select count(*) into v_used from public.auto_training_chunk_unlocks where user_id=v_user and charged_on=v_day;
 select exists(select 1 from public.auto_training_chunk_unlocks where user_id=v_user and course=p_course and trainer_key=p_trainer_key and unit_key=p_unit_key) into v_existing;
 if not v_existing then
   if p_course='pattern' then
     -- Restored full courses retain the original source chunk boundaries. Older
     -- due rows may still use that source key (and earliest rows used index 0).
     -- Read optional legacy next_due_at via JSON so schemas without it still work.
     v_source_key := regexp_replace(p_trainer_key, ':(m[1-4]-)?full-precut-v1$', '');
     select exists(select 1 from public.user_chunk_progress p where p.user_id=v_user
       and (p.trainer_key=p_trainer_key or p.trainer_key=v_source_key)
       and greatest(p.chunk_index,1)=p_unit_key::integer
       and (p.is_mastered or p.mastered_puzzles_count>0 or p.next_review_at is not null
         or nullif(to_jsonb(p)->>'next_due_at','') is not null)) into v_existing;
     if not v_existing and v_source_key ~ '-mate-[1-5]$' and v_source_key<>p_trainer_key then
       -- Match Pattern Mate's existing read-only completion-credit mapping:
       -- each mastered historical chunk contributes at least 30 puzzles to the
       -- first N restored 30-puzzle chunks. Do not update historical progress.
       select exists(select 1 from public.user_chunk_progress p where p.user_id=v_user
         and p.trainer_key in (v_source_key,v_source_key||':m'||right(v_source_key,1)||'-v1')
         and p.is_mastered and p.chunk_index>=1
         group by p.trainer_key
         having sum(greatest(coalesce(p.mastered_puzzles_count,0),30)) >= p_unit_key::integer*30) into v_existing;
     end if;
   else
     -- Existing per-stage / per-position progress is the app's existing unlock
     -- evidence. Empty loader-created progress rows do not count as consumption.
     select exists(select 1 from public.training_progress p where p.user_id=v_user and p.course=p_course
       and p.theme=p_trainer_key and p.item_id=any(coalesce(p_item_ids,'{}'::text[]))
       and (p.mastery>0 or p.next_review_at is not null)) into v_existing;
   end if;
 end if;
 if not v_premium and not v_existing and v_used>=2 then
   return jsonb_build_object('allowed',false,'tier','free','used',v_used,'limit',2,'remaining',0,'reason','DAILY_NEW_CHUNK_LIMIT','reset_at',(v_day+1)::timestamp at time zone 'UTC');
 end if;
 insert into public.auto_training_chunk_unlocks(user_id,course,trainer_key,unit_key,charged_on)
 values(v_user,p_course,p_trainer_key,p_unit_key,case when v_premium or v_existing then null else v_day end)
 on conflict do nothing;
 if not v_premium and not v_existing then v_used:=v_used+1; end if;
 return jsonb_build_object('allowed',true,'tier',case when v_premium then 'premium' else 'free' end,
   'used',v_used,'limit',case when v_premium then null else 2 end,
   'remaining',case when v_premium then null else greatest(0,2-v_used) end,
   'reason',case when v_premium then 'PREMIUM' when v_existing then 'ALREADY_UNLOCKED' else 'NEW_CHUNK' end,
   'reset_at',(v_day+1)::timestamp at time zone 'UTC');
end $$;
revoke all on function private.claim_auto_training_chunk(text,text,text,text[]) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.claim_auto_training_chunk(text,text,text,text[]) to authenticated;
create function public.claim_auto_training_chunk(p_course text,p_trainer_key text,p_unit_key text,p_item_ids text[] default '{}')
returns jsonb language sql security invoker set search_path='' as $$
 select private.claim_auto_training_chunk(p_course,p_trainer_key,p_unit_key,p_item_ids);
$$;
revoke all on function public.claim_auto_training_chunk(text,text,text,text[]) from public,anon;
grant execute on function public.claim_auto_training_chunk(text,text,text,text[]) to authenticated;
-- Rollback: remove these two functions and this new table only. Dropping the
-- ledger loses allowance/unlock history; never touch the underlying progress.
commit;
