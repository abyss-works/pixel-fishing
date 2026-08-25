// 실패 처리 일원화 
// 규칙: 실패한 곳은 **던지기만** 한다. 무엇을 보여줄지는 여기 정책 표가 혼자 정한다.
//
// ⚠️ React ErrorBoundary만으로는 부족하다 — 렌더 예외만 잡고 비동기·이벤트 핸들러·타이머는
// 놓친다. 이 게임의 실패는 거의 전부 그쪽이라(dispatch, 캔버스 클릭, 낚시 타이머) 입구를
// 셋 다 열어 같은 정책으로 모은다: ErrorBoundary · window.onerror · unhandledrejection.
import { reportIssue } from './observability';

/** 실패 종류 — 인프라 실패만 여기 온다. 규칙 거부(골드 부족 등)는 에러가 아니라 값이다 */
export type FailureKind =
  | 'network'       // 순단·타임아웃·플랫폼 장애
  | 'unauthorized'  // 세션 없음/만료
  | 'outdated'      // 426 — 배포 후 새로고침 안 한 낡은 탭
  | 'restricted'    // 403 — 제재 계정(0008) / 권한 없는 요청(import 게이트)
  | 'server'        // 5xx
  | 'bug';          // 예상 못 한 예외

export class AppError extends Error {
  // 생성자 파라미터 프로퍼티는 못 쓴다 — tsconfig의 erasableSyntaxOnly(타입 지우면 곧 JS) 제약
  readonly kind: FailureKind;
  readonly context: Record<string, unknown>;

  constructor(
    kind: FailureKind,
    message: string,
    context: Record<string, unknown> = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'AppError';
    this.kind = kind;
    this.context = context;
  }
}

/** 종류별 대응 — 새 실패 종류 = 여기 행 하나. UI 문구를 각 지점에 흩지 않는다 */
export interface FailureResponse {
  /** 이사 코드를 만들어 복구를 안내한다 (진행이 저장되지 않은 실패) */
  rescue: boolean;
  /** 전체를 덮는 모달 */
  modal?: 'update';
  /** 유저에게 보일 한 줄 (rescue 안내문의 머리글로도 쓰인다) */
  message: string;
  /** Sentry 보고 수준 — outdated는 정상 동작이라 warning */
  level: 'warning' | 'error';
}

export const POLICY: Record<FailureKind, FailureResponse> = {
  network: {
    rescue: true, level: 'error',
    message: '서버에 연결하지 못해 이번 행동이 저장되지 않았어요.',
  },
  unauthorized: {
    rescue: true, level: 'error',
    message: '로그인이 만료되어 저장되지 않았어요. 새로고침 후 다시 로그인해 주세요.',
  },
  outdated: {
    // 진행은 서버에 안전하다 — 구조 불필요, 새로고침만 안내
    rescue: false, modal: 'update', level: 'warning',
    message: '새 버전이 배포되었어요. 새로고침하면 이어서 플레이할 수 있어요.',
  },
  restricted: {
    // 제재 계정(0008)·권한 없는 요청 모두. 진행은 서버에 안전 — 구조 불필요, 문의 유도.
    rescue: false, level: 'warning',
    message: '지금 이 계정으로는 이용할 수 없어요. 개발자에게 문의해 주세요.',
  },
  server: {
    rescue: true, level: 'error',
    message: '서버에 문제가 생겨 이번 행동이 저장되지 않았어요.',
  },
  bug: {
    // 구조 안 함: 서버 권위라 완료된 액션은 이미 저장돼 있다. 클라 버그로 잃을 진행이 없고,
    // 렌더 예외면 ErrorBoundary 화면이 이미 떠 있어 경고창까지 겹치면 소음이다.
    rescue: false, level: 'error',
    message: '예상치 못한 문제가 생겼어요. 새로고침하면 이어서 플레이할 수 있어요.',
  },
};

/** 알 수 없는 예외를 AppError로 정규화 — 정책 표가 항상 답을 갖도록 */
export function asAppError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError('bug', message, {}, { cause: e });
}

// ---------- 싱크 (모든 입구가 여기로 모인다) ----------

type Listener = (err: AppError) => void;
const listeners = new Set<Listener>();

/**
 * 지역 복구 구독 — 예: Field가 "실패하면 낚시를 취소한다"를 한 줄로 표현한다.
 * 지점마다 try/catch를 되살리지 않으면서도 지역 정리를 할 수 있게 하는 장치.
 */
export function subscribeFailure(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** 유일한 처리 지점 — 보고 + 정책 적용 + 구독자 통지 */
export function fail(e: unknown): AppError {
  const err = asAppError(e);
  const policy = POLICY[err.kind];
  reportIssue(`${err.kind}: ${err.message}`, policy.level, err.context);
  for (const fn of listeners) {
    try { fn(err); } catch { /* 구독자 하나가 죽어도 나머지 처리는 계속 */ }
  }
  return err;
}

/** 비동기·이벤트 핸들러·타이머 예외를 정책으로 끌어온다 (main.tsx에서 1회) */
export function installGlobalFailureHandlers(): void {
  window.addEventListener('unhandledrejection', e => { fail(e.reason); });
  window.addEventListener('error', e => { fail(e.error ?? e.message); });
}
