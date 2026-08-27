// 액션 리듀서 — 모든 상태 변경의 유일한 진입점 (서버 권위 v0.5.0)
// 서버(api/action.ts)와 로컬 폴백(backend/local.ts — supabase 미설정 dev)이 같은 함수를 실행한다.
// 기존 logic/fishing 함수의 "조합만" 한다 — 규칙을 여기 새로 쓰지 않는다 (이중 구현 금지 원칙).
// 상대경로 .js 확장자 필수 — api/action.ts(Node 순수 ESM 로더)가 이 파일을 직접 import한다.
import {
  addCatch, buildCatchInfo, makeInstance, migrate,
  redeemCoupon, rollCatchExtras, sellSelected, setLocked, tryBuyBoat, tryUpgrade,
  overflowUids, release, bagCapacity, instanceFish, formName, travel, applyRelief,
  addItem, takeItem, usableBait,
} from './logic.js';
import type { GameState, Judgment, CatchInfo, FishInstance, FormRecord, FormId, ReliefGrant, Fish } from './logic.js';
import { relativeIdleBoost, manualPowerBonus } from './power.js';
import { SPOTS, rarityWeightOf } from '../data/spots.js';
import { baitById } from '../data/baits.js';
import type { SpotId } from '../data/spots.js';
import type { LocationRef } from '../data/places.js';
import { canBuyBoat, canFish, canUpgradeRod } from './rules.js';
import type { RejectReason } from './rules.js';
import { powerZones, rodPower } from './stats.js';
import { rollFish } from './logic.js';
import { BAIT_WEIGHT_MULT, BAIT_BUY_MAX, JUDGMENT_MULT } from './balance.js';

export type GameAction =
  | { type: 'catch'; spot: SpotId; judgment: Judgment }
  | { type: 'sell'; uids: string[] }            // 판매 원자 단위 = 개체 (세이브 v8)
  | { type: 'upgradeRod' }
  | { type: 'buyBoat' }
  | { type: 'setLocked'; uids: string[]; locked: boolean }
  | { type: 'travel'; to: LocationRef }
  | { type: 'sendLetter'; text: string }
  | { type: 'redeemCoupon'; code: string }
  | { type: 'claimRelief'; code: string }       // 지원 코드 — 제재 소프트 랜딩 (incidents/2026-08-24)
  | { type: 'adminSet'; gold?: number; fame?: number; rod?: number; boat?: number } // 관리자 테스트용 스탯 직접 수정
  | { type: 'buyBait'; bait: unknown; count?: unknown }      // 미끼 구매 — 골드 소모, 스택 적립
  | { type: 'setActiveBait'; bait: unknown }                 // 활성화(4중 1) — null은 비활성
  | { type: 'import'; save: unknown };          // 이사 코드 불러오기 — 검증 없이 수입, 흔적만 남김

// 서버(api/action.ts) 화이트리스트 — Record가 유니온과의 완전 일치를 강제한다
// (액션 추가 시 여기 빠뜨리면 컴파일 에러 — 수동 이중 목록 드리프트 방지)
const ACTION_TYPE_MAP: Record<GameAction['type'], true> = {
  catch: true, sell: true, upgradeRod: true, buyBoat: true,
  setLocked: true, travel: true, sendLetter: true, redeemCoupon: true,
  claimRelief: true, adminSet: true,
  buyBait: true, setActiveBait: true, import: true,
};
export const ACTION_TYPES = Object.keys(ACTION_TYPE_MAP) as GameAction['type'][];

/** 주입 의존성 — 서버는 실난수/서버시각, 테스트는 목킹, 동적 쿠폰은 호출자가 DB에서 조회해 공급 */
export interface ActionDeps {
  rng: () => number;
  today: string;         // YYYY-MM-DD, 유저 체감 날짜(KST) — 도감 첫 조우일
  now: string;           // ISO datetime — 개체의 caughtAt
  newUid: () => string;  // 개체 uid 생성기 (서버/로컬 = crypto.randomUUID, 테스트는 결정적 목)
  dynamicCoupon?: { gold: number; desc: string } | null;
  /** 지원 코드 자산 — 서버가 reliefs 테이블을 선소비한 뒤 공급한다. 로컬 dev엔 항상 없다 */
  relief?: ReliefGrant | null;
}

// 클라 연출용 부가 결과 — HTTP 경계를 넘으므로 직렬화 가능해야 한다 (Fish 객체 대신 id)
export type ActionResult =
  /** released = 이 캐치로 가방이 넘쳐 놓아준 개체들. 유저에게 반드시 알려야 한다 */
  | { type: 'catch'; fishId: string; uid: string; info: CatchInfo; released: ReleasedFish[] }
  | { type: 'sell'; gold: number }
  | { type: 'coupon'; gold: number; desc: string }
  | { type: 'none' };

/** 편지 한 통의 길이 상한 — 상한이 없으면 깨진 클라이언트가 events를 채운다.
 *  레이트 리밋은 두지 않았다(친구 규모). 남용이 보이면 그때 더한다. */
export const LETTER_MAX = 1000;

/** 놓아준 개체의 표시용 요약 — HTTP 경계를 넘으므로 Fish 객체 대신 이름만 */
export interface ReleasedFish { uid: string; name: string }

/** 감사/집계 스트림(events 테이블)에 남길 레코드 — 랭킹·업적의 정본 (v0.6+) */
export interface GameEvent { type: string; payload: Record<string, unknown> }

/** 정규화 저장을 위한 변경분 — 서버가 "무엇이 바뀌었나"를 알아야 테이블에 흩어 쓴다.
    리듀서 본문은 이걸 만들지 않는다: 전후 상태를 비교해 파생한다(케이스마다 손으로 채우면
    새 액션에서 빠뜨린다). saves_current는 어차피 낙관 락으로 통째 갱신하므로 델타가 없다. */
export interface StateWrites {
  instancesAdded: { inst: FishInstance; slot: number | null }[];
  instancesRemoved: string[];                              // uid
  instancesMoved: { uid: string; slot: number | null }[];  // 가방 ↔ 전시
  instancesLocked: { uid: string; locked: boolean }[];      // 잠금 토글
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
  const w: StateWrites = {
    instancesAdded: [], instancesRemoved: [], instancesMoved: [], instancesLocked: [], records: [],
  };

  for (const [uid, cur] of after) {
    const old = before.get(uid);
    if (!old) { w.instancesAdded.push(cur); continue; }
    if (old.slot !== cur.slot) w.instancesMoved.push({ uid, slot: cur.slot });
    if (old.inst.locked !== cur.inst.locked) w.instancesLocked.push({ uid, locked: cur.inst.locked });
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
      // 파워 게이트(서버 권위 백스톱) — 존은 수역 파워에서 온다(stats.powerZones).
      // 클라 주장을 존이 허용하는 최고 등급으로 내린다: PERFECT→GOOD→NORMAL. 미달이면
      // 일반 가중치 지수 페널티(mult)가 적용되고, 초과면 mult=1로 기존 밸런스와 동일.
      const pz = powerZones(state, action.spot);
      let judgment: Judgment = action.judgment;
      if (judgment === 'perfect' && pz.red <= 0) judgment = pz.yellow > 0 ? 'good' : 'normal';
      else if (judgment === 'good' && pz.yellow <= 0) judgment = 'normal';
      // 미끼 — 방치(auto)에는 소모·효과 없다. 수동 판정은 낚아올리는 순간 확정되므로
      // 소모도 이 지점(리듀서)에서 1회가 자연스럽다(던질 때 소모면 방치 복구 분기가 필요했다).
      // 효과 = targetRarity 어종 가중치 ×2 → 등급 예산 ×2(budgets 오버라이드)와 동치
      // (drawWeights 주석: 등급 내 균등 배분 하 개체 전부 ×2 ≡ 예산 ×2). rareMult/commonMult
      // 다이얼(common 축 전용)을 건드리지 않는다 — 확률 표 해석이 어긋난다.
      const bait = judgment === 'auto' ? undefined : usableBait(state);
      const drawOpts = bait
        ? { budgets: { [bait.targetRarity]: rarityWeightOf(action.spot, bait.targetRarity) * BAIT_WEIGHT_MULT } }
        : {};
      // 호출 순서 고정: 추첨 → 부가 롤 — 구 클라이언트(Field)와 동일한 rng 소비 순서
      let fish: Fish;
      const entry = SPOTS.find(s => s.id === action.spot)?.powerReq ?? 0;
      if (judgment === 'auto') {
        // auto는 파워 기준 상대 페널티(진입×10 상한, 10→4)로 스케일링 — 절대치 autoCommonBoost 대신
        const relBoost = relativeIdleBoost(rodPower(state), entry);
        fish = rollFish(action.spot, 1, deps.rng, relBoost * pz.mult, drawOpts);
      } else {
        // 수동 보정(v0.6.4) — 초과 5당 ×0.1, 최대 ×2.0. rollFish 산식상 일반 가중치를
        // 그만큼 나누는 것과 동치다(방치 페널티 완화의 거울 축 — power.ts).
        const bonus = manualPowerBonus(rodPower(state), entry);
        fish = rollFish(action.spot, JUDGMENT_MULT[judgment] * bonus, deps.rng, pz.mult, drawOpts);
      }
      const extras = rollCatchExtras(fish, deps.rng);
      // NEW 판정은 폼별 — 변이는 별개 개체 (v0.3.3)
      const isNew = (state.dex[fish.id]?.[extras.form]?.count ?? 0) === 0;
      const info = buildCatchInfo(fish, extras, isNew);
      const inst = makeInstance(fish, extras, {
        uid: deps.newUid(), now: deps.now, spot: action.spot, judgment,
      });
      const caught = addCatch(state, inst, fish, deps.today);
      // 가방이 넘치면 가장 안 특별한 개체를 놓아준다. 방금 잡은 놈이 후보일 수도 있다
      // ("가방이 꽉 차서 그 자리에서 놓아줬다") — 명성·도감은 이미 확정됐으므로 남는다.
      // 상한은 **캐치 전** 가방으로 잰다(래칫). 그래야 이미 넘겨 든 유저도 한 번에 한 마리만 나간다.
      const overflow = overflowUids(caught.bag, bagCapacity(state.boat, state.bag));
      const released: ReleasedFish[] = overflow.map(uid => {
        const i = caught.bag.find(b => b.uid === uid)!;
        const f = instanceFish(i);
        return { uid, name: f ? formName(f, i.form) : i.fishId };
      });
      const events: GameEvent[] = [{ type: 'catch', payload: {
        // uid를 남긴다 — 이벤트 스트림과 가방 개체를 잇는 유일한 연결고리 (감사·집계의 근거)
        // judgment는 강등 확정값 — 감사에서 "PERFECT 주장이 서버에서 살아남았나"를 보려면 이 값이다
        uid: inst.uid, fishId: fish.id, judgment, spot: action.spot,
        size: info.size, form: info.form, isNew: info.isNew,
        // 미끼 사용은 감사 흔적로 catch에 합친다 — 별도 이벤트면 스트림이 낚시 로그로 두 배가 된다
        ...(bait ? { bait: bait.id } : {}),
      } }];
      // 방생도 스트림에 남긴다 — 개체가 사라진 이유가 판매인지 넘침인지 구분돼야 집계가 선다
      if (overflow.length > 0) {
        events.push({ type: 'autoRelease', payload: { uids: overflow, reason: 'bag-full' } });
      }
      const next = takeItem(release(caught, overflow), bait?.id ?? '');
      return {
        ok: true,
        state: next,
        result: { type: 'catch', fishId: fish.id, uid: inst.uid, info, released },
        events,
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
    case 'travel': {
      const to = action.to;
      if (!to || typeof to.id !== 'string'
          || (to.kind !== 'region' && to.kind !== 'base')) return { ok: false, error: 'bad-request' };
      const next = travel(state, to);
      // 첫 방문만 이벤트로 남긴다 — 오갈 때마다 남기면 스트림이 이동 로그로 뒤덮인다.
      // 업적 진행도는 state.visited가 들고 있으므로 이벤트는 "언제 처음 갔나"의 기록이다.
      const first = to.kind === 'region' && !state.visited.includes(to.id);
      return {
        ok: true, state: next, result: { type: 'none' },
        events: first ? [{ type: 'visit', payload: { region: to.id } }] : [],
      };
    }
    case 'sendLetter': {
      // 편지는 **게임 상태가 아니다.** 상태를 안 바꾸고 이벤트만 남긴다.
      // 별도 테이블·엔드포인트를 만들지 않은 이유: events가 이미 append-only + user_id +
      // created_at이고, 친구 규모라 Supabase 대시보드에서 `type='letter'`로 읽으면 충분하다.
      // ⚠️ events 보관주기 정책이 생기면 **`letter`는 제외**해야 한다 — 지워지면 안 되는 글이다.
      const text = typeof action.text === 'string' ? action.text.trim() : '';
      if (!text || text.length > LETTER_MAX) return { ok: false, error: 'bad-request' };
      return {
        ok: true, state, result: { type: 'none' },
        events: [{ type: 'letter', payload: { text } }],
      };
    }
    case 'setLocked': {
      if (!Array.isArray(action.uids) || action.uids.some(u => typeof u !== 'string')
          || typeof action.locked !== 'boolean') return { ok: false, error: 'bad-request' };
      // 잠금은 감사 가치가 없어 이벤트를 남기지 않는다
      return {
        ok: true, state: setLocked(state, action.uids, action.locked),
        result: { type: 'none' }, events: [],
      };
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
    case 'claimRelief': {
      // 지원 코드 — 검증·소비는 서버(reliefs 선차감)가 하고 여기엔 결과 자산만 주입된다.
      // 로컬 dev(LocalBackend)엔 deps.relief가 항상 없다 — 오프라인 발급 불가가 의도다.
      if (!deps.relief) return { ok: false, error: 'relief-invalid' };
      return {
        ok: true,
        state: applyRelief(state, deps.relief),
        result: { type: 'none' },
        events: [{ type: 'claimRelief', payload: {
          code: typeof action.code === 'string' ? action.code.trim() : '',
        } }],
      };
    }
    case 'buyBait': {
      // 소모품 구매 — 규칙은 골드 검증 하나다. count는 1회 요청의 폭주 상한(BAIT_BUY_MAX)으로
      // 클램프할 뿐, 스택 적립이라 여러 번 사면 충분하다. 가격은 data/baits.ts(단일 출처).
      const bait = baitById(action.bait);
      if (!bait) return { ok: false, error: 'bad-request' };
      const raw = action.count ?? 1;
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
        return { ok: false, error: 'bad-request' };
      }
      const n = Math.min(raw, BAIT_BUY_MAX);
      const cost = bait.price * n;
      if (!Number.isFinite(cost)) return { ok: false, error: 'bad-request' };
      if (state.gold < cost) return { ok: false, error: 'not-enough-gold' };
      return {
        ok: true,
        state: addItem({ ...state, gold: state.gold - cost }, bait.id, n),
        result: { type: 'none' },
        events: [{ type: 'buyBait', payload: { bait: bait.id, count: n, cost } }],
      };
    }
    case 'setActiveBait': {
      // 활성화는 **보유량이 있는 미끼만** 허용한다 — 없는 것을 골라도 효과가 무음인데
      // UI가 "활성 중"이라고 읽히면 거짓말이다. 비활성(null)은 언제나 허용.
      if (action.bait === null || action.bait === undefined) {
        return { ok: true, state: state.activeBait === null ? state
            : { ...state, activeBait: null }, result: { type: 'none' }, events: [] };
      }
      const bait = baitById(action.bait);
      if (!bait) return { ok: false, error: 'bad-request' };
      const owned = state.items[bait.id] ?? 0;
      if (owned <= 0) return { ok: false, error: 'bait-not-owned' };
      if (state.activeBait === bait.id) {
        return { ok: true, state, result: { type: 'none' }, events: [] }; // 멱등 재활성
      }
      return {
        ok: true,
        state: { ...state, activeBait: bait.id },
        result: { type: 'none' },
        events: [{ type: 'setActiveBait', payload: { bait: bait.id } }],
      };
    }
    case 'adminSet': {
      const g = action.gold, f = action.fame, r = action.rod, b = action.boat;
      const bad = (v: unknown) => v !== undefined && (!Number.isFinite(v as number) || (v as number) < 0);
      if (bad(g) || bad(f) || bad(r) || bad(b)) return { ok: false, error: 'bad-request' };
      if (r !== undefined && (!Number.isInteger(r) || r < 1)) return { ok: false, error: 'bad-request' };
      if (b !== undefined && (!Number.isInteger(b) || b < 0 || b > 4)) return { ok: false, error: 'bad-request' };
      return {
        ok: true,
        state: {
          ...state,
          gold: g ?? state.gold,
          fame: f ?? state.fame,
          rod: r ?? state.rod,
          boat: b ?? state.boat,
        },
        result: { type: 'none' },
        events: [{ type: 'adminSet', payload: { gold: g, fame: f, rod: r, boat: b } }],
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
