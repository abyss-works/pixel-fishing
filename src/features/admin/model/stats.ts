import { BOATS, boatNameOf } from '../../../game/content/boats';

export interface AdminStatsInput {
  gold: string;
  fame: string;
  rod: string;
  boat: string;
}

export type AdminStatsParse =
  | { ok: true; values: { gold: number; fame: number; rod: number; boat: number } }
  | { ok: false };

/** 관리자 스탯 입력을 액션 값으로 바꾸고 숫자가 아닌 입력을 거부한다. */
export function parseAdminStats(input: AdminStatsInput): AdminStatsParse {
  const values = {
    gold: Math.floor(Number(input.gold)),
    fame: Math.floor(Number(input.fame)),
    rod: Math.floor(Number(input.rod)),
    boat: Math.floor(Number(input.boat)),
  };
  return Object.values(values).every(Number.isFinite)
    ? { ok: true, values }
    : { ok: false };
}

/** 관리자 테스트 화면에서 선택할 수 있는 배 단계. */
export function selectAdminBoatOptions(): Array<{ tier: number; name: string }> {
  return BOATS.map(boat => ({ tier: boat.tier, name: boatNameOf(boat.tier) }));
}
