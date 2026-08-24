import { useState } from 'react';
import { LETTER_MAX } from '../game/actions';
import type { GameAction } from '../game/actions';
import { when } from '../backend/types';
import type { DispatchResult, MaybePromise } from '../backend/types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Note from '../ui/Note';

// 개발자에게 보내는 편지 — 건의·신고·잡담을 **하나로 뭉뚱그린** 창구.
// 종류를 나누지 않은 이유: 친구 규모에서 분류는 보내는 쪽에 부담만 주고, 읽는 쪽은 어차피
// 한 사람이라 다 읽는다. 필요해지면 그때 나눈다.
//
// 로그인한 계정만 보낼 수 있다(호출부에서 게이트). 게스트에게는 **답장할 방법이 없어서**다 —
// 보안 제한이 아니라 소통이 성립하는 조건이다.
export default function LetterModal({ dispatch, setToast, onClose }: {
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const body = text.trim();
  const over = body.length > LETTER_MAX;

  const send = () => {
    if (!body || over || busy) return;
    setBusy(true);
    when(dispatch({ type: 'sendLetter', text: body }), r => {
      setBusy(false);
      if (r.status !== 'ok') return; // 실패는 정책(errors.ts)이 안내한다
      setToast('편지를 보냈어요. 읽고 반영할게요 — 고마워요!');
      onClose();
    });
  };

  return (
    <Modal title="개발자에게 편지" onClose={onClose}>
      <Note>건의·버그 제보·하고 싶은 말 아무거나 좋아요. 답장은 계정 이메일로 드려요.</Note>
      <textarea
        className="w-full h-40 resize-none my-2 bg-bg border border-line rounded-sm
                   text-text text-sm px-3 py-2 outline-none focus:border-accent"
        placeholder="예) 가방이 금방 차요. 조금만 늘려주세요!"
        value={text}
        maxLength={LETTER_MAX + 1} // +1이라 상한을 넘겨 봐야 경고를 볼 수 있다
        onChange={e => setText(e.target.value)}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <span className={over ? 'text-danger text-2xs' : 'text-text-dim text-2xs'}>
          {body.length} / {LETTER_MAX}
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" onClick={onClose}>닫기</Button>
          <Button size="sm" variant="primary" disabled={!body || over || busy} onClick={send}>
            보내기
          </Button>
        </span>
      </div>
    </Modal>
  );
}
