// 채팅 입력 줄 — HUD 메시지 창 아래에 놓인다. 게임 화면에서 Enter를 누르면 입력 줄로 들어간다.
// 입력 중 Enter는 보내고 입력 줄에 머문다. 빈 입력의 Enter와 Esc만 입력 줄을 벗어난다.
// 한글 조합 중의 Enter는 조합을 끝낼 뿐 보내지 않는다.
// 입력 중에는 전역 키 관문이 텍스트 포커스를 보고 이동·낚시 키를 넘기지 않는다. 창이 떠 있거나 다른 입력에
// 포커스가 있으면 같은 관문이 Enter를 이 줄에 넘기지 않는다.
// 신고·차단은 채팅 이름을 눌러 여는 플레이어 정보 창이, 차단 해제는 소셜 창의 차단 탭이 맡는다.
// 서버가 거부한 이유는 입력 줄 바로 위의 한 줄에 보인다. 이 줄의 자리는 이유가 없을 때도 비워 둔다.
// 입력 줄 앞의 방 버튼이나 입력 중 Tab으로 보낼 곳(월드·길드)을 바꾼다. 길드 방이면 버튼 글자가 길드색이다.
// 길드가 없으면 버튼은 흐리게 꺼지고 언제나 월드로 보낸다. 버튼의 설명과 꺼진 이유는 게임 툴팁으로 보인다.
// 게스트는 채팅을 보낼 수 없어 입력 칸 대신 흐린 안내 칸을 두고, 계정을 만드는 곳을 툴팁으로 알린다.
// 입력 줄의 열림과 보낼 방은 채팅 입력 상태머신(chatInputReducer)이 정한다. 입력 중 Tab은 포커스를 옮기지 않는다.
import { useReducer, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CHAT_MAX_LENGTH } from '../../../../game/rules/live';
import { clearChatError, sendChat, useChat, useTypingSignal } from '../../../../features/live/service/useLive';
import type { ChatError, ChatRoom } from '../../../../features/live/model/live';
import { CHAT_INPUT_INITIAL, chatInputReducer, chatRoomOf } from '../../../../features/live/model/chatInput';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import { cx } from '../../../ui/cx';
import Tip from '../../../ui/Tip';
import HudButton from '../../../ui/hud/HudButton';
import HudInput from '../../../ui/hud/HudInput';

const GUEST_TEXT = '채팅은 계정을 만든 뒤 쓸 수 있어요. 계정 관리에서 계정을 만들어 주세요.';

const CHAT_ERROR_TEXT: Record<ChatError, string> = {
  'chat-guest': GUEST_TEXT,
  'chat-length': `메시지는 1자 이상 ${CHAT_MAX_LENGTH}자 이하로 보내 주세요.`,
  'chat-rate': '메시지를 너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.',
  'chat-restricted': '이용이 제한된 계정이라 채팅을 쓸 수 없어요.',
  'chat-no-guild': '길드에 들어가 있지 않아 길드 채팅을 보낼 수 없어요.',
};

const ROOM_LABEL: Record<ChatRoom, string> = { world: '월드', guild: '길드' };

const ROOM_TIP = 'Tab이나 이 버튼으로 보낼 곳을 월드와 길드 사이에서 바꿔요.';
const NO_GUILD_TIP = '길드에 들어가면 길드 채팅을 쓸 수 있어요.';
const GUEST_ROOM_TIP = '채팅은 계정을 만든 뒤 쓸 수 있어요.';
const GUEST_BLOCKED = { text: '채팅은 계정을 만든 뒤 쓸 수 있어요', reason: '설정 탭의 계정 관리에서 계정을 만들 수 있어요.' };

export default function ChatBar({ inGuild = false, guest = false }: { inGuild?: boolean; guest?: boolean }) {
  const chat = useChat();
  const [text, setText] = useState('');
  const [input, dispatch] = useReducer(chatInputReducer, CHAT_INPUT_INITIAL);
  const room = chatRoomOf(input, inGuild);

  const inputRef = useRef<HTMLInputElement>(null);
  // 입력 줄이 열려 있고 글이 있는 동안 다른 사람에게 입력 중 표시를 보인다
  useTypingSignal(input.mode === 'typing' && text.trim() !== '');

  useKeyScope(e => {
    if (guest || e.key !== 'Enter' || e.repeat || e.isComposing || hasModifier(e)) return;
    e.preventDefault();
    inputRef.current?.focus();
    return true;
  });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'tab', inGuild });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (text.trim() !== '') { sendChat(text, room); setText(''); return; }
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  const status = chat.error ? CHAT_ERROR_TEXT[chat.error] : null;
  const usable = inGuild && !guest;

  return (
    <div className="flex flex-col gap-1 text-xs">
      <p className="m-0 h-[18px] leading-[18px] px-0.5 truncate text-danger text-shadow-hud" role="status">{status}</p>
      <div className="flex items-center gap-1.5">
        <Tip wraps text={guest ? GUEST_ROOM_TIP : inGuild ? ROOM_TIP : NO_GUILD_TIP} className="flex">
          <HudButton active={room === 'guild'} disabled={!usable} aria-label={`보낼 곳: ${ROOM_LABEL[room]}`}
                     className={cx(room === 'guild' && 'text-guild', !usable && 'pointer-events-none')}
                     onClick={() => dispatch({ type: 'toggleRoom', inGuild })}>{ROOM_LABEL[room]}</HudButton>
        </Tip>
        {guest ? (
          <HudInput blocked={GUEST_BLOCKED} />
        ) : (
          <HudInput ref={inputRef} aria-label="채팅 입력"
                    placeholder={room === 'guild' ? 'Enter로 길드 채팅' : 'Enter로 채팅'}
                    maxLength={CHAT_MAX_LENGTH} value={text} onKeyDown={onKeyDown}
                    onFocus={() => dispatch({ type: 'open' })} onBlur={() => dispatch({ type: 'close' })}
                    onChange={e => { setText(e.target.value); clearChatError(); }} />
        )}
      </div>
    </div>
  );
}
