-- 옮긴 객체의 소유자를 앱 사용자로 넘긴다. 마이그레이션은 Supabase 역할 설정 때문에 슈퍼유저로 적용하므로,
-- 끝에 public·auth 스키마의 표·뷰·함수와 auth 스키마를 앱 사용자 소유로 바꾼다.
-- 앱 사용자 이름은 설정 import.app_role로 받는다. 식별 열에 딸린 시퀀스는 표를 따라 바뀐다.
do $$
declare
  owner text := current_setting('import.app_role');
  r record;
begin
  execute format('alter schema auth owner to %I', owner);
  for r in
    select c.oid::regclass as obj, c.relkind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'auth') and c.relkind in ('r', 'p', 'v', 'm')
  loop
    execute format('alter %s %s owner to %I',
      case r.relkind when 'v' then 'view' when 'm' then 'materialized view' else 'table' end, r.obj, owner);
  end loop;
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'auth')
  loop
    execute format('alter function %s owner to %I', r.fn, owner);
  end loop;
end $$;
