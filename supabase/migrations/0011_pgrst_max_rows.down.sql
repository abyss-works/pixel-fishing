alter role authenticator reset pgrst.db_max_rows;
alter role anon reset pgrst.db_max_rows;
do $$
begin
  perform 1 from pg_roles where rolname='service_role';
  if found then
    execute 'alter role service_role reset pgrst.db_max_rows';
  end if;
end$$;
