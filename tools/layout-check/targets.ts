// 레이아웃 폭 검사의 대상 - 뷰포트 폭 목록과 두 가지 상태의 세이브.
import { reduceDebug } from '../../src/game/rules/debug';
import { FISH } from '../../src/game/content/fish';
import { MAX_BOAT, capOfBoat, migrate, newState } from '../../src/game/rules/logic';
import type { GameState } from '../../src/game/rules/logic';

/** 뷰포트 높이 */
export const VIEWPORT_HEIGHT = 800;

/** 뷰포트 폭 목록 - 지원 크기, 레이아웃 판정 경계, 헤더 단계 경계(스테이지 폭 = 뷰포트 폭 - 사이드바)의 바로 아래와 위 */
export const VIEWPORT_WIDTHS: readonly number[] = [768, 812, 900, 1023, 1024, 1155, 1156, 1198, 1280, 1920];

/** 게스트 세이브의 저장소 키. 게스트 게이트웨이와 레거시 이관 두 곳이 각자 비공개 상수로 갖고 있어 가져올 수 없다 */
export const SAVE_KEY = 'pixel-fishing-save';

/** 자원 바 칸의 가장 긴 값. 줄임 표기가 가장 길어지는 999,900 */
const LONGEST_RESOURCE = 999_900;
const MAX_ROD = 99;

/** 자원 바가 가장 길게 나오는 상태 - 골드와 명성, 최상위 배, 낚싯대 레벨 99, 가방 가득.
 *  개발 도구 명령(stats.set)의 리듀서로 스탯을 정하고, 가방은 배의 칸 수만큼 채운다 */
export function longestState(): GameState {
  const stats = reduceDebug(newState(), 'stats.set', { gold: LONGEST_RESOURCE, fame: LONGEST_RESOURCE, rod: MAX_ROD, boat: MAX_BOAT }, '2026-01-01');
  if (!stats) throw new Error('개발 도구 명령 stats.set이 최장 값 상태를 거부했습니다.');
  const bag = Array.from({ length: capOfBoat(MAX_BOAT) }, (_, i) => ({
    uid: `layout-check-${i}`, fishId: FISH[0].id, form: 'normal' as const, size: null, caughtAt: null, spot: null, judgment: null, locked: false,
  }));
  // 저장된 세이브를 읽는 경로(migrate)를 한 번 거쳐 제품이 읽을 수 있는 형식임을 보장한다
  return migrate({ ...stats, bag });
}
