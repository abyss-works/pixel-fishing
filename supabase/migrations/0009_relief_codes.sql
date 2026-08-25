-- 지원 코드 — 제재 소프트 랜딩 (incidents/2026-08-24-import-abuse.md)
-- 무기한 임의 이관(import)이 아니라 **운영자가 발급한 일회성 자산 패키지**다:
-- 골드·명성·낚싯대·배·도감을 담아, 수령자는 새 계정 설정 탭에서 코드를 입력한다.
-- coupons 테이블과 별개인 이유: 내용물이 골드 한 줄이 아니라 자산 묶음이라 스키마가 다르고,
-- "누가 언제 수령했나" 감사를 코드당 1행(active·claimed_by)으로 닫고 싶다.
create table public.reliefs (
  code text primary key,
  gold bigint not null default 0,
  fame bigint not null default 0,
  rod  int    not null default 1,
  boat int    not null default 0,
  dex  jsonb  not null default '{}'::jsonb,  -- GameState.dex 동형 (종→폼→{count,maxSize,first})
  active boolean not null default true,      -- 서버가 조건부 UPDATE로 선소비한다(경합 차단)
  claimed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.reliefs enable row level security;
-- 읽기/쓰기 정책 없음 = service role(/api/action) 전용 — 코드 목록이 클라로 새지 않는다(쿠폰 선례).
