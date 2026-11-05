-- 채팅 — 전체 채널 하나의 메시지와 메시지 신고. 메시지는 30일, 신고는 1년 보관하고 예약 작업이 지난 행을 지운다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.
create table public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,  -- 보낸 사람
  nick text not null,                                                 -- 보낸 시점의 표시 이름(서버가 붙인다)
  text text not null check (char_length(text) between 1 and 100),
  created_at timestamptz not null default now()
);
alter table public.chat_messages enable row level security;
-- 보관 기간 정리용
create index chat_messages_created_idx on public.chat_messages (created_at);
-- 계정 정리용
create index chat_messages_user_idx on public.chat_messages (user_id);

-- 신고 — 신고한 메시지와 앞뒤 대화를 복사해 둔다. 원본 메시지가 지워져도 신고 기록은 남는다.
create table public.chat_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,  -- 신고한 사람
  message_id bigint not null,                                         -- 신고한 메시지(원본은 30일 뒤 지워지므로 외래 키를 두지 않는다)
  target_id uuid not null,                                            -- 신고당한 메시지의 보낸 사람
  lines jsonb not null,                                               -- 신고 메시지와 앞뒤 대화의 복사본(ChatLine 배열, 오래된 순)
  created_at timestamptz not null default now(),
  unique (user_id, message_id)                                        -- 같은 사람이 같은 메시지를 여러 번 신고해도 한 건
);
alter table public.chat_reports enable row level security;
-- 보관 기간 정리와 관리자 목록(최근 순)용
create index chat_reports_created_idx on public.chat_reports (created_at);
