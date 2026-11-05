import { useState } from 'react';
import { useChatModeration } from '../../../../features/live/service/useChatModeration';
import type { ChatActionError } from '../../../../features/live/service/useChatModeration';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';

// 소셜 창의 차단 탭 — 내가 차단한 사람과 해제. 차단은 플레이어 정보 창에서 한다.
const ERROR_TEXT: Record<ChatActionError, string> = {
  guest: '계정을 만든 뒤 쓸 수 있어요.',
  missing: '대상을 찾을 수 없어요.',
  failed: '요청을 처리하지 못했어요. 잠시 뒤에 다시 시도해 주세요.',
};

export default function BlockList({ setToast }: { setToast: Notify }) {
  const { blocks, unblock } = useChatModeration(true);
  const [busy, setBusy] = useState(false);
  const release = async (uid: string, name: string) => {
    setBusy(true);
    try {
      const error = await unblock(uid);
      setToast(error ? ERROR_TEXT[error] : `${name} 님의 차단을 풀었어요.`, error ? 'warn' : undefined);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title={Array.isArray(blocks) ? `차단 ${blocks.length}명` : '차단'} className="min-w-0">
      <div className="pf-scroll-panel h-80 overflow-y-auto pr-1 max-[640px]:h-56">
        {Array.isArray(blocks) && blocks.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {blocks.map(b => (
              <li key={b.uid} className="flex items-center gap-2 text-sm">
                <span className="flex-1 min-w-0 truncate">{b.nick ?? '이름 없음'}</span>
                <Button size="sm" disabled={busy} onClick={() => { void release(b.uid, b.nick ?? '이름 없음'); }}>해제</Button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex h-full items-center justify-center">
            {blocks === null ? <Note>차단 목록을 불러오는 중이에요.</Note>
              : typeof blocks === 'string' ? <Note tone="warn">{ERROR_TEXT[blocks]}</Note>
              : <Note>차단한 사람이 없어요. 채팅 이름을 눌러 연 플레이어 정보에서 차단할 수 있어요.</Note>}
          </div>
        )}
      </div>
    </Panel>
  );
}
