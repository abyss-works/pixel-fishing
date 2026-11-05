// 채팅 입력 줄 — HUD 메시지 창 아래에 놓인다. 게임 화면에서 Enter를 누르면 입력 줄로 들어간다.
// 입력 중 Enter는 보내고 입력 줄에 머문다. 빈 입력의 Enter와 Esc만 입력 줄을 벗어난다.
// 한글 조합 중의 Enter는 조합을 끝낼 뿐 보내지 않는다.
// 입력 중에는 전역 키 관문이 텍스트 포커스를 보고 이동·낚시 키를 넘기지 않는다. 창이 떠 있거나 다른 입력에
// 포커스가 있으면 같은 관문이 Enter를 이 줄에 넘기지 않는다.
// 차단 목록을 펼쳐 풀 수 있다. 신고·차단은 채팅 이름을 눌러 여는 플레이어 정보 창이 맡는다.
// 서버가 거부한 이유와 차단 해제 결과는 입력 줄 위에 짧게 보인다.
// 입력 줄 앞의 방 버튼으로 보낼 곳(월드·길드)을 바꾼다. 길드가 없으면 버튼은 회색으로 보이고 언제나 월드로 보낸다.
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CHAT_MAX_LENGTH } from '../../../../game/rules/live';
import { clearChatError, sendChat, useChat, useTypingSignal } from '../../../../features/live/service/useLive';
import type { ChatError, ChatRoom } from '../../../../features/live/model/live';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { cx } from '../../../ui/cx';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import PillButton from '../../../ui/PillButton';
import TextInput from '../../../ui/TextInput';

const GUEST_TEXT = '채팅은 계정을 만든 뒤 쓸 수 있어요. 계정 관리에서 계정을 만들어 주세요.';

const CHAT_ERROR_TEXT: Record<ChatError, string> = {
  'chat-guest': GUEST_TEXT,
  'chat-length': `메시지는 1자 이상 ${CHAT_MAX_LENGTH}자 이하로 보내 주세요.`,
  'chat-rate': '메시지를 너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.',
  'chat-restricted': '이용이 제한된 계정이라 채팅을 쓸 수 없어요.',
  'chat-no-guild': '길드에 들어가 있지 않아 길드 채팅을 보낼 수 없어요.',
};

const ROOM_LABEL: Record<ChatRoom, string> = { world: '월드', guild: '길드' };

const ACTION_ERROR_TEXT: Record<ChatActionError, string> = {
  guest: GUEST_TEXT,
  missing: '대상을 찾을 수 없어요. 오래된 메시지는 신고할 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};

export default function ChatBar({ inGuild = false }: { inGuild?: boolean }) {
  const chat = useChat();
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<ChatRoom>('world');
  const room: ChatRoom = inGuild ? picked : 'world';
  const [listOpen, setListOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);
  const moderation = useChatModeration(listOpen);

  const inputRef = useRef<HTMLInputElement>(null);
  // 입력 줄에 포커스가 있고 글이 있는 동안 다른 사람에게 입력 중 표시를 보인다
  const [focused, setFocused] = useState(false);
  useTypingSignal(focused && text.trim() !== '');

  useKeyScope(e => {
    if (e.key !== 'Enter' || e.repeat || e.isComposing || hasModifier(e)) return;
    e.preventDefault();
    inputRef.current?.focus();
    return true;
  });

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.repeat) return;
      if (text.trim() !== '') { sendChat(text, room); setText(''); return; }
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  const act = async (run: () => Promise<ChatActionError | null>, done: string) => {
    const error = await run();
    setNotice(error ? { text: ACTION_ERROR_TEXT[error], warn: true } : { text: done, warn: false });
  };

  const status = chat.error ? { text: CHAT_ERROR_TEXT[chat.error], warn: true } : notice;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {listOpen && (
        <div className="pf-glass border border-line rounded-sm px-2 py-1 flex flex-col gap-1" role="group" aria-label="차단 목록">
          {moderation.blocks === null && <span className="text-text-dim">불러오는 중이에요.</span>}
          {typeof moderation.blocks === 'string' && <span className="text-text-dim">{ACTION_ERROR_TEXT[moderation.blocks]}</span>}
          {Array.isArray(moderation.blocks) && moderation.blocks.length === 0 && <span className="text-text-dim">차단한 사람이 없어요.</span>}
          {Array.isArray(moderation.blocks) && moderation.blocks.map(b => (
            <div key={b.uid} className="flex items-center justify-between gap-2">
              <span>{b.nick ?? '이름 없음'}</span>
              <PillButton onClick={() => void act(() => moderation.unblock(b.uid), '차단을 풀었어요.')}>해제</PillButton>
            </div>
          ))}
        </div>
      )}
      {status && <p className={cx('text-shadow-hud m-0', status.warn ? 'text-danger' : 'text-text')} role="status">{status.text}</p>}
      <div className="flex items-center gap-1">
        <PillButton active={room === 'guild'} disabled={!inGuild} aria-label={`보낼 곳: ${ROOM_LABEL[room]}`}
                    title={inGuild ? '보낼 곳 바꾸기' : '길드에 들어가면 길드 채팅을 쓸 수 있어요'}
                    onClick={() => setPicked(room === 'guild' ? 'world' : 'guild')}>{ROOM_LABEL[room]}</PillButton>
        <TextInput ref={inputRef} compact className="flex-1 min-w-0" aria-label="채팅 입력"
                   placeholder={`${room === 'guild' ? '길드 채팅' : '채팅'} (Enter로 입력·보내기)`}
                   maxLength={CHAT_MAX_LENGTH} value={text} onKeyDown={onKeyDown}
                   onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
                   onChange={e => { setText(e.target.value); setNotice(null); clearChatError(); }} />
        <PillButton active={listOpen} aria-expanded={listOpen} onClick={() => setListOpen(open => !open)}>차단 목록</PillButton>
      </div>
    </div>
  );
}
