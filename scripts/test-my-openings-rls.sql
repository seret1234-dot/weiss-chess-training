begin;

select set_config(
  'weiss_test.user_a',
  (select id::text from auth.users order by created_at, id limit 1),
  true
);
select set_config(
  'weiss_test.user_b',
  (select id::text from auth.users order by created_at, id offset 1 limit 1),
  true
);
select set_config(
  'weiss_test.opening_a',
  (select id::text from public.opening_lines order by id limit 1),
  true
);
select set_config(
  'weiss_test.opening_b',
  (select id::text from public.opening_lines order by id offset 1 limit 1),
  true
);

do $$
begin
  if current_setting('weiss_test.user_a', true) is null
    or current_setting('weiss_test.user_b', true) is null
    or current_setting('weiss_test.opening_a', true) is null
    or current_setting('weiss_test.opening_b', true) is null then
    raise exception 'RLS test requires two users and two opening lines';
  end if;
end
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('weiss_test.user_a'), true);
insert into public.user_opening_library (user_id, opening_id)
values (
  current_setting('weiss_test.user_a')::uuid,
  current_setting('weiss_test.opening_a')::uuid
);

do $$
declare visible_rows integer;
begin
  select count(*) into visible_rows from public.user_opening_library;
  if visible_rows <> 1 then
    raise exception 'owner SELECT failed: expected 1, received %', visible_rows;
  end if;

  delete from public.user_opening_library
  where user_id = current_setting('weiss_test.user_a')::uuid
    and opening_id = current_setting('weiss_test.opening_a')::uuid;
  get diagnostics visible_rows = row_count;
  if visible_rows <> 1 then
    raise exception 'owner DELETE failed: expected 1, received %', visible_rows;
  end if;
end
$$;

insert into public.user_opening_library (user_id, opening_id)
values (
  current_setting('weiss_test.user_a')::uuid,
  current_setting('weiss_test.opening_a')::uuid
);

select set_config('request.jwt.claim.sub', current_setting('weiss_test.user_b'), true);
do $$
declare
  affected integer;
  blocked boolean := false;
begin
  select count(*) into affected
  from public.user_opening_library
  where user_id = current_setting('weiss_test.user_a')::uuid;
  if affected <> 0 then raise exception 'cross-user SELECT leaked'; end if;

  delete from public.user_opening_library
  where user_id = current_setting('weiss_test.user_a')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-user DELETE succeeded'; end if;

  begin
    insert into public.user_opening_library (user_id, opening_id)
    values (
      current_setting('weiss_test.user_a')::uuid,
      current_setting('weiss_test.opening_b')::uuid
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'cross-user INSERT was not blocked'; end if;

  blocked := false;
  begin
    update public.user_opening_library set added_at = now();
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'UPDATE privilege unexpectedly available'; end if;
end
$$;

reset role;
set local role anon;
do $$
declare blocked boolean := false;
begin
  begin
    insert into public.user_opening_library (user_id, opening_id)
    values (
      current_setting('weiss_test.user_b')::uuid,
      current_setting('weiss_test.opening_b')::uuid
    );
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'anonymous INSERT was not blocked'; end if;

  blocked := false;
  begin
    perform count(*) from public.user_opening_library;
  exception when insufficient_privilege then
    blocked := true;
  end;
  if not blocked then raise exception 'anonymous SELECT was not blocked'; end if;
end
$$;

reset role;
rollback;

select count(*) as rows_after_rollback
from public.user_opening_library;
