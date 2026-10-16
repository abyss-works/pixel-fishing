// 액션 스키마 — 서버 요청의 런타임 화이트리스트다.
// GameAction 유니온과 1:1로 대응한다. 새 액션에는 스키마도 추가한다.
// 키 집합 일치는 계약 테스트로 검증한다.
// 클라는 이 모듈을 import하지 않는다 (타입도 필요 없음) — zod 런타임이 클라 번들에
// 타면 안 된다. 서버·테스트 전용.
//
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.
import { z } from 'zod';
import type { GameAction } from './actions.js';
import { DEBUG_COMMAND_IDS } from './debug.js';
import type { DebugCommandId } from './debug.js';

// 판정 enum — 문자열 화이트리스트. 미지 값은 NaN 가중합 → 풀末尾 전설 확정으로
// 이어졌던 입력 경로이므로 여기서 null로 잘라 400 bad-action으로 돌린다.
const Judgment = z.enum(['perfect', 'good', 'normal', 'auto']);

const LocationRef = z.union([
  z.object({ kind: z.literal('region'), id: z.string() }),
  z.object({ kind: z.literal('base'), id: z.string() }),
]);

const schemas = {
  catch: z.object({
    type: z.literal('catch'), spot: z.string(), judgment: Judgment,
    forceEncounter: z.literal(true).optional(),
  }),
  sell: z.object({ type: z.literal('sell'), uids: z.array(z.unknown()) }),
  upgradeRod: z.object({ type: z.literal('upgradeRod') }),
  buyBoat: z.object({ type: z.literal('buyBoat') }),
  setLocked: z.object({ type: z.literal('setLocked'), uids: z.array(z.unknown()), locked: z.boolean() }),
  travel: z.object({ type: z.literal('travel'), to: LocationRef }),
  sendLetter: z.object({ type: z.literal('sendLetter'), text: z.string() }),
  redeemCoupon: z.object({ type: z.literal('redeemCoupon'), code: z.string() }),
  claimRelief: z.object({ type: z.literal('claimRelief'), code: z.string() }),
  // 개발 도구 명령 — 명령 id는 목록 화이트리스트, 인자 형태는 리듀서(reduceDebug)가 본다
  debug: z.object({
    type: z.literal('debug'),
    command: z.enum(DEBUG_COMMAND_IDS as [DebugCommandId, ...DebugCommandId[]]),
    args: z.record(z.string(), z.unknown()).optional(),
  }),
  buyBait: z.object({ type: z.literal('buyBait'), bait: z.unknown(), count: z.unknown().optional() }),
  setActiveBait: z.object({ type: z.literal('setActiveBait'), bait: z.unknown() }),
  boot: z.object({ type: z.literal('boot'), buildId: z.unknown().optional() }),
  setNickname: z.object({ type: z.literal('setNickname'), nickname: z.unknown() }),
  acceptQuest: z.object({ type: z.literal('acceptQuest'), questId: z.string(), port: z.string() }),
  deliverBounty: z.object({ type: z.literal('deliverBounty'), questId: z.string() }),
  exchangeArtifact: z.object({ type: z.literal('exchangeArtifact'), artifact: z.string() }),
  exhibit: z.object({ type: z.literal('exhibit'), uid: z.string(), slot: z.number().int().nullable() }),
  resolveChallenge: z.object({
    type: z.literal('resolveChallenge'),
    questId: z.string(), success: z.boolean(), hits: z.number(), misses: z.number(),
  }),
  import: z.object({ type: z.literal('import'), save: z.unknown() }),
};

// 리듀서 유니온과의 완전 일치 강제용 키 목록 — ACTION_TYPES와 대조한다.
export const ACTION_SCHEMA_TYPES = Object.keys(schemas) as (keyof typeof schemas)[];

const ActionSchema = z.discriminatedUnion('type', [
  schemas.catch, schemas.sell, schemas.upgradeRod, schemas.buyBoat,
  schemas.setLocked, schemas.travel, schemas.sendLetter, schemas.redeemCoupon,
  schemas.claimRelief, schemas.debug, schemas.buyBait, schemas.setActiveBait,
  schemas.boot, schemas.setNickname, schemas.acceptQuest,
  schemas.deliverBounty, schemas.exchangeArtifact, schemas.exhibit, schemas.resolveChallenge,
  schemas.import,
]);

/** 미검증 body → GameAction. 실패는 null (호출자가 400 bad-action으로). */
export function parseAction(body: unknown): GameAction | null {
  const r = ActionSchema.safeParse(body);
  // spot: string → SpotId 좁히기는 리듀서·게이트(canFish)가 맡는다. 여기서 캐스팅하는
  // 이유는 스키마가 데이터 행(FISH/SPOTS) 추가에 딸려 바뀌지 않게 하기 위해서다.
  return r.success ? (r.data as GameAction) : null;
}
