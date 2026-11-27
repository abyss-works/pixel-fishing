-- 0060 되돌림 — public.is_admin()을 role 조건 없이 admins 행 존재만 검사하는 이전 정의로 복원한다.

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
  );
$$;
