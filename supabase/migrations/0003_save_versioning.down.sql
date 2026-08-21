-- DOWN: 0003 되돌리기 — append-only(유저당 다행) → user_id 단일 PK(유저당 1행)
-- v0.2.1 사고 때 즉석 작성해 프로덕션에서 실행·검증된 SQL을 페어로 보존한 것.
-- 실행 전제: 이후 코드는 upsert 모델(v0.1.x)이어야 한다. append-only 코드와 함께 쓰면 안 됨.

begin;

-- 0. 안전망: 되돌리기 전 전체 백업
create table if not exists public.saves_backup_before_rollback as
  select * from public.saves;

-- 1. 유저당 최신 1행만 남기고 정리 (PK 복원 전제조건)
delete from public.saves s
using (
  select id,
         row_number() over (
           partition by user_id
           order by updated_at desc, id desc
         ) as rn
  from public.saves
) ranked
where s.id = ranked.id
  and ranked.rn > 1;

-- 2~4. 0003이 추가한 것 제거, user_id 단일 PK 복원
alter table public.saves drop column if exists schema_version;
drop index if exists public.saves_user_latest_idx;
alter table public.saves drop constraint if exists saves_pkey;
alter table public.saves drop column if exists id;
alter table public.saves add primary key (user_id);

commit;
