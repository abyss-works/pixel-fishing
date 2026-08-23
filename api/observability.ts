// 관측(서버) — Vercel 함수의 에러 보고. 클라이언트 쪽은 src/observability.ts.
//
// ⚠️ **지연 로드가 핵심이다.** @sentry/node는 OpenTelemetry 의존을 끌고 오는 무거운 패키지라,
// 모듈 최상단에서 import하면 그것만으로 콜드 스타트가 늘어난다 — 액션 레이턴시를 2~3초에서
// 250~500ms로 줄인 작업을 되돌리는 짓이다.
// 그래서 **에러가 실제로 났을 때만** 동적 import한다: 정상 요청은 이 파일의 코드를 한 줄도
// 실행하지 않고, 첫 에러 한 번만 로드 비용을 낸다(에러 응답은 어차피 빠를 필요가 없다).
//
// 서버리스라 flush 필수 — 응답 후 프로세스가 즉시 얼어붙으면 전송 중인 이벤트가 버려진다.
import { APP_VERSION } from '../src/version.js';

type SentryNode = typeof import('@sentry/node');
let sentry: SentryNode | null = null;

async function load(dsn: string): Promise<SentryNode | null> {
  if (sentry) return sentry;
  const mod = await import('@sentry/node');
  mod.init({
    dsn,
    environment: process.env.SENTRY_ENV ?? process.env.VERCEL_ENV ?? 'development',
    release: APP_VERSION,          // 클라와 같은 릴리즈 문자열로 묶인다
    dataCollection: { userInfo: false },
    // 에러만 — 트레이싱/프로파일링은 끔 (쿼터·콜드스타트 보호)
    tracesSampleRate: 0,
  });
  sentry = mod;
  return sentry;
}

/**
 * 서버 실패 보고 — DSN 미설정이면 완전 무음(로컬·테스트 무영향).
 * 관측이 게임을 막으면 안 되므로 어떤 실패도 삼킨다.
 */
export async function reportServerIssue(
  what: string,
  detail: unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    const s = await load(dsn);
    if (!s) return;
    s.withScope(scope => {
      scope.setExtras({ ...context, detail: safe(detail) });
      if (detail instanceof Error) s.captureException(detail);
      else s.captureMessage(what, 'error');
    });
    await s.flush(1500); // 서버리스: 응답 후 프로세스가 얼기 전에 밀어낸다
  } catch {
    /* 관측 실패는 조용히 포기 — 액션 처리에 영향을 주지 않는다 */
  }
}

const safe = (v: unknown): unknown => {
  if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
  try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); }
};
