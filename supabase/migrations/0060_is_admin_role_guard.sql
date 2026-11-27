-- public.is_admin() 판정을 role = 'admin'으로 한정해 maintainer 역할이 구 관리자 뷰·RPC를 통과하지 않게 막는다.
-- 순수 함수 정의 교체이므로 무중단 선적용이 안전하다.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid()
      and a.role = 'admin'
  );
$$;
