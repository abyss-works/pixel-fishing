import { migrate, newState } from '../../game/rules/logic';
import type { GameState } from '../../game/rules/logic';

const LEGACY_KEY = 'pixel-fishing-save';

/** 레거시 localStorage 세이브를 메모리로 1회 이관 (쓰기는 하지 않음). */
export function loadLegacy(): { game: GameState; notice: string | null; legacy: boolean } {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const game = migrate(parsed);
      const notice = parsed?.v !== 4 && game.fame > 0
        ? `업데이트! 그동안 잡은 물고기가 명성으로 소급 인정되었다. 명성 ${game.fame}`
        : null;
      return { game, notice, legacy: true };
    }
  } catch { /* 손상된 저장 데이터는 무시하고 새로 시작 */ }
  return { game: newState(), notice: null, legacy: false };
}

export function clearLegacySave(): void {
  localStorage.removeItem(LEGACY_KEY);
}

/** 이사 코드는 JSON 세이브를 사람이 옮길 수 있는 문자열로 인코딩한다. */
export const saveCode = (state: GameState): string =>
  btoa(encodeURIComponent(JSON.stringify(state)));
