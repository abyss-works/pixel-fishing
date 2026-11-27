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
  /** 입력 중 Tab. 전체 -> 지역 -> 길드(길드 미가입 시 전체 <-> 지역) 순으로 순환한다 */
  | { type: 'tab'; inGuild: boolean }
  /** 방 버튼. 입력 상태와 무관하게 길드 소속에 맞춰 방을 순환한다 */
  | { type: 'toggleRoom'; inGuild: boolean };

export const CHAT_INPUT_INITIAL: ChatInputState = { mode: 'closed', room: 'local' };

const ROOM_ORDER_GUILD: readonly ChatRoom[] = ['global', 'local', 'guild'];
const ROOM_ORDER_NO_GUILD: readonly ChatRoom[] = ['global', 'local'];

const nextRoom = (room: ChatRoom, inGuild: boolean): ChatRoom => {
  const order = inGuild ? ROOM_ORDER_GUILD : ROOM_ORDER_NO_GUILD;
  const idx = order.indexOf(room);
  return order[(idx + 1) % order.length];
};

/** 전이 함수. 바뀌지 않는 전이는 같은 상태 객체를 돌려준다 */
export function chatInputReducer(state: ChatInputState, event: ChatInputEvent): ChatInputState {
  switch (event.type) {
    case 'open':
      return state.mode === 'typing' ? state : { ...state, mode: 'typing' };
    case 'close':
      return state.mode === 'closed' ? state : { ...state, mode: 'closed' };
    case 'tab':
      if (state.mode !== 'typing') return state;
      return { ...state, room: nextRoom(state.room, event.inGuild) };
    case 'toggleRoom':
      return { ...state, room: nextRoom(state.room, event.inGuild) };
  }
}

/** 실제로 보낼 방. 길드에 들어가 있지 않고 길드 방을 고른 상태라면 지역 방으로 돌린다 */
export function chatRoomOf(state: ChatInputState, inGuild: boolean): ChatRoom {
  if (!inGuild && state.room === 'guild') return 'local';
  return state.room;
}

/** 채팅 입력 줄 위 오류·실패 안내 문구. 두 문장 이상이면 문장 끝마다 줄을 바꾼다 */
export function formatStatusNotice(text: string): string {
  return text.trim().replace(/([.!?])[^\S\n]+/g, '$1\n');
}
