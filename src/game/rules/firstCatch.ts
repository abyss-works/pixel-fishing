// 새 계정 첫 경험 보장 — 계정의 5번째 캐치에서 영웅 한 마리, 서버가 계정마다 한 번 정한
// 10~20번째 캐치에서 전설 한 마리를 잡게 한다. 어종은 그 캐치가 일어난 수역의 해당 등급 어종이다.
// 계정당 한 번이며 진척은 화면에 보이지 않는다. 보장이 만든 캐치도 이후 흐름은 일반 캐치와 같다.
// 리듀서 catch와 서버 fast path가 drawCatch를 거쳐 같은 함수를 쓴다.
// 상대경로 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 이 체인을 직접 불러온다.

/** 영웅이 나오는 계정 캐치 번호 */
export const FIRST_CATCH_EPIC_AT = 5;
/** 전설이 나오는 캐치 번호의 범위(양끝 포함) */
export const FIRST_CATCH_LEGEND_MIN = 10;
export const FIRST_CATCH_LEGEND_MAX = 20;

export interface FirstCatch {
  /** 보장이 진행되는 동안 센 계정 캐치 수. 끝나면 더 세지 않는다 */
  n: number;
  /** 전설이 나올 캐치 번호. 0 = 아직 정하지 않음(첫 캐치에서 서버가 정한다) */
  legendAt: number;
  /** 영웅 보장이 남았는가 */
  epic: boolean;
  /** 전설 보장이 남았는가 */
  legend: boolean;
}

export const newFirstCatch = (): FirstCatch => ({ n: 0, legendAt: 0, epic: true, legend: true });
export const endedFirstCatch = (): FirstCatch => ({ n: 0, legendAt: 0, epic: false, legend: false });

/** 필드가 없는 이전 세이브의 판정 — 캐치가 하나도 없는 계정(도감이 비고 명성 0)만 보장 대상이다.
 *  명성은 줄지 않고 캐치로만 쌓이므로, 도감을 들고 있지 않은 서버 경로도 같은 판정을 한다 */
export const firstCatchOfLegacy = (dexCatches: number, fame: number): FirstCatch =>
  dexCatches === 0 && fame === 0 ? newFirstCatch() : endedFirstCatch();
