-- 편지 정규화 (2026-10-07) — events의 type='letter'를 영구 보존 테이블로 분리한다.
-- 근거: mgmt/decisions/letters-table.md · 계약: mgmt/spec/cold-archive.md 2절.
-- 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
-- 배포 후 이 파일의 복사 INSERT를 1회 재실행해 적용↔배포 경계의 편지를 흡수한다.

create table public.letters (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
alter table public.letters enable row level security;   -- 정책 없음 = service role 전용 (0009 reliefs 선례)
create index letters_created_at_idx on public.letters (created_at desc);

-- 관리자 열람 — 0010 패턴(definer 뷰 + is_admin 게이트, anon 회수·authenticated 허용)
create or replace view public.v_admin_letters as
select l.id, l.user_id, l.text, l.created_at
from public.letters l
where public.is_admin()
order by l.created_at desc;
revoke all on public.v_admin_letters from anon;
grant select on public.v_admin_letters to authenticated;

-- 기존 편지 복사 — 재실행 안전(같은 user·시각·본문이 있으면 skip)
insert into public.letters (user_id, text, created_at)
select e.user_id, e.payload->>'text', e.created_at
from public.events e
where e.type = 'letter'
  and e.payload->>'text' is not null
  and not exists (
    select 1 from public.letters l
    where l.user_id = e.user_id and l.created_at = e.created_at and l.text = e.payload->>'text'
  );
