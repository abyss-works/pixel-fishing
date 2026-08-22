// 액션 리듀서 — 모든 상태 변경의 유일한 진입점 (서버 권위 v0.5.0)
// 서버(api/action.ts)와 로컬 폴백(backend/local.ts — supabase 미설정 dev)이 같은 함수를 실행한다.
// 기존 logic/fishing 함수의 "조합만" 한다 — 규칙을 여기 새로 쓰지 않는다 (이중 구현 금지 원칙).
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM 로더)가 이 파일을 직접 import한다.
import {
  addCatch, buildCatchInfo, canFishSpot, migrate,
  redeemCoupon, rollCatchExtras, sellSelected, toggleLock, tryBuyBoat, tryUpgrade,
} from './logic.js';
import type { GameState, Judgment, CatchInfo } from './logic.js';
import { resolveCatch } from './fishing.js';
import type { SpotId } from '../data/spots.js';

export type GameAction =
  | { type: 'catch'; spot: SpotId; judgment: Judgment }
  | { type: 'sell'; entries: string[] }
  | { type: 'upgradeRod' }
  | { type: 'buyBoat' }
  | { type: 'toggleLock'; fishId: string }
  | { type: 'redeemCoupon'; code: string }
  | { type: 'import'; save: unknown };          // 이사 코드 불러오기 — 검증 없이 수입, 흔적만 남김

// 서버(api/action.ts) 화이트리스트 — Record가 유니온과의 완전 일치를 강제한다
// (액션 추가 시 여기 빠뜨리면 컴파일 에러 — 수동 이중 목록 드리프트 방지)
const ACTION_TYPE_MAP: Record<GameAction['type'], true> = {
  catch: true, sell: true, upgradeRod: true, buyBoat: true,
  toggleLock: true, redeemCoupon: true, import: true,
};
export const ACTION_TYPES = Object.keys(ACTION_TYPE_MAP) as GameAction['type'][];

/** 주입 의존성 — 서버는 실난수/서버시각, 테스트는 목킹, 동적 쿠폰은 호출자가 DB에서 조회해 공급 */
export interface ActionDeps {
  rng: () => number;
  today: string; // YYYY-MM-DD (첫 조우일 기록)
  dynamicCoupon?: { gold: number; desc: string } | null;
}

// 클라 연출용 부가 결과 — HTTP 경계를 넘으므로 직렬화 가능해야 한다 (Fish 객체 대신 id)
export type ActionResult =
  | { type: 'catch'; fishId: string; info: CatchInfo }
  | { type: 'sell'; gold: number }
  | { type: 'coupon'; gold: number; desc: string }
  | { type: 'none' };

/** 감사/집계 스트림(events 테이블)에 남길 레코드 — 랭킹·업적의 정본 (v0.6+) */
export interface GameEvent { type: string; payload: Record<string, unknown> }

export type ApplyOutcome =
  | { ok: true; state: GameState; result: ActionResult; events: GameEvent[] }
  | { ok: false; error: string };

export function applyAction(state: GameState, action: GameAction, deps: ActionDeps): ApplyOutcome {
  switch (action.type) {
    case 'catch': {
      // 서버가 게이트를 재검증한다 — 클라 사전 체크(UX용)와 별개 (R5b)
      if (!canFishSpot(state, action.spot)) return { ok: false, error: 'spot-locked' };
      // 호출 순서 고정: 추첨 → 부가 롤 — 구 클라이언트(Field)와 동일한 rng 소비 순서
      const fish = resolveCatch(action.spot, action.judgment, state.rod, deps.rng);
      const extras = rollCatchExtras(fish, deps.rng);
      // NEW 판정은 폼별 — 변이는 별개 개체 (v0.3.3)
      const varN = state.variantCaught[fish.id] ?? 0;
      const isNew = extras.mutated ? varN === 0 : (state.caught[fish.id] ?? 0) - varN === 0;
      const info = buildCatchInfo(fish, extras, isNew);
      return {
        ok: true,
        state: addCatch(state, fish, extras, deps.today),
        result: { type: 'catch', fishId: fish.id, info },
        events: [{ type: 'catch', payload: {
          fishId: fish.id, judgment: action.judgment, spot: action.spot,
          size: info.size, mutated: info.mutated, isNew: info.isNew,
        } }],
      };
    }
    case 'sell': {
      if (!Array.isArray(action.entries)) return { ok: false, error: 'bad-entries' };
      const next = sellSelected(state, action.entries.filter(e => typeof e === 'string'));
      const gold = next.gold - state.gold;
      return {
        ok: true, state: next,
        result: { type: 'sell', gold },
        events: [{ type: 'sell', payload: { gold, count: state.bag.length - next.bag.length } }],
      };
    }
    case 'upgradeRod': {
      const next = tryUpgrade(state);
      if (!next) return { ok: false, error: 'not-enough-gold' };
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'upgradeRod', payload: { toLevel: next.rod, cost: state.gold - next.gold } }],
      };
    }
    case 'buyBoat': {
      const next = tryBuyBoat(state);
      if (!next) return { ok: false, error: 'boat-requirements' };
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'buyBoat', payload: { tier: next.boat, cost: state.gold - next.gold } }],
      };
    }
    case 'toggleLock': {
      if (typeof action.fishId !== 'string') return { ok: false, error: 'bad-fish-id' };
      // 잠금은 감사 가치가 없어 이벤트를 남기지 않는다
      return { ok: true, state: toggleLock(state, action.fishId), result: { type: 'none' }, events: [] };
    }
    case 'redeemCoupon': {
      if (typeof action.code !== 'string') return { ok: false, error: 'bad-code' };
      const code = action.code.trim();
      const extra = deps.dynamicCoupon ? { [code]: deps.dynamicCoupon } : {};
      const res = redeemCoupon(state, code, extra);
      if (!res.ok) return { ok: false, error: `coupon:${res.reason}` };
      return {
        ok: true, state: res.state,
        result: { type: 'coupon', gold: res.reward.gold, desc: res.reward.desc },
        events: [{ type: 'coupon', payload: { code, gold: res.reward.gold } }],
      };
    }
    case 'import': {
      // v0.3.2 교훈: 검증하지 않고 수입한다 — 대신 events에 흔적을 남겨 v0.6 랭킹 정책의 근거로
      const next = migrate(action.save);
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'import', payload: { gold: next.gold, fame: next.fame } }],
      };
    }
    default:
      return { ok: false, error: 'unknown-action' };
  }
}
