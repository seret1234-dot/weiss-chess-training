begin;

-- Initial theme mastery needs durable proof of distinct verified chunks.
-- Existing rows retain their historical permanent_mastery value; no old
-- completion is inferred as a new distinct-chunk credit.
alter table public.user_curriculum_session_evidence
  add column if not exists learner_chunk integer
    check (learner_chunk is null or learner_chunk > 0);

alter table public.user_curriculum_theme_progress
  add column if not exists perfect_chunk_indices integer[] not null default '{}',
  add column if not exists required_perfect_chunks smallint not null default 3
    check (required_perfect_chunks between 1 and 3);

create index if not exists user_curriculum_session_focused_chunk_idx
  on public.user_curriculum_session_evidence (user_id, area, stage_order, theme_key, learner_chunk)
  where event_kind = 'focused' and learner_chunk is not null;

commit;
