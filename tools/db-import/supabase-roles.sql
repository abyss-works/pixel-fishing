-- 마이그레이션의 권한 부여, RLS 정책, 역할 설정이 참조하는 Supabase 역할. 로그인하지 않는 역할로 만든다(슈퍼유저로 실행).
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'authenticator'] loop
    if not exists (select 1 from pg_roles where rolname = r) then
      execute format('create role %I nologin', r);
    end if;
  end loop;
end $$;
