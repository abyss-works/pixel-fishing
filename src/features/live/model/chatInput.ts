import type { ChatRoom } from './live';

/**
 * 채팅 입력 상태머신. mode는 입력 줄이 열려 있는지(typing) 닫혀 있는지(closed)이고,
 * room은 플레이어가 고른 보낼 방이다. 실제로 보낼 방은 길드 소속 여부와 함께 chatRoomOf가 정한다.
 */
export interface ChatInputState {
  mode: 'closed' | 'typing';
  room: ChatRoom;
}

export type ChatInputEvent =
  | { type: 'open' }
  | { type: 'close' }
  /** 입력 중 Tab. 길드원일 때만 방을 바꾼다 */
  | { type: 'tab'; inGuild: boolean }
  /** 방 버튼. 입력 상태와 무관하게 길드원일 때만 방을 바꾼다 */
  | { type: 'toggleRoom'; inGuild: boolean };

export const CHAT_INPUT_INITIAL: ChatInputState = { mode: 'closed', room: 'world' };

const otherRoom = (room: ChatRoom): ChatRoom => (room === 'world' ? 'guild' : 'world');

/** 전이 함수. 바뀌지 않는 전이는 같은 상태 객체를 돌려준다 */
export function chatInputReducer(state: ChatInputState, event: ChatInputEvent): ChatInputState {
  switch (event.type) {
    case 'open':
      return state.mode === 'typing' ? state : { ...state, mode: 'typing' };
    case 'close':
      return state.mode === 'closed' ? state : { ...state, mode: 'closed' };
    case 'tab':
      if (state.mode !== 'typing' || !event.inGuild) return state;
      return { ...state, room: otherRoom(state.room) };
    case 'toggleRoom':
      if (!event.inGuild) return state;
      return { ...state, room: otherRoom(state.room) };
  }
}

/** 실제로 보낼 방. 길드에 들어가 있지 않으면 언제나 월드다 */
export function chatRoomOf(state: ChatInputState, inGuild: boolean): ChatRoom {
  return inGuild ? state.room : 'world';
}
