// 액션 리듀서 — 모든 상태 변경의 유일한 진입점 (서버 권위 v0.5.0)
// 서버(api/action.ts)와 로컬 폴백(backend/local.ts — supabase 미설정 dev)이 같은 함수를 실행한다.
// 기존 logic/fishing 함수의 "조합만" 한다 — 규칙을 여기 새로 쓰지 않는다 (이중 구현 금지 원칙).
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM 로더)가 이 파일을 직접 import한다.
import {
  addCatch, buildCatchInfo, makeInstance, migrate,
  redeemCoupon, rollCatchExtras, sellSelected, toggleLock, tryBuyBoat, tryUpgrade,
} from './logic.js';
import type { GameState, Judgment, CatchInfo, FishInstance, FormRecord, FormId } from './logic.js';
import { resolveCatch } from './fishing.js';
import type { SpotId } from '../data/spots.js';
import { canBuyBoat, canFish, canUpgradeRod } from './rules.js';
import type { RejectReason } from './rules.js';

export type GameAction =
  | { type: 'catch'; spot: SpotId; judgment: Judgment }
  | { type: 'sell'; uids: string[] }            // 판매 원자 단위 = 개체 (세이브 v8)
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
  today: string;         // YYYY-MM-DD, 유저 체감 날짜(KST) — 도감 첫 조우일
  now: string;           // ISO datetime — 개체의 caughtAt
  newUid: () => string;  // 개체 uid 생성기 (서버/로컬 = crypto.randomUUID, 테스트는 결정적 목)
  dynamicCoupon?: { gold: number; desc: string } | null;
}

// 클라 연출용 부가 결과 — HTTP 경계를 넘으므로 직렬화 가능해야 한다 (Fish 객체 대신 id)
export type ActionResult =
  | { type: 'catch'; fishId: string; uid: string; info: CatchInfo }
  | { type: 'sell'; gold: number }
  | { type: 'coupon'; gold: number; desc: string }
  | { type: 'none' };

/** 감사/집계 스트림(events 테이블)에 남길 레코드 — 랭킹·업적의 정본 (v0.6+) */
export interface GameEvent { type: string; payload: Record<string, unknown> }

/** 정규화 저장을 위한 변경분 — 서버가 "무엇이 바뀌었나"를 알아야 테이블에 흩어 쓴다.
    리듀서 본문은 이걸 만들지 않는다: 전후 상태를 비교해 파생한다(케이스마다 손으로 채우면
    새 액션에서 빠뜨린다). saves_current는 어차피 낙관 락으로 통째 갱신하므로 델타가 없다. */
export interface StateWrites {
  instancesAdded: { inst: FishInstance; slot: number | null }[];
  instancesRemoved: string[];                              // uid
  instancesMoved: { uid: string; slot: number | null }[];  // 가방 ↔ 전시
  records: { fishId: string; form: FormId; rec: FormRecord }[];
}

export type ApplyOutcome =
  | { ok: true; state: GameState; result: ActionResult; events: GameEvent[]; writes: StateWrites }
  // 거부 사유는 타입이 있다  — 유저 문구는 REJECT_TEXT가 단일 근원
  | { ok: false; error: RejectReason };

/** 개체 → 슬롯 색인. 가방은 slot null, 전시대는 배열 인덱스가 곧 슬롯 번호다. */
function slotIndex(s: GameState): Map<string, { inst: FishInstance; slot: number | null }> {
  const m = new Map<string, { inst: FishInstance; slot: number | null }>();
  for (const inst of s.bag) m.set(inst.uid, { inst, slot: null });
  s.exhibit.forEach((inst, i) => m.set(inst.uid, { inst, slot: i }));
  return m;
}

/** 전후 비교로 변경분을 뽑는다 — 새 액션이 추가돼도 자동으로 잡힌다 */
function diffWrites(prev: GameState, next: GameState): StateWrites {
  const before = slotIndex(prev), after = slotIndex(next);
  const w: StateWrites = { instancesAdded: [], instancesRemoved: [], instancesMoved: [], records: [] };

  for (const [uid, cur] of after) {
    const old = before.get(uid);
    if (!old) w.instancesAdded.push(cur);
    else if (old.slot !== cur.slot) w.instancesMoved.push({ uid, slot: cur.slot });
  }
  for (const uid of before.keys()) if (!after.has(uid)) w.instancesRemoved.push(uid);

  // 도감은 종×폼 단위로 바뀐 행만 — 절대값이라 실패해도 다음 캐치가 자가 치유한다
  for (const [fishId, forms] of Object.entries(next.dex)) {
    for (const [form, rec] of Object.entries(forms)) {
      if (!rec) continue;
      const old = prev.dex[fishId]?.[form as FormId];
      if (!old || old.count !== rec.count || old.maxSize !== rec.maxSize || old.first !== rec.first) {
        w.records.push({ fishId, form: form as FormId, rec });
      }
    }
  }
  return w;
}

export function applyAction(state: GameState, action: GameAction, deps: ActionDeps): ApplyOutcome {
  const out = reduce(state, action, deps);
  return out.ok ? { ...out, writes: diffWrites(state, out.state) } : out;
}

type ReduceOutcome =
  | { ok: true; state: GameState; result: ActionResult; events: GameEvent[] }
  | { ok: false; error: RejectReason };

function reduce(state: GameState, action: GameAction, deps: ActionDeps): ReduceOutcome {
  switch (action.type) {
    case 'catch': {
      // 서버가 게이트를 재검증한다 — 클라 사전 체크(UX용)와 별개 (R5b)
      const gate = canFish(state, action.spot);
      if (!gate.ok) return { ok: false, error: gate.reason };
      // 호출 순서 고정: 추첨 → 부가 롤 — 구 클라이언트(Field)와 동일한 rng 소비 순서
      const fish = resolveCatch(action.spot, action.judgment, state.rod, deps.rng);
      const extras = rollCatchExtras(fish, deps.rng);
      // NEW 판정은 폼별 — 변이는 별개 개체 (v0.3.3)
      const isNew = (state.dex[fish.id]?.[extras.form]?.count ?? 0) === 0;
      const info = buildCatchInfo(fish, extras, isNew);
      const inst = makeInstance(fish, extras, {
        uid: deps.newUid(), now: deps.now, spot: action.spot, judgment: action.judgment,
      });
      return {
        ok: true,
        state: addCatch(state, inst, fish, deps.today),
        result: { type: 'catch', fishId: fish.id, uid: inst.uid, info },
        // uid를 남긴다 — 이벤트 스트림과 가방 개체를 잇는 유일한 연결고리 (감사·집계의 근거)
        events: [{ type: 'catch', payload: {
          uid: inst.uid, fishId: fish.id, judgment: action.judgment, spot: action.spot,
          size: info.size, form: info.form, isNew: info.isNew,
        } }],
      };
    }
    case 'sell': {
      if (!Array.isArray(action.uids)) return { ok: false, error: 'bad-request' };
      const uids = action.uids.filter(u => typeof u === 'string');
      const next = sellSelected(state, uids);
      const gold = next.gold - state.gold;
      // 실제로 사라진 개체만 = 가방 차집합 (없는 uid·잠긴 개체는 자동 제외)
      const remaining = new Set(next.bag.map(i => i.uid));
      const soldUids = state.bag.filter(i => !remaining.has(i.uid)).map(i => i.uid);
      return {
        ok: true, state: next,
        result: { type: 'sell', gold },
        events: [{ type: 'sell', payload: {
          gold, count: state.bag.length - next.bag.length, uids: soldUids,
        } }],
      };
    }
    case 'upgradeRod': {
      const check = canUpgradeRod(state);
      if (!check.ok) return { ok: false, error: check.reason };
      const next = tryUpgrade(state)!;
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'upgradeRod', payload: { toLevel: next.rod, cost: state.gold - next.gold } }],
      };
    }
    case 'buyBoat': {
      const check = canBuyBoat(state);
      if (!check.ok) return { ok: false, error: check.reason };
      const next = tryBuyBoat(state)!;
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'buyBoat', payload: { tier: next.boat, cost: state.gold - next.gold } }],
      };
    }
    case 'toggleLock': {
      if (typeof action.fishId !== 'string') return { ok: false, error: 'bad-request' };
      // 잠금은 감사 가치가 없어 이벤트를 남기지 않는다
      return { ok: true, state: toggleLock(state, action.fishId), result: { type: 'none' }, events: [] };
    }
    case 'redeemCoupon': {
      if (typeof action.code !== 'string') return { ok: false, error: 'bad-request' };
      const code = action.code.trim();
      const extra = deps.dynamicCoupon ? { [code]: deps.dynamicCoupon } : {};
      const res = redeemCoupon(state, code, extra);
      if (!res.ok) return { ok: false, error: res.reason === 'used' ? 'coupon-used' : 'coupon-invalid' };
      return {
        ok: true, state: res.state,
        result: { type: 'coupon', gold: res.reward.gold, desc: res.reward.desc },
        events: [{ type: 'coupon', payload: { code, gold: res.reward.gold } }],
      };
    }
    case 'import': {
      // v0.3.2 교훈: 검증하지 않고 수입한다 — 대신 events에 흔적을 남겨 v0.6 랭킹 정책의 근거로
      const next = migrate(action.save, deps.newUid);
      return {
        ok: true, state: next, result: { type: 'none' },
        events: [{ type: 'import', payload: { gold: next.gold, fame: next.fame } }],
      };
    }
    default:
      return { ok: false, error: 'bad-request' };
  }
}
