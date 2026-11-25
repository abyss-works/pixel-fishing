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
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Locked, { LockIcon } from '../../../ui/Locked';
import Modal from '../../../ui/Modal';
import Note from '../../../ui/Note';
import SectionTitle from '../../../ui/SectionTitle';
import TextInput from '../../../ui/TextInput';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';
import { maskUid } from './maskUid';

const NICKNAME_RULE = '한글은 8자, 영문과 숫자는 16자까지 쓸 수 있어요.';

// 내 정보 창 - 닉네임(현재, 변경)과 ID. 계정의 연결과 로그인 상태는 계정 관리 창이 맡는다.
export default function MyInfoModal({ setToast, onClose, account, accountChecked = true, accountFailed = false, uid, nickname, profileStatus, onRename }: {
  setToast: Notify; onClose: () => void;
  account: string | null; accountChecked?: boolean; accountFailed?: boolean; uid: string | null;
  nickname: string | null; profileStatus?: ProfileStatus; onRename: (name: string) => Promise<null | RejectReason>;
}) {
  const sharedProfileStatus = useProfileStatus();
  const resolvedProfileStatus: ProfileStatus = profileStatus ?? sharedProfileStatus ?? (nickname !== null ? 'loaded' : 'loading');
  const [draft, setDraft] = useState('');
  const [nickBusy, setNickBusy] = useState(false);
  const { notice, dialogs } = useDialogs();

  // 게스트나 확인 실패 상태에서는 닉네임을 바꿀 수 없다
  const nickLock = guestLock('nickname', accountLockState(account, accountFailed));
  const submitNick = async () => {
    if (nickLock) return;
    if (!checkNickname(draft).ok) { sendNotice(setToast, { kind: 'system.modalRejected', text: NICKNAME_RULE }); return; }
    setNickBusy(true);
    try {
      const err = await onRename(draft);
      if (err) sendNotice(setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[err] });
      else {
        sendNotice(setToast, {
          kind: 'social.modalAction',
          text: `닉네임을 “${draft}”로 바꿨어요.`,
          toastText: '닉네임을 바꿨어요.',
        });
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

  const nickRow = (
    <div className="flex items-center gap-2 px-2 py-1">
      <TextInput aria-label="새 닉네임" className="flex-1 min-w-0"
                 value={draft} maxLength={16} disabled={nickBusy || nickLock !== null}
                 onChange={e => setDraft(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') void submitNick(); }}
                 placeholder="새 닉네임" />
      <Button size="sm" className="shrink-0" disabled={nickBusy || nickLock !== null || draft.length === 0}
              onClick={() => void submitNick()}>변경</Button>
      {nickLock && <LockIcon className="shrink-0" />}
    </div>
  );

  return (
    <Modal layer="app" title="내 정보" narrow onClose={onClose}>
      <SectionTitle>닉네임</SectionTitle>
      <Inset divided className="mb-2">
        <KeyValueRow className="py-1 text-xs"
                     label="현재"
                     value={<span aria-label="현재 닉네임">{nicknameLabel(nickname, resolvedProfileStatus)}</span>} />
        {nickLock ? <Locked lines={nickLock} label="닉네임 변경" badge={false}>{nickRow}</Locked> : nickRow}
      </Inset>
      <Note>{NICKNAME_RULE}<br />나중에 랭킹에 표시될 이름이에요.</Note>

      {/* 문의 대응용이다. 게스트는 이메일조차 없어 uid 말고는 식별할 방법이 없다.
          화면은 가운데를 가리지만 복사는 전체 값이라, 버튼이 없으면 문의 대응이 불가능해진다. */}
      <SectionTitle>내 정보</SectionTitle>
      <Inset divided className="mb-2">
        <KeyValueRow className="py-1 text-xs"
                     label="ID"
                     value={<span className="pf-accent text-2xs select-text">{uid ? maskUid(uid) : uidPlaceholder({ account, accountChecked, accountFailed })}</span>}
                     action={<Button size="sm" className="shrink-0" disabled={!uid} onClick={() => copyId(uid)}>복사</Button>} />
      </Inset>
      <Note>문의하실 때 이 <b>ID</b>를 함께 알려 주시면 빠르게 해결할 수 있어요.<br />
        가운데는 가려 두었지만 <b>복사</b>를 누르면 전체가 복사돼요.</Note>
      {dialogs}
    </Modal>
  );
}
