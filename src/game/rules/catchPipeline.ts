// 공통 포획 파이프라인 규칙 — 구역 프로필, 판정 강등, 타이밍·무결성 검증, 감사 이벤트 계약을 단일화한다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { EVENT2_STANDARD_SPEC } from '../content/eventFish.js';
import type { SpotId } from '../content/spots.js';
import type { Judgment } from './logic.js';
import { rodStats } from './logic.js';
import type { PowerZone } from './stats.js';
import { redZoneCenter, timingPos, verifyClaimedJudgment } from './timing.js';

export type ClaimCheckResult = ReturnType<typeof verifyClaimedJudgment>;

export type CatchMode = 'regular' | 'event';

/** 감사 이벤트(events.type) 포획 조회 공용 상수 — 단일화 이후 'catch'와 7일 하위호환 'eventCatch'를 함께 포괄한다 */
export const CATCH_EVENT_TYPES = ['catch', 'eventCatch'] as const;

export interface SpotRuleProfile {
  readonly spotId: SpotId;
  readonly mode: CatchMode;
  readonly rodSpec:
    | { kind: 'player' }
    | {
        readonly kind: 'standard';
        readonly rodLevel: number;
        readonly power: number;
        readonly powerReq: number;
        readonly idleBoost: number;
      };
  readonly valueKind: 'gold' | 'score';
  readonly supportsBag: boolean;
  readonly supportsBounty: boolean;
  readonly supportsIdleQueue: boolean;
}

/** 해역 ID에 대응하는 포획 규칙 프로필을 돌려준다 */
export function spotRuleProfileOf(spotId: SpotId): SpotRuleProfile {
  if (spotId === 'championship') {
    return {
      spotId,
      mode: 'event',
      rodSpec: {
        kind: 'standard',
        rodLevel: EVENT2_STANDARD_SPEC.rodLevel,
        power: EVENT2_STANDARD_SPEC.power,
        powerReq: EVENT2_STANDARD_SPEC.powerReq,
        idleBoost: EVENT2_STANDARD_SPEC.idleBoost,
      },
      valueKind: 'score',
      supportsBag: false,
      supportsBounty: false,
      supportsIdleQueue: false,
    };
  }
  return {
    spotId,
    mode: 'regular',
    rodSpec: { kind: 'player' },
    valueKind: 'gold',
    supportsBag: true,
    supportsBounty: true,
    supportsIdleQueue: true,
  };
}

/** 파워 존(빨간·노란 존 폭)에 따라 불가능한 수동 판정을 강등한다(일반·이벤트 공통) */
export function demoteJudgment(claimed: Judgment, pz: Pick<PowerZone, 'red' | 'yellow'>): Judgment {
  if (claimed === 'perfect' && pz.red <= 0) return pz.yellow > 0 ? 'good' : 'normal';
  if (claimed === 'good' && pz.yellow <= 0) return 'normal';
  return claimed;
}

export interface CatchTimingAudit {
  pos: number | null;
  redPos: number | null;
  redWidth: number;
  claimCheck: ClaimCheckResult | null;
}

/** 수동 챔질의 타이밍 위치, 빨간 존 중심, 판정 일관성(claimCheck)을 계산한다(일반·이벤트 공통) */
export function evaluateCatchTiming(input: {
  claimedJudgment: Judgment;
  biteElapsed?: number;
  rodLevel: number;
  pz: Pick<PowerZone, 'yellow' | 'red'>;
  redZoneSeed: string;
}): CatchTimingAudit {
  const pos = timingPos(input.biteElapsed, rodStats(input.rodLevel).sweep);
  const redWidth = input.pz.red / 100;
  const redPos = input.claimedJudgment !== 'auto'
    ? redZoneCenter(input.redZoneSeed, input.pz.yellow / 100, redWidth)
    : null;
  const claimCheck = input.claimedJudgment !== 'auto' && redPos !== null
    ? verifyClaimedJudgment(input.claimedJudgment, pos, redPos, input.pz.yellow / 100, redWidth)
    : null;
  return { pos, redPos, redWidth, claimCheck };
}

/** 감사 이벤트 행이 이벤트 구역 포획인지 판별한다(신규 type='catch'+mode='event' 및 구형 type='eventCatch' 하위호환) */
export function isEventCatchPayload(type: string | undefined, payload: unknown): boolean {
  if (type === 'eventCatch') return true;
  if (type !== 'catch' || !payload || typeof payload !== 'object') return false;
  const p = payload as { mode?: unknown; spot?: unknown };
  return p.mode === 'event' || p.spot === 'championship';
}
