-- 변경 기록 — 관리 저장소 체인지로그의 public과 admin 항목을 관리자 대시보드가 읽는 표.
-- 행은 체인지로그 생성 도구가 만든 SQL로만 쓴다(id 기준 upsert와 철회 표시, 삭제 없음). 서버는 읽기만 한다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.changelog_entries (
  id text primary key,                                          -- 체인지로그 항목 id(<버전>-<두 자리 순번>)
  version text not null,
  date date not null,                                           -- 그 버전을 올린 날(KST 날짜)
  seq integer not null,                                         -- 버전 안의 항목 순번
  tier text not null check (tier in ('public', 'admin')),
  tag text not null,
  text text not null,
  withdrawn_at timestamptz,                                     -- 체인지로그에서 사라졌거나 대체된 항목을 철회로 표시한 시각
  synced_at timestamptz not null default now()
);
alter table public.changelog_entries enable row level security;
