// 메시지 창 접기 — 펼침과 접힘의 전이 규칙.
// 접힘은 채널 토글 줄과 기록을 숨기고 입력 줄만 남긴다. 거점에 들어가면 접히고, 바다로 나가면 바다에서 쓰던 상태로 돌아간다.
// 접힌 상태에서 입력을 시작하면 입력이 끝날 때까지만 펼쳐 보인다(바탕 상태는 그대로다).
import type { FilterChannel, MessageFilter } from './messageFilter';
import { isChannelShown } from './messageFilter';

export type FoldPlace = 'sea' | 'base';

export interface FoldState {
  place: FoldPlace;
  /** 바다에서 쓰는 접힘 — 기기에 남는다 */
  sea: boolean;
  /** 거점에서 쓰는 접힘 — 거점에 들어갈 때마다 접힘으로 시작한다 */
  base: boolean;
  /** 입력 줄에 포커스가 있다 */
  typing: boolean;
  /** 접힌 동안 켜 둔 채널에 새 글이 왔다 */
  unread: boolean;
}

export type FoldEvent =
  | { type: 'enter'; place: FoldPlace }
  /** 접기 또는 펼치기 버튼 */
  | { type: 'toggle' }
  | { type: 'typing'; on: boolean }
  | { type: 'post' };

export const foldInitial = (place: FoldPlace, seaFolded: boolean): FoldState =>
  ({ place, sea: seaFolded, base: true, typing: false, unread: false });

/** 지금 접혀 보이는가 */
export const isFolded = (s: FoldState): boolean => !s.typing && (s.place === 'base' ? s.base : s.sea);

/** 전이 함수. 바뀌지 않는 전이는 같은 상태 객체를 돌려준다 */
export function messageFoldReducer(s: FoldState, e: FoldEvent): FoldState {
  switch (e.type) {
    case 'enter':
      if (e.place === s.place) return s;
      return { ...s, place: e.place, base: true, unread: false };
    case 'toggle': {
      const folded = !isFolded(s);
      return { ...s, [s.place]: folded, typing: false, unread: folded ? s.unread : false };
    }
    case 'typing': {
      if (e.on === s.typing) return s;
      const next = { ...s, typing: e.on };
      return e.on ? { ...next, unread: false } : next;
    }
    case 'post':
      return isFolded(s) && !s.unread ? { ...s, unread: true } : s;
  }
}

export const serializeSeaFolded = (folded: boolean): string => (folded ? '1' : '0');

/** 저장값 해석 — 없거나 알 수 없으면 펼침이다 */
export const parseSeaFolded = (raw: string | null): boolean => raw === '1';

/**
 * 기준 시각 뒤에 켜 둔 채널에 온 글이 있는지 찾고, 다음 기준 시각(기록의 가장 늦은 글 시각)을 돌려준다.
 * 꺼 둔 채널의 글도 기준 시각은 넘어가므로 나중에 채널을 켜도 새 글로 치지 않는다.
 */
export function scanPosts(log: readonly { at: number; channel: FilterChannel }[], filter: MessageFilter, since: number): { fresh: boolean; since: number } {
  let next = since;
  let fresh = false;
  for (const m of log) {
    if (m.at <= since) continue;
    if (isChannelShown(filter, m.channel)) fresh = true;
    if (m.at > next) next = m.at;
  }
  return { fresh, since: next };
}
