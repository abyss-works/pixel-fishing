import { useState } from 'react';
import { nicknameLabel, uidPlaceholder } from '../../../../features/account/model/accountRules';
import { accountLockState } from '../../../../features/account/service/accountActions';
import { useProfileStatus } from '../../../../features/gameplay/service/profileStatus';
import type { ProfileStatus } from '../../../../features/gameplay/service/types';
import { guestLock } from '../../../../features/display/model/menuLock';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { REJECT_TEXT } from '../../../../game/rules/logic';
import { checkNickname } from '../../../../game/rules/nickname';
import type { RejectReason } from '../../../../game/rules/rules';
import Button from '../../../ui/Button';
import { HOTKEY_TIER, useKeyScope } from '../../../ui/hotkeys';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Locked from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import SectionTitle from '../../../ui/SectionTitle';
import TextInput from '../../../ui/TextInput';
import Tip, { TipBullets } from '../../../ui/Tip';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';
import { maskUid } from './maskUid';

const NICKNAME_RULE = '한글은 8자, 영문과 숫자는 16자까지 쓸 수 있어요.';

// 내 정보 창 - 닉네임(1줄 인라인 편집)과 ID. 계정의 연결과 로그인 상태는 계정 관리 창이 맡는다.
export default function MyInfoModal({ setToast, onClose, account, accountChecked = true, accountFailed = false, uid, nickname, profileStatus, onRename }: {
  setToast: Notify; onClose: () => void;
  account: string | null; accountChecked?: boolean; accountFailed?: boolean; uid: string | null;
  nickname: string | null; profileStatus?: ProfileStatus; onRename: (name: string) => Promise<null | RejectReason>;
}) {
  const sharedProfileStatus = useProfileStatus();
  const resolvedProfileStatus: ProfileStatus = profileStatus ?? sharedProfileStatus ?? (nickname !== null ? 'loaded' : 'loading');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [nickBusy, setNickBusy] = useState(false);
  const { notice, dialogs } = useDialogs();

  // 게스트나 확인 실패 상태에서는 닉네임을 바꿀 수 없다
  const nickLock = guestLock('nickname', accountLockState(account, accountFailed));
  const startEdit = () => {
    if (nickLock) return;
    setDraft(nickname ?? '');
    setEditing(true);
  };
  const cancelEdit = () => {
    if (nickBusy) return;
    setEditing(false);
    setDraft('');
  };
  useKeyScope(e => {
    if (editing && e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
      return true;
    }
  }, { tier: HOTKEY_TIER.APP_CONFIRM });

  const submitNick = async () => {
    if (nickLock || !editing) return;
    if (!checkNickname(draft).ok) { sendNotice(setToast, { kind: 'system.modalRejected', text: NICKNAME_RULE }); return; }
    setNickBusy(true);
    try {
      const err = await onRename(draft);
      if (err) sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[err] });
      else {
        sendNotice(setToast, {
          kind: 'social.modalAction',
          text: `닉네임을 “${draft}” 이름으로 바꿨어요.`,
          toastText: '닉네임을 바꿨어요.',
        });
        setEditing(false);
        setDraft('');
      }
    } finally {
      setNickBusy(false);
    }
  };

  // body에 user-select:none이 걸려 있어 드래그 복사가 안 된다 - 버튼이 유일한 경로다.
  const copyId = async (value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      sendNotice(setToast, {
        kind: 'system.modalConfirmUtility',
        text: '내 ID를 복사했어요. 문의하실 때 함께 보내 주세요.',
        toastText: '내 ID를 복사했어요.',
      });
    } catch {
      void notice({ layer: 'app', title: '직접 복사', body: '복사가 막혀 있어요.\n아래 값을 직접 복사해 주세요.', value });
    }
  };

  const changeButton = (
    <Button size="sm" className="shrink-0" disabled={nickLock !== null} onClick={startEdit}>
      변경
    </Button>
  );

  const nickRow = editing ? (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <TextInput key="edit" aria-label="새 닉네임" className="flex-1 min-w-0"
                 value={draft} maxLength={16} disabled={nickBusy} autoFocus
                 onChange={e => setDraft(e.target.value)}
                 onKeyDown={e => {
                   if (e.key === 'Enter') void submitNick();
                   else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelEdit(); }
                 }}
                 placeholder="새 닉네임" />
      <Button variant="primary" size="sm" className="shrink-0" disabled={nickBusy || draft.length === 0}
              onClick={() => void submitNick()}>확인</Button>
      <Button size="sm" className="shrink-0" disabled={nickBusy} onClick={cancelEdit}>취소</Button>
    </div>
  ) : (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <TextInput key="view" aria-label="현재 닉네임" className="flex-1 min-w-0"
                 value={nicknameLabel(nickname, resolvedProfileStatus)} disabled readOnly />
      {nickLock ? <Locked lines={nickLock} label="닉네임 변경" badge={false} className="shrink-0">{changeButton}</Locked> : changeButton}
    </div>
  );

  return (
    <Modal layer="app" title="내 정보" narrow onClose={onClose}>
      <SectionTitle>
        <Tip text={<TipBullets items={[NICKNAME_RULE, '나중에 랭킹에 표시될 이름이에요.']} />}>닉네임</Tip>
      </SectionTitle>
      <Inset className="mb-2">
        {nickRow}
      </Inset>

      {/* 문의 대응용이다. 게스트는 이메일조차 없어 uid 말고는 식별할 방법이 없다.
          화면은 가운데를 가리지만 복사는 전체 값이라, 버튼이 없으면 문의 대응이 불가능해진다. */}
      <SectionTitle>
        <Tip text={<TipBullets items={['문의하실 때 이 ID를 함께 알려 주시면 빠르게 해결할 수 있어요.', '가운데는 가려 두었지만 복사를 누르면 전체가 복사돼요.']} />}>내 정보</Tip>
      </SectionTitle>
      <Inset divided className="mb-2">
        <KeyValueRow className="py-1 text-xs"
                     label="ID"
                     value={<span className="pf-accent text-2xs select-text">{uid ? maskUid(uid) : uidPlaceholder({ account, accountChecked, accountFailed })}</span>}
                     action={<Button size="sm" className="shrink-0" disabled={!uid} onClick={() => copyId(uid)}>복사</Button>} />
      </Inset>
      {dialogs}
    </Modal>
  );
}
