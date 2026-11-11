import { useState } from 'react';
import { GUILD_ERROR_TEXT, inviteDialogView } from '../../../../features/guild/model/guild';
import { useGuild } from '../../../../features/guild/service/useGuild';
import { useGuildInvite } from '../../../../features/guild/service/useGuildInvite';
import Button from '../../../ui/Button';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import GuildInviteSummary, { GuildInviteAction } from './GuildInviteSummary';

// 초대 링크 확인 창 — 초대 링크(/g/코드)로 열린 게임이 상태를 불러온 뒤 띄운다. 400 폭.
// 위는 길드 요약, 아래는 상태마다 다른 안내 한 줄과 버튼이다. 링크를 연 것만으로는 가입하지 않고, 버튼을 눌러야 들어가거나 신청한다.
// 게스트에게는 계정을 연결하거나 로그인하라고 알리고 계정 관리 창을 열 수 있게 한다. 초대는 계정이 연결될 때까지 남아 이 창이 다시 뜬다.
export default function GuildInviteDialog({ code, account, onAccount, onClose, setToast }: {
  code: string;
  /** 계정 유저의 이메일. 게스트면 null */
  account: string | null;
  /** 게스트가 계정 창을 연다(초대는 그대로 남는다) */
  onAccount: () => void;
  /** 초대를 마친다 */
  onClose: () => void;
  setToast: Notify;
}) {
  const invite = useGuildInvite(code);
  const { guild, loading, act } = useGuild(account !== null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = invite.settled && (account === null || !loading);
  const view = ready ? inviteDialogView(invite.preview, { account: account !== null, guild: guild?.name ?? null }, 'link') : null;

  const confirm = async () => {
    setBusy(true);
    try {
      const r = await act({ op: 'join', code, via: 'link' });
      if (!r.ok) { setError(GUILD_ERROR_TEXT[r.error] ?? '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.'); return; }
      setToast(`${invite.preview?.name ?? ''} 길드에 들어갔어요.`);
      onClose();
    } catch {
      setError('길드 요청을 보내지 못했어요. 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  // 주 버튼은 카드의 확정 자리(하단 고정)에 둔다
  const action = invite.failed || !view ? undefined
    : view.state === 'bad' ? <Button full onClick={onClose}>확인</Button>
    : view.state === 'guest' ? <Button full variant="primary" onClick={onAccount}>계정 관리</Button>
    : invite.preview ? <GuildInviteAction view={view} busy={busy} onConfirm={() => { void confirm(); }} /> : undefined;

  return (
    <Modal layer="stage" onClose={onClose}>
      <ModalCard title="길드 초대" onClose={onClose} confirm={action}>
        <div className="flex flex-col gap-3">
          {invite.failed ? <Note tone="warn">초대를 불러오지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note>
            : !view ? <Note>초대를 불러오는 중이에요.</Note>
            : view.state === 'bad' ? (
              <p className="m-0 text-sm text-text-dim whitespace-pre-line" role="status">{view.text}</p>
            ) : view.state === 'guest' ? (
              <>
                <GuildInviteSummary preview={invite.preview} view={null} busy={busy} onConfirm={() => {}} />
                <p className="m-0 text-sm text-text-dim whitespace-pre-line" role="status">{view.text}</p>
              </>
            ) : (
              <GuildInviteSummary preview={invite.preview} view={view} busy={busy} onConfirm={() => { void confirm(); }} actionSlot />
            )}
          {error && <Note tone="warn">{error}</Note>}
        </div>
      </ModalCard>
    </Modal>
  );
}
