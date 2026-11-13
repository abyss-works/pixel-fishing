-- 약관과 개인정보 처리방침의 수락 기록 — 계정이 어느 문서의 어느 판을 언제, 어느 경로로 수락했는지 한 행씩 남긴다.
-- 판은 시행일의 YYYY-MM-DD 문자열이다. 같은 계정, 문서, 판은 한 행이다. 수락 시각은 UTC로 저장한다.
-- 계정을 지우면 연쇄 삭제로 함께 지운다. 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.consent_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at timestamptz not null default now(),
  age_confirmed boolean not null,
  channel text not null check (channel in ('google-link', 'confirm-screen')),
  primary key (user_id, document, version)
);
alter table public.consent_records enable row level security;
