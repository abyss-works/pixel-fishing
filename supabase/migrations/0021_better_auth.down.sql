-- 0021 되돌리기. 공개 표의 외래 키를 auth.supabase_users로 되돌리고 Better Auth 표를 지운 뒤 원래 이름을 돌려준다.
-- Better Auth로 새로 만든 계정은 auth.supabase_users에 없으므로, 그 계정의 공개 표 행이 있으면 외래 키 재설정이 실패한다.
drop view public.v_admin_users;

do $$
declare
  r record;
begin
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and n.nspname = 'public'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname,
      replace(r.def, 'auth.users', 'auth.supabase_users'));
  end loop;
end $$;

drop table auth.verifications;
drop table auth.accounts;
drop table auth.sessions;
drop table auth.users;

alter table auth.supabase_users rename to users;

create view public.v_admin_users as
select
  u.id                       as user_id,
  u.email,
  u.is_anonymous,
  u.created_at               as signed_up_at,
  u.last_sign_in_at,
  c.gold, c.fame, c.boat, c.rod,
  c.data -> 'location' ->> 'kind' as location_kind,
  c.data -> 'location' ->> 'id'   as location_id,
  c.data -> 'visited'             as visited,
  c.restricted,
  c.version                  as save_version,
  c.updated_at               as last_action_at
from auth.users u
left join public.saves_current c on c.user_id = u.id
where public.is_admin();
revoke all on public.v_admin_users from anon;
grant select on public.v_admin_users to authenticated;
