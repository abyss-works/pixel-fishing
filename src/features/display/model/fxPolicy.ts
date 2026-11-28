// 시각 효과 강도 파생과 렌더러 배정(순수 모델). 강도 규칙의 정본은 사건 분류 표다.
import type { FormId, RarityId } from '../../../game/rules/logic';
import type { RegionId } from '../../../game/world';
import { DUPLICATE_SUPPRESS_MS, FX_ONLY_RULES, TOAST_POLICY } from './toastPolicy';
import type { FxEventKind, FxIntensity, FxOnlyKind, FxRule, SystemEventKind } from './toastPolicy';

export interface FxPoint { x: number; y: number }

export type CatchFxKind =
  | 'catch.legendaryOrFirstVariant' | 'catch.epicOrRecord' | 'catch.variant' | 'catch.routine';

/** 내 포획 대상 */
export interface CatchFxSubject {
  /** 포획 결과 uid. PiP 버퍼 항목과 같은 사건임을 맞추는 키 */
  eventId: string;
  region: RegionId;
  fishId: string;
  rarity: RarityId;
  form: FormId;
  isNew: boolean;
  /** 어군 위치(필드 px) */
  from: FxPoint;
  /** 낚은 배 위치(필드 px) */
  to: FxPoint;
  /** 잡기 홀드가 끝나는 벽시계 시각(ms) */
  holdEndsAt: number;
}

/** 다른 플레이어 포획 대상 */
export interface PeerCatchFxSubject {
  region: string;
  fishId: string;
  form?: FormId;
  from: FxPoint;
  to?: FxPoint;
}

/** 챔질 판정 글자 대상. 글자는 타이밍 바가 있던 자리에 뜬다 */
export interface JudgmentFxSubject {
  region: string;
  judgment: 'perfect' | 'good';
}

/** 판정 글자를 띄우는 시간(ms) */
export const JUDGMENT_MS = 700;

/** at은 Date.now() 벽시계 ms(UTC epoch)다 */
export type FxRequest =
  | { kind: CatchFxKind; direct: boolean; at: number; subject: CatchFxSubject }
  | { kind: 'live.peerCatch'; direct: false; at: number; subject: PeerCatchFxSubject }
  | { kind: 'catch.judgment'; direct: true; at: number; subject: JudgmentFxSubject };

export type FxRenderer = 'catch-card' | 'field' | 'pip';
export type FxScreen = 'main' | 'pip';
export type FxPlayIntensity = Exclude<FxIntensity, 'none'>;

export interface FxDirective {
  /** 중재자 발급 순번. 렌더러가 새 지시를 알아보는 키 */
  seq: number;
  renderer: FxRenderer;
  intensity: FxPlayIntensity;
  /** 지시 시점의 OS 동작 축소 판정. 렌더러는 판정하지 않고 이 값만 따른다 */
  reducedMotion: boolean;
  startAt: number;
  /** 만료 벽시계 ms. 카드와 PiP는 홀드 종료, 필드 점프는 시작 + 점프 길이 */
  endsAt: number;
  request: FxRequest;
}

export interface FxEnv {
  /** 스테이지 창이나 앱 창이 떠 있는가 */
  windowsOpen: boolean;
  reducedMotion: boolean;
  /** 필드 점프 길이(ms) */
  jumpMs: number;
}

export interface FxMediatorState {
  nextSeq: number;
  /** 화면별 가장 크게 점유 종료 시각 */
  largestUntil: Readonly<Record<FxScreen, number>>;
  /** `${kind}:${renderer}` 별 마지막 크게 시각 */
  lastLargeAt: ReadonlyMap<string, number>;
}

function fxRuleOf(kind: FxEventKind): FxRule | undefined {
  return kind in FX_ONLY_RULES ? FX_ONLY_RULES[kind as FxOnlyKind] : TOAST_POLICY[kind as SystemEventKind].fx;
}

/** 사건 종류와 직접 행동 여부에서 강도를 파생한다. 규칙이 없으면 'none' */
export function fxIntensityOf(kind: FxEventKind, direct: boolean): FxIntensity {
  const rule = fxRuleOf(kind);
  if (!rule) return 'none';
  return direct ? rule.direct : rule.indirect;
}

const CATCH_RENDERERS: readonly FxRenderer[] = ['catch-card', 'field', 'pip'];

/** 사건 종류별로 그리는 렌더러 */
export const FX_RENDERERS: Partial<Record<FxEventKind, readonly FxRenderer[]>> = {
  'catch.legendaryOrFirstVariant': CATCH_RENDERERS,
  'catch.epicOrRecord': CATCH_RENDERERS,
  'catch.variant': CATCH_RENDERERS,
  'catch.routine': CATCH_RENDERERS,
  'live.peerCatch': ['field'],
  'catch.judgment': ['field'],
};

export function createFxMediatorState(): FxMediatorState {
  return { nextSeq: 0, largestUntil: { main: 0, pip: 0 }, lastLargeAt: new Map() };
}

const screenOf = (renderer: FxRenderer): FxScreen => (renderer === 'pip' ? 'pip' : 'main');
const BLOCKABLE: readonly FxRenderer[] = ['field'];

/** 요청 하나를 렌더러별 지시로 바꾼다. 입력 상태를 바꾸지 않는 순수 함수 */
export function mediateFx(
  state: FxMediatorState, request: FxRequest, env: FxEnv,
): { state: FxMediatorState; directives: FxDirective[] } {
  const base = fxIntensityOf(request.kind, request.direct);
  const renderers = FX_RENDERERS[request.kind] ?? [];
  if (base === 'none') return { state, directives: [] };

  const fieldMs = request.kind === 'catch.judgment' ? JUDGMENT_MS : env.jumpMs;
  const holdEndsAt = 'holdEndsAt' in request.subject ? request.subject.holdEndsAt : request.at + fieldMs;
  const largestUntil = { ...state.largestUntil };
  const lastLargeAt = new Map(state.lastLargeAt);
  const directives: FxDirective[] = [];
  let nextSeq = state.nextSeq;

  for (const renderer of renderers) {
    let intensity: FxPlayIntensity = base;
    if (env.windowsOpen && BLOCKABLE.includes(renderer) && intensity !== 'small') intensity = 'small';
    const screen = screenOf(renderer);
    if (intensity === 'largest') {
      // 같은 요청의 렌더러끼리는 요청 이전의 점유만 본다
      if (state.largestUntil[screen] > request.at) intensity = 'large';
      else largestUntil[screen] = holdEndsAt;
    }
    if (intensity === 'large') {
      const key = `${request.kind}:${renderer}`;
      const last = state.lastLargeAt.get(key);
      if (last !== undefined && request.at - last < DUPLICATE_SUPPRESS_MS) intensity = 'small';
      else lastLargeAt.set(key, request.at);
    }
    directives.push({
      seq: nextSeq++,
      renderer,
      intensity,
      reducedMotion: env.reducedMotion,
      startAt: request.at,
      endsAt: renderer === 'field' ? request.at + fieldMs : holdEndsAt,
      request,
    });
  }
  return { state: { nextSeq, largestUntil, lastLargeAt }, directives };
}
