// 채팅 입력 줄 — HUD 메시지 창 아래에 놓인다. 게임 화면에서 Enter를 누르면 입력 줄로 들어간다.
// 입력 중 Enter는 보내고 입력 줄을 벗어난다(빈 입력은 벗어나기만 한다). Esc는 보내지 않고 벗어난다.
// 한글 조합 중의 Enter는 조합을 끝낼 뿐 보내지 않는다.
// 입력 중에는 전역 키 관문이 텍스트 포커스를 보고 이동·낚시 키를 넘기지 않는다. 창이 떠 있거나 다른 입력에
// 포커스가 있으면 같은 관문이 Enter를 이 줄에 넘기지 않는다.
// 메시지 창에서 고른 글줄의 보낸 사람에게 신고·차단을 걸고, 차단 목록을 펼쳐 풀 수 있다.
// 서버가 거부한 이유와 신고·차단 결과는 입력 줄 위에 짧게 보인다.
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { CHAT_MAX_LENGTH } from '../../../../game/rules/live';
import { clearChatError, sendChat, useChat } from '../../../../features/live/service/useLive';
import type { ChatError } from '../../../../features/live/model/live';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import { cx } from '../../../ui/cx';
import { hasModifier, useKeyScope } from '../../../ui/hotkeys';
import PillButton from '../../../ui/PillButton';
import TextInput from '../../../ui/TextInput';
import type { Msg } from '../../../ui/hud/messageFeed';

const GUEST_TEXT = '채팅은 계정을 만든 뒤 쓸 수 있어요. 계정 관리에서 계정을 만들어 주세요.';

const CHAT_ERROR_TEXT: Record<ChatError, string> = {
  'chat-guest': GUEST_TEXT,
  'chat-length': `메시지는 1자 이상 ${CHAT_MAX_LENGTH}자 이하로 보내 주세요.`,
  'chat-rate': '메시지를 너무 빨리 보내고 있어요. 잠시 뒤에 보내 주세요.',
  'chat-restricted': '이용이 제한된 계정이라 채팅을 쓸 수 없어요.',
};

const ACTION_ERROR_TEXT: Record<ChatActionError, string> = {
  guest: GUEST_TEXT,
  missing: '대상을 찾을 수 없어요. 오래된 메시지는 신고할 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};

export default function ChatBar({ picked, onDone }: {
  /** 메시지 창에서 고른 다른 사람의 채팅 글줄 */
  picked: Msg | null;
  onDone: () => void;
}) {
  const chat = useChat();
  const [text, setText] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);
  const moderation = useChatModeration(listOpen);

  const inputRef = useRef<HTMLInputElement>(null);

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
      if (text.trim() !== '') { sendChat(text); setText(''); }
      e.currentTarget.blur();
    }
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  const act = async (run: () => Promise<ChatActionError | null>, done: string) => {
    const error = await run();
    setNotice(error ? { text: ACTION_ERROR_TEXT[error], warn: true } : { text: done, warn: false });
    onDone();
  };

  const from = picked?.from;
  const status = chat.error ? { text: CHAT_ERROR_TEXT[chat.error], warn: true } : notice;

  return (
    <div className="flex flex-col gap-1 text-xs">
      {picked && from && (
        <div className="flex flex-wrap items-center gap-1 pf-glass border border-line rounded-sm px-2 py-1" role="group" aria-label="채팅 사용자">
          <span className="text-accent mr-1">{picked.author}</span>
          <PillButton onClick={() => void act(() => moderation.report(from.chatId), '신고했어요. 운영자가 확인할게요.')}>신고</PillButton>
          <PillButton onClick={() => void act(() => moderation.block(from.uid), '차단했어요. 이 사람의 채팅이 보이지 않아요.')}>차단</PillButton>
          <PillButton onClick={onDone}>닫기</PillButton>
        </div>
      )}
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
        <TextInput ref={inputRef} compact className="flex-1 min-w-0" aria-label="채팅 입력" placeholder="채팅 (Enter로 입력·보내기)"
                   maxLength={CHAT_MAX_LENGTH} value={text} onKeyDown={onKeyDown}
                   onChange={e => { setText(e.target.value); setNotice(null); clearChatError(); }} />
        <PillButton active={listOpen} aria-expanded={listOpen} onClick={() => setListOpen(open => !open)}>차단 목록</PillButton>
      </div>
    </div>
  );
}
