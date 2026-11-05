-- 활동 기록 — 실시간 채널 접속 세션, 사용자별 활동일, KST 하루 단위 일별 집계.
-- events는 콜드 아카이브로 최근 며칠만 남으므로, 장기 지표(DAU·리텐션·세션 길이)는 이 표들을 정본으로 읽는다.
-- 읽기·쓰기 정책 없음 = 서버 전용(0019 mails 선례). 순수 가산 — 이 파일 먼저 실행 → 코드 배포가 안전하다.

-- 접속 세션 — 실시간 채널 연결 하나가 세션 하나다. 같은 사람이 2분 안에 다시 연결하면 앞 세션을 늘린다.
create table public.play_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_sec int not null check (duration_sec >= 0),
  check (ended_at >= started_at)
);
alter table public.play_sessions enable row level security;
-- 일별 집계와 최근 세션 목록용
create index play_sessions_started_idx on public.play_sessions (started_at);
-- 사용자별 세션 기록과 이어 붙일 직전 세션 조회용
create index play_sessions_user_started_idx on public.play_sessions (user_id, started_at desc);

-- 사용자별 활동일 — 처리한 액션이 있는 KST 날짜. DAU와 리텐션의 장기 정본이다.
create table public.user_active_days (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);
alter table public.user_active_days enable row level security;
-- 날짜별 활성 수 집계용
create index user_active_days_day_idx on public.user_active_days (day);

-- 일별 집계 — KST 하루 한 행. 예약 작업이 events가 남아 있는 날을 계산해 넣는다. 행이 없는 날은 집계되지 않은 날이다.
create table public.daily_stats (
  day date primary key,
  dau int not null,                     -- 활동일이 그날인 사용자 수
  new_users int not null,               -- 그날 만든 인증 계정 수(게스트 포함)
  new_accounts int not null,            -- 그날 만든 인증 계정 가운데 지금 게스트가 아닌 계정 수
  sessions int not null,                -- 그날 시작한 세션 수
  session_minutes int not null,         -- 그날 시작한 세션 길이의 합(분)
  median_session_minutes numeric,       -- 그날 시작한 세션 길이의 중앙값(분). 세션이 없으면 null
  catches int not null,
  gold_in bigint not null,              -- 판매·쿠폰·우편 수령 골드
  gold_out bigint not null,             -- 낚싯대 강화·배 구입·미끼 구입 골드
  actions int not null,                 -- 그날의 이벤트 수(관리자 조치 제외)
  computed_at timestamptz not null default now()
);
alter table public.daily_stats enable row level security;
