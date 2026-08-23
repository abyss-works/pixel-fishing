// 관측(클라이언트) — Sentry 초기화 + 의도적 신호. 계층 밖의 횡단 관심사라 version.ts처럼
// src 루트에 단독으로 둔다. 서버(Vercel 함수) 쪽은 api/observability.ts가 별도로 맡는다.
//
// 설계 판단 :
// - **에러 모니터링만 켠다.** Tracing(성능)·Session Replay·Metrics는 전부 끔.
//   · Replay: 화면 본체가 캔버스라 DOM 녹화로는 빈 사각형만 남는다. 번들만 커지고
//     계정 폼의 이메일이 녹화 대상이 된다 — 값어치 없음.
//   · Tracing: 방치 낚시가 ~5초마다 /api/action을 쳐서 접속만으로 쿼터가 마른다.
//     레이턴시는 이미 250~500ms로 확인됨(ops/perf-action-latency.md) — 필요해지면
//     browserTracingIntegration + tracesSampleRate 두 줄로 켠다.
//   · Metrics(직접 심는 계측): 게임 지표는 events 테이블이 이미 정본이라 중복.
//     게다가 SDK가 아직 실험 API로 표시하고 있다.
// - **역할 경계**: events = 성공한 액션의 기록 / Sentry = 실패했거나 서버에 도달조차
//   못 한 것. 저장이 실패하면 DB엔 아무것도 안 남으므로 그건 여기서만 보인다.
// - **PII 미전송**: 유저 식별은 uid만 (이메일·닉네임 안 보냄).
// - DSN이 없으면 초기화 자체를 건너뛴다 → 로컬 dev·테스트는 완전 무음.
import * as Sentry from '@sentry/react';
import { APP_VERSION } from './version';

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export const observabilityEnabled = Boolean(DSN);

export function initObservability(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    // 스테이징/운영 에러가 한 통에 섞이지 않게 — Vercel 환경변수로 주입
    environment: (import.meta.env.VITE_SENTRY_ENV as string | undefined) ?? import.meta.env.MODE,
    // 릴리즈 귀속 — APP_VERSION이 클라·서버 단일 근원이라 그대로 물린다 
    release: APP_VERSION,
    // 유저 정보 자동 수집 끔 — 식별은 identifyUser()가 uid만 명시적으로 넣는다
    dataCollection: { userInfo: false },
  });
}

/** 로그인 유저 식별 — uid만. 이메일은 보내지 않는다 */
export function identifyUser(uid: string | null): void {
  if (!DSN) return;
  Sentry.setUser(uid ? { id: uid } : null);
}

/**
 * 의도적 신호 — **예외를 던지지 않는 실패**를 보고한다.
 * 이 프로젝트의 진짜 위험(저장 실패·버전 불일치·세이브 손상)은 크래시가 아니라
 * "조용히 잘못된 상태"라서, 자동 수집만으로는 영원히 안 보인다.
 */
export function reportIssue(
  message: string,
  level: 'warning' | 'error',
  context: Record<string, unknown> = {},
): void {
  if (!DSN) return;
  Sentry.captureMessage(message, { level, extra: context });
}

export { Sentry };
