// 채팅 입력 줄 — HUD 메시지 창 아래에 놓인다. 게임 화면에서 Enter를 누르면 입력 줄로 들어간다.
// 입력 중 Enter는 보내고 입력 줄에 머문다. 빈 입력의 Enter와 Esc만 입력 줄을 벗어난다.
// 한글 조합 중의 Enter는 조합을 끝낼 뿐 보내지 않는다.
// 입력 중에는 전역 키 관문이 텍스트 포커스를 보고 이동·낚시 키를 넘기지 않는다. 창이 떠 있거나 다른 입력에
// 포커스가 있으면 같은 관문이 Enter를 이 줄에 넘기지 않는다.
// 신고·차단은 채팅 이름을 눌러 여는 플레이어 정보 창이, 차단 해제는 소셜 창의 차단 탭이 맡는다.
// 서버가 거부한 이유는 입력 줄 바로 위에 떠 있는 작은 노치 말풍선으로 보인다. 자리를 차지하지 않고, 다시 입력하면 사라진다.
// 입력 줄 앞의 방 버튼이나 입력 중 Tab으로 보낼 곳(월드·길드)을 바꾼다. 길드 방이면 버튼 글자가 길드색이다.
// 길드가 없으면 버튼은 흐리게 꺼지고 언제나 월드로 보낸다. 버튼의 설명과 꺼진 이유는 게임 툴팁으로 보인다.
// 게스트는 채팅을 보낼 수 없어 입력 칸 대신 흐린 안내 칸을 두고, 계정을 만드는 곳을 툴팁으로 알린다.
// 모바일에서는 메시지 창 기록 칸을 눌러야 입력 줄이 열린다(open). 열리면 입력 칸에 포커스를 주어 키보드가 뜨고,
// 입력 칸을 벗어나면(키보드를 닫거나 바깥을 누르면) onLeave로 닫는다. 보내도 입력 줄에 머문다.
// 메시지 창이 접히면(folded) 입력 줄 왼쪽 끝에 펼치기 버튼을 둔다. 새 글이 있으면(unread) 버튼에 골드 네모 점을 찍는다.
// 접힌 모바일에서 입력 줄이 닫혀 있으면 입력 줄 자리에 한 줄 칸을 두고, 누르면 입력 줄을 연다(onOpen). 게스트는 펼치기 버튼만 남는다.
// 입력 칸에 포커스가 들어오고 빠지는 것은 onTyping으로 알린다.
// 입력 줄의 열림과 보낼 방은 채팅 입력 상태머신(chatInputReducer)이 정한다. 입력 중 Tab은 포커스를 옮기지 않는다.
import { useEffect, useReducer, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CHAT_MAX_LENGTH } from '../../../../game/rules/live';
import { clearChatError, sendChat, useChat, useTypingSignal } from '../../../../features/live/service/useLive';
import type { ChatError, ChatRoom } from '../../../../features/live/model/live';
import { CHAT_INPUT_INITIAL, chatInputReducer, chatRoomOf } from '../../../../features/live/model/chatInput';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import { cx } from '../../../ui/cx';
import { NOTCH_SM } from '../../../ui/notch';
import Tip from '../../../ui/Tip';
import HudButton from '../../../ui/hud/HudButton';
import HudInput, { HUD_INPUT_BOX } from '../../../ui/hud/HudInput';
import PixelIcon from '../../../ui/PixelIcon';

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

export default function ChatBar({ inGuild = false, guest = false, open = true, onLeave, folded = false, unread = false, onUnfold, onOpen, onTyping }: {
  inGuild?: boolean; guest?: boolean;
  /** 입력 줄을 보이는가. PC는 늘 보인다 */
  open?: boolean;
  /** 입력 칸을 벗어났다(모바일에서 입력 줄을 닫는다) */
  onLeave?: () => void;
  /** 메시지 창이 접혀 있는가 */
  folded?: boolean;
  /** 접힌 동안 새 글이 왔다 */
  unread?: boolean;
  /** 펼치기 버튼을 눌렀다 */
  onUnfold?: () => void;
  /** 접힌 모바일의 한 줄 칸을 눌렀다(입력 줄을 연다) */
  onOpen?: () => void;
  /** 입력 칸에 포커스가 들어오거나 빠졌다 */
  onTyping?: (on: boolean) => void;
}) {
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
  useEffect(() => { if (open && onLeave) inputRef.current?.focus(); }, [open, onLeave]);
  const status = chat.error ? CHAT_ERROR_TEXT[chat.error] : null;
  const usable = inGuild && !guest;

  const unfold = folded && onUnfold && (
    <Tip wraps text="펼치기" className="flex">
      <HudButton aria-label="메시지 창 펼치기" className="relative"
                 onPointerDown={e => { if (onLeave) e.preventDefault(); }} onClick={onUnfold}>
        <PixelIcon glyph="plus" size={12} />
        {unread && <span className="absolute top-0.5 right-0.5 size-1.5 bg-gold" aria-hidden="true" />}
      </HudButton>
    </Tip>
  );
  if (!open) {
    if (!folded) return null;
    return (
      <div className="flex items-center gap-1.5 text-xs">
        {unfold}
        {!guest && onOpen && (
          <button type="button" onClick={onOpen}
                  className={cx(HUD_INPUT_BOX, 'cursor-pointer text-left text-text-dim',
                    'border-line bg-[color-mix(in_oklab,var(--c-bg)_72%,transparent)] backdrop-blur-[4px]')}>
            {room === 'guild' ? 'Enter로 길드 채팅' : 'Enter로 채팅'}
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="relative text-xs"
         onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onLeave?.(); }}>
      {status && (
        <p role="status"
           className={cx('absolute left-0 bottom-full mb-1 m-0 max-w-full px-2 py-0.5 truncate text-danger',
             'bg-[color-mix(in_oklab,var(--c-bg)_88%,transparent)] border border-[color-mix(in_srgb,var(--c-danger)_60%,transparent)]', NOTCH_SM)}>
          {status}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        {unfold}
        {!(folded && guest) && <Tip wraps text={guest ? GUEST_ROOM_TIP : inGuild ? ROOM_TIP : NO_GUILD_TIP} className="flex">
          <HudButton active={room === 'guild'} disabled={!usable} aria-label={`보낼 곳: ${ROOM_LABEL[room]}`}
                     className={cx(room === 'guild' && 'text-guild', !usable && 'pointer-events-none')}
                     onPointerDown={e => { if (onLeave) e.preventDefault(); }}
                     onClick={() => dispatch({ type: 'toggleRoom', inGuild })}>{ROOM_LABEL[room]}</HudButton>
        </Tip>}
        {folded && guest ? null : guest ? (
          <HudInput blocked={GUEST_BLOCKED} />
        ) : (
          <HudInput ref={inputRef} aria-label="채팅 입력"
                    placeholder={room === 'guild' ? 'Enter로 길드 채팅' : 'Enter로 채팅'}
                    maxLength={CHAT_MAX_LENGTH} value={text} onKeyDown={onKeyDown}
                    onFocus={() => { dispatch({ type: 'open' }); onTyping?.(true); }}
                    onBlur={() => { dispatch({ type: 'close' }); onTyping?.(false); }}
                    onChange={e => { setText(e.target.value); clearChatError(); }} />
        )}
      </div>
    </div>
  );
}
