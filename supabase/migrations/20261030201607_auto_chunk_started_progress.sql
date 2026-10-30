-- A loader may create a progress row before the learner interacts with a
-- chunk. Keep that setup row distinct from a resumable learner attempt.
-- Existing rows are deliberately not backfilled: their historical state is
-- ambiguous and this migration must not change any customer progress.
begin;

alter table public.user_chunk_progress
  add column if not exists started_at timestamptz;

create index if not exists user_chunk_progress_resumable_lookup_idx
  on public.user_chunk_progress (user_id, started_at)
  where started_at is not null and is_mastered = false;

comment on column public.user_chunk_progress.started_at is
  'Set after the first legal learner move. Null loader-created rows are new, not resumable.';

commit;
