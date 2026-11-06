import { useState } from 'react';
import { LETTER_MAX } from '../../../../game/rules/actions';
import type { GameAction } from '../../../../game/rules/actions';
import { when } from '../../../../shared/lib/when';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import Tip from '../../../ui/Tip';
import TextArea from '../../../ui/TextArea';

// 개발자에게 보내는 편지 — 건의·신고·잡담을 **하나로 뭉뚱그린** 창구.
// 종류를 나누지 않은 이유: 친구 규모에서 분류는 보내는 쪽에 부담만 주고, 읽는 쪽은 어차피
// 한 사람이라 다 읽는다. 필요해지면 그때 나눈다.
//
// 로그인한 계정만 보낼 수 있다. 게스트에게는 **답장할 방법이 없어서**다 —
// 보안 제한이 아니라 소통이 성립하는 조건이다. 게스트에게도 창은 열리고, 입력을 막고 이유를 툴팁으로 보인다.
const GUEST_REASON = '편지는 계정을 만든 뒤 쓸 수 있어요.\n답장을 계정 이메일로 드리기 때문이에요.';
const LETTER_HINT = '건의, 버그 제보, 하고 싶은 말 아무거나 좋아요.\n답장은 계정 이메일로 드려요.';

export default function LetterModal({ dispatch, setToast, guest, onClose }: {
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
  /** 게스트는 답장 받을 방법이 없어 쓸 수 없다. 창은 열리고 입력만 막는다 */
  guest: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const body = text.trim();
  const over = body.length > LETTER_MAX;

  const send = () => {
    if (guest || !body || over || busy) return;
    setBusy(true);
    when(dispatch({ type: 'sendLetter', text: body }), r => {
      setBusy(false);
      if (r.status !== 'ok') return; // 실패는 정책(에러 처리)이 안내한다
      setToast('편지를 보냈어요. 꼼꼼히 읽고 반영할게요. 고마워요.');
      onClose();
    });
  };

  return (
    <Modal title="개발자에게" narrow onClose={onClose}>
      <Tip plain className="block" text={guest ? GUEST_REASON : LETTER_HINT}>
        <TextArea
          className="h-40 my-2"
          placeholder="예) 가방 칸을 조금 늘려 주세요"
          value={text}
          maxLength={LETTER_MAX + 1} // +1이라 상한을 넘겨 봐야 경고를 볼 수 있다
          disabled={guest}
          onChange={e => setText(e.target.value)}
          autoFocus={!guest}
        />
      </Tip>
      <div className="flex items-center gap-2">
        <span className={over ? 'text-danger text-2xs' : 'text-text-dim text-2xs'}>
          {body.length} / {LETTER_MAX}
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" disabled={guest || !body || over || busy} onClick={send}>
            보내기
          </Button>
        </span>
      </div>
    </Modal>
  );
}
