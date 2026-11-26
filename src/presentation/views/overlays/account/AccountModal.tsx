import { Fragment, useState } from 'react';
import {
  connectGoogle,
  deleteAccount,
  isAccountConfigured,
  signOutAccount,
} from '../../../../features/account/service/accountActions';
import {
  clearPendingGoogleOrigin,
  clearPendingSailReturn,
  setPendingGoogleOrigin,
  setPendingSailReturn,
} from '../../../../features/account/service/sailReturn';
import { GOOGLE_BUTTON_LABEL, googleStartFailedText, LEGAL_PATHS } from '../../../../features/account/model/googleFlow';
import { ACCOUNT_CHECK_FAILED_COPY, accountLabel } from '../../../../features/account/model/accountRules';
import { selectFirstLinkRewardItems } from '../../../../features/account/model/firstLinkReward';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import Badge from '../../../ui/Badge';
import BoatSprite from '../../../ui/BoatSprite';
import Button from '../../../ui/Button';
import Divider from '../../../ui/Divider';
import ExternalLink from '../../../ui/ExternalLink';
import Frame from '../../../ui/Frame';
import GoogleButton from '../../../ui/GoogleButton';
import GoogleLogo from '../../../ui/GoogleLogo';
import IconButton from '../../../ui/IconButton';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Tip, { TipCard } from '../../../ui/Tip';
import { cx } from '../../../ui/cx';
import { useDialogs } from '../../../ui/useDialogs';
import type { Notify } from '../../../ui/hud/messageFeed';
import FirstLinkRewardSection from './FirstLinkRewardSection';

const CONNECT_PERKS = [
  {
    badge: '항로',
    title: '태평양과 세계 해역 개방',
    desc: '여섯 대양과 네임드 수배에 도전할 수 있어요.',
  },
  {
    badge: '교류',
    title: '업적 보상과 소셜 기능 해금',
    desc: '업적 수령, 의뢰, 우편, 채팅, 친구, 길드를 모두 써요.',
  },
  {
    badge: '보존',
    title: '현재 마을 진행 그대로 유지',
    desc: '모아 둔 도감과 골드, 배와 낚싯대가 계정에 이어져요.',
  },
] as const;

type CloudStatusKey = 'on' | 'connecting' | 'error';

const CLOUD_STATUS: Record<CloudStatusKey, {
  glyph: 'cloudOk' | 'cloudSyncing' | 'cloudError';
  title: string;
  desc: string;
  triggerClass: string;
  dotClass: string;
  error?: boolean;
}> = {
  on: {
    glyph: 'cloudOk',
    title: '클라우드 저장 켜짐',
    desc: '진행 상황이 계정에 자동 저장되고 있어요.',
    triggerClass: 'text-accent border-accent/50 hover:border-accent hover:bg-accent/10',
    dotClass: 'bg-accent',
  },
  connecting: {
    glyph: 'cloudSyncing',
    title: '클라우드 저장 연결 중',
    desc: '계정 저장 상태를 확인하고 있어요.',
    triggerClass: 'text-text-dim border-line hover:border-text-dim hover:bg-line/30',
    dotClass: 'bg-text-dim',
  },
  error: {
    glyph: 'cloudError',
    title: '클라우드 저장 연결 실패',
    desc: '저장 서버에 닿지 않았어요. 잠시 뒤 다시 시도해 주세요.',
    triggerClass: 'text-danger border-danger/65 hover:border-danger hover:bg-danger/10',
    dotClass: 'bg-danger',
    error: true,
  },
};

// 계정 관리·출항 연결 창 - settings(manage)에서는 계정 상태·로그아웃·계정 삭제를, 게임 출항/해금 진입(connect)에서는 출항 안내와 구글 연결만 제공한다.
// 세션 확인에 실패했으면(accountFailed) 게스트로 보지 않고, 확인 실패 안내와 다시 확인 버튼만 둔다. 계정을 바꾸는 동작(구글 연결, 로그아웃, 계정 삭제)은 확인이 끝날 때까지 열지 않는다.
// 닉네임과 ID는 내 정보 창이 맡는다.
export default function AccountModal({
  layer, mode = 'manage', setToast, onAuthChanged, onClose, account, accountFailed, syncLabel, syncState, sailReturn = false,
}: {
  layer: 'stage' | 'app';
  /** manage: 설정 탭의 계정 관리 창 · connect: 포구 출항 등 게임 흐름에서 여는 출항 전용 연결 창 */
  mode?: 'connect' | 'manage';
  setToast: Notify;
  onAuthChanged: () => Promise<void>; onClose: () => void;
  account: string | null;
  /** 세션 확인에 실패했는가 — 이때 account는 null이지만 게스트가 아니다 */
  accountFailed: boolean;
  /** 저장 상태 문구(클라우드 켜짐, 미설정 등). 계정과 한 묶음이라 여기서 보여 준다 */
  syncLabel?: string | null; syncState?: string;
  /** 마을 포구 출항 차단으로 열렸는가 — 로그인 시작 시 출항 복귀 표지를 남기고, 취소해 닫으면 지운다 */
  sailReturn?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [showPerks, setShowPerks] = useState(true);
  const [perksDrawerOpen, setPerksDrawerOpen] = useState(false);
  const { confirm, input, dialogs } = useDialogs();
  const guest = account === null && !accountFailed;
  const firstLinkRewards = selectFirstLinkRewardItems();
  // 로컬(클라우드 미설정)에서도 화면은 보여준다 - 계정 기능만 막는다.
  const offline = !isAccountConfigured() || syncState === 'off';
  const signedInOnline = !guest && !accountFailed && !offline;
  const cloudKey: CloudStatusKey = syncState === 'connecting' || syncState === 'error' ? syncState : 'on';
  const cloud = CLOUD_STATUS[cloudKey];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  // 구글 인증 화면으로 이동한다. 이동하면 이 페이지는 떠나므로 성공 뒤에는 busy를 풀지 않는다.
  const connect = async () => {
    setBusy(true);
    setPendingGoogleOrigin(mode);
    if (sailReturn) setPendingSailReturn();
    const r = await connectGoogle().catch(() => ({ ok: false as const }));
    if (!r.ok) {
      clearPendingGoogleOrigin();
      if (sailReturn) clearPendingSailReturn();
      sendNotice(setToast, { kind: 'system.modalRejected', text: googleStartFailedText, toastText: '구글 계정 화면 열기 실패' });
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (!busy) {
      clearPendingGoogleOrigin();
      if (sailReturn) clearPendingSailReturn();
    }
    onClose();
  };

  const signOut = () => run(async () => {
    if (!(await confirm({ layer, title: '로그아웃', body: '로그아웃할까요?\n이 기기는 새 게스트로 다시 시작해요.', confirmLabel: '로그아웃' }))) return;
    await signOutAccount();
    window.location.reload(); // 재부팅 = 새 익명 세션으로 깔끔하게 시작
  });

  // 되돌릴 수 없는 동작이라 확인 문구를 직접 입력해야 지운다
  const removeAccount = () => run(async () => {
    const typed = await input({
      layer,
      title: '계정 삭제',
      body: '계정을 삭제하면 진행, 도감, 골드, 우편, 편지가 모두 지워지고 되돌릴 수 없어요.\n삭제하려면 아래 칸에 “삭제”를 입력해 주세요.',
      label: '확인 문구', placeholder: '삭제', confirmLabel: '계정 삭제',
    });
    if (typed === null) return;
    if (typed.trim() !== '삭제') {
      sendNotice(setToast, {
        kind: 'system.modalRejected',
        text: '확인 문구가 달라 삭제하지 않았어요.',
        toastText: '확인 문구가 일치하지 않아요.',
      });
      return;
    }
    const r = await deleteAccount();
    if (!r.ok) {
      sendNotice(setToast, {
        kind: 'system.modalRejected',
        text: `계정을 삭제하지 못했어요. ${r.msg}`,
        toastText: '계정 삭제에 실패했어요.',
      });
      return;
    }
    window.location.reload(); // 재부팅 = 새 익명 세션으로 처음부터 시작
  });

  const cloudTip = (
    <TipCard
      title={(
        <span className={cx('inline-flex items-center gap-1.5', cloud.error && 'text-danger')}>
          <span className={cx('size-1.5 shrink-0', cloud.dotClass)} aria-hidden="true" />
          <span>{cloud.title}</span>
        </span>
      )}
      description={cloud.desc}
    />
  );

  const accountRow = signedInOnline ? (
    <div className="flex items-center justify-between gap-2.5 px-3 py-2 min-h-[50px]">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <GoogleLogo size={18} className="shrink-0" />
        <span className="text-sm font-bold text-text truncate min-w-0">{account}</span>
      </div>
      <Tip wraps pressOpens text={cloudTip}>
        <IconButton
          type="button"
          boxed
          glyph={cloud.glyph}
          size={18}
          aria-label={cloud.title}
          className={cx('size-8 shrink-0 cursor-help transition-colors', cloud.triggerClass)}
        />
      </Tip>
    </div>
  ) : (
    <KeyValueRow label="계정" value={accountLabel(account, accountFailed)} valueEnd />
  );

  const links = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <ExternalLink icon href={LEGAL_PATHS.terms}>이용약관</ExternalLink>
      <ExternalLink icon href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>
      <ExternalLink icon href={LEGAL_PATHS.policy}>운영정책</ExternalLink>
    </div>
  );

  const connectMode = mode === 'connect';
  const title = connectMode ? '태평양 출항 준비' : '계정 관리';

  const legalNotice = (
    <Note size="xs" className="text-center mt-2 mb-0">
      계속하면 만 14세 이상이며 <ExternalLink icon href={LEGAL_PATHS.terms}>이용약관</ExternalLink>에 동의하고{' '}
      <ExternalLink icon href={LEGAL_PATHS.privacy}>개인정보 처리방침</ExternalLink>을 확인한 것으로 봐요.
    </Note>
  );

  const offlineNote = offline && (
    <Note className="mt-0">오프라인 상태에서는 계정 기능이 동작하지 않아요.<br />화면 확인용이에요.</Note>
  );

  const perkItems = (
    <div className="flex flex-col divide-y divide-line-dim">
      {CONNECT_PERKS.map(perk => (
        <div key={perk.badge} className="py-2 first:pt-1 last:pb-0 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Badge tone="accent" size="xs">{perk.badge}</Badge>
            <span className="text-xs font-bold text-text">{perk.title}</span>
          </div>
          <p className="text-xs text-text-dim leading-[1.45]">{perk.desc}</p>
        </div>
      ))}
    </div>
  );

  const perksAside = connectMode && guest && showPerks ? (
    <Frame className="w-[220px] p-3 flex flex-col gap-2 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-accent leading-[1.3]">연결하면 열리는 것</span>
        <IconButton
          type="button"
          glyph="close"
          size={12}
          tone="dim"
          aria-label="연결 안내 닫기"
          className="p-1 hover:text-text shrink-0"
          onClick={() => setShowPerks(false)}
        />
      </div>
      {perkItems}
    </Frame>
  ) : undefined;

  const content = connectMode && guest ? (
    <>
      <Inset tone="light" className="p-2.5 flex items-center gap-3">
        <BoatSprite tier={1} preset="row" className="shrink-0" />
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-[13px] font-bold text-text">태평양 너머 넓은 바다로 나갈 준비가 되었어요.</p>
          <p className="text-xs text-text-dim">지금까지의 마을 진행을 계정에 이어 두고 바다 항로를 열어요.</p>
        </div>
      </Inset>

      {perksDrawerOpen && (
        <Inset tone="base" className="px-2.5 py-2 @min-[880px]:hidden">
          {perkItems}
        </Inset>
      )}

      <FirstLinkRewardSection items={firstLinkRewards} />

      {offlineNote}
      <GoogleButton disabled={busy || offline} onClick={() => void connect()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
      {legalNotice}

      <div className="flex items-center justify-center gap-2.5 flex-wrap">
        {!showPerks && (
          <Button variant="ghost" size="sm" className="hidden @min-[880px]:inline-flex" onClick={() => setShowPerks(true)}>
            연결 혜택 보기
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="@min-[880px]:hidden"
          aria-expanded={perksDrawerOpen}
          onClick={() => setPerksDrawerOpen(o => !o)}
        >
          {perksDrawerOpen ? '연결 혜택 접기' : '연결 혜택 보기'}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={handleClose}>나중에 하기</Button>
      </div>
    </>
  ) : (
    <>
      <Inset divided className="mb-3">
        {accountRow}
        {!connectMode && offline && syncState === 'off' && syncLabel && (
          <div className="px-2 py-1.5 text-xs text-text-dim">
            {syncLabel}
          </div>
        )}
      </Inset>
      {offlineNote}

      {accountFailed ? (
        <>
          <Note tone="warn" className="mt-0">
            {ACCOUNT_CHECK_FAILED_COPY.lines.map((line, i) => <Fragment key={line}>{i > 0 && <br />}{line}</Fragment>)}
          </Note>
          <Button full disabled={busy || offline} onClick={() => void run(onAuthChanged)}>{ACCOUNT_CHECK_FAILED_COPY.retry}</Button>
        </>
      ) : guest ? (
        <>
          <GoogleButton disabled={busy || offline} onClick={() => void connect()}>{GOOGLE_BUTTON_LABEL}</GoogleButton>
          {legalNotice}
          <Note className="text-center">구글 계정을 연결하면 지금까지의 진행이 그 계정에 이어져요.</Note>
          <FirstLinkRewardSection items={firstLinkRewards} className="mt-2" />
        </>
      ) : (
        <Button full disabled={offline || busy} onClick={signOut}>로그아웃</Button>
      )}

      {!accountFailed && (
        <>
          <Divider className="mt-3 mb-2.5" />
          <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap">
            {!guest && links}
            <Button variant="ghost" size="sm" className="ml-auto" disabled={busy || offline} onClick={removeAccount}>계정 삭제</Button>
          </div>
        </>
      )}
    </>
  );

  return (
    <>
      {layer === 'stage' ? (
        <Modal layer="stage" width={connectMode && guest ? 420 : undefined} aside={perksAside} onClose={handleClose}>
          <ModalCard title={title} onClose={handleClose}>{content}</ModalCard>
        </Modal>
      ) : (
        <Modal layer="app" title={title} narrow onClose={handleClose}>{content}</Modal>
      )}
      {dialogs}
    </>
  );
}
