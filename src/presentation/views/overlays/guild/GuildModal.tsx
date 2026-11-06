import { useState } from 'react';
import { GUILD_MAX_MEMBERS } from '../../../../game/rules/guild';
import { GUILD_LEVEL_HELP, GUILD_ERROR_TEXT, growthBar, growthTotalText, splitMembers } from '../../../../features/guild/model/guild';
import type { GuildConfirm, GuildInfo, GuildOp } from '../../../../features/guild/model/guild';
import { useGuild } from '../../../../features/guild/service/useGuild';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import TabBar from '../../../ui/TabBar';
import Tip from '../../../ui/Tip';
import GuildLogbookTab from './GuildLogbookTab';
import GuildManageTab from './GuildManageTab';
import GuildMembersTab from './GuildMembersTab';
import GuildSkillsTab from './GuildSkillsTab';
import NoGuild from './NoGuild';
import type { GuildJoin } from './NoGuild';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드 창. 게임 스테이지 안에 뜨고, 길드가 있으면 680px 폭에 스테이지 높이로 고정한다.
// 제목(길드 정보) 아래 한 줄에는 어느 탭에서나 의미가 있는 고정 정보(길드 이름, 레벨, 진행, 인원)를 두고,
// 그 아래 탭(길드원, 길드 스킬, 항해일지, 길드장에게만 관리)이 각자 자기 일에 쓰는 정보만 보인다. 관리 탭 이름 옆에는 처리할 가입 신청 수를 붙인다.
// 길드가 없으면 400 폭 한 열(코드로 들어가기, 길드 만들기)이다.
// 길드 스킬 값은 서버가 판정해 적용한다. 이 창은 서버가 보낸 값을 보여 주고 요청을 보내기만 한다.
// 창 자체는 스크롤하지 않는다. 넘치는 내용은 탭 본문 안에서만 굴린다.
const FAILED = '요청을 처리하지 못했어요. 잠시 뒤 다시 해 주세요.';
/** 길드가 있을 때의 창 높이: 가장 긴 탭(길드 스킬)이 스크롤 없이 들어가는 560px로 고정하고, 스테이지가 그보다 낮으면 위아래 16px을 남긴다.
    좁은 화면에서는 내용 높이를 따른다 */
const FIXED_HEIGHT = 'h-[min(560px,calc(100%-32px))] max-[640px]:h-auto';

export default function GuildModal({ setToast, onGoldChanged, onClose }: {
  setToast: Notify;
  /** 기부로 골드가 바뀐 뒤 게임 상태를 다시 읽는다 */
  onGoldChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { guild, request, loading, failed, you, act } = useGuild(true, true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<GuildConfirm | null>(null);

  /** 요청 하나. 거부는 안내 문장으로 돌려주고, 연결 실패는 알림으로 보인다 */
  const run = async (op: GuildOp): Promise<string | null> => {
    setBusy(true);
    try {
      const r = await act(op);
      return r.ok ? null : GUILD_ERROR_TEXT[r.error] ?? FAILED;
    } catch {
      return '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.';
    } finally {
      setBusy(false);
    }
  };

  /** 코드로 들어오기 — 들어갔는지 신청이 됐는지를 함께 돌려준다 */
  const join: GuildJoin = async code => {
    setBusy(true);
    try {
      const r = await act({ op: 'join', code });
      return r.ok ? { error: null, requested: r.result === 'requested' } : { error: GUILD_ERROR_TEXT[r.error] ?? FAILED, requested: false };
    } catch {
      return { error: '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.', requested: false };
    } finally {
      setBusy(false);
    }
  };

  const inGuild = Boolean(guild && you);
  const body = guild && you
    ? <GuildView guild={guild} me={you} busy={busy} run={run} setToast={setToast} ask={setConfirm} onGoldChanged={onGoldChanged} />
    : guild === null && !loading && !failed
      ? <NoGuild busy={busy} run={run} join={join} request={request} setToast={setToast} />
      : (
        <div className="flex h-40 items-center justify-center">
          {failed ? <Note tone="warn">길드 정보를 불러오지 못했어요.<br />잠시 뒤 다시 열어 주세요.</Note>
            : <Note>길드 정보를 불러오는 중이에요.</Note>}
        </div>
      );

  return (
    <Modal layer="stage" md={inGuild} onClose={onClose} className={inGuild ? FIXED_HEIGHT : undefined}>
      <ModalCard title={inGuild ? '길드 정보' : '길드'} onClose={onClose} className={inGuild ? 'flex-1' : undefined}>
        {body}
      </ModalCard>
      {confirm && (
        <ConfirmDialog layer="stage" title={confirm.title} confirmLabel={confirm.label}
                       onCancel={() => setConfirm(null)}
                       onConfirm={() => {
                         const c = confirm;
                         setConfirm(null);
                         void run(c.op).then(error => setToast(error ?? c.done, error ? 'warn' : 'info'));
                       }}>
          <p className="text-sm whitespace-pre-line">{confirm.text}</p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}

type GuildTab = 'members' | 'skills' | 'logbook' | 'manage';

/** 길드가 있을 때: 고정 정보 줄과 탭(길드장은 관리 탭까지 넷) */
function GuildView({ ask, onGoldChanged, ...part }: GuildPartProps & { ask: GuildAsk; onGoldChanged: () => Promise<void> | void }) {
  const [tab, setTab] = useState<GuildTab>('members');
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <GuildStatus guild={part.guild} />
      <TabBar<GuildTab> activeKey={tab} onSelect={setTab} tabs={[
        { key: 'members', label: '길드원' },
        { key: 'skills', label: '길드 스킬' },
        { key: 'logbook', label: '항해일지' },
        ...(part.guild.role === 'leader' ? [{ key: 'manage' as const, label: '관리', count: part.guild.requests.length }] : []),
      ]} />
      <div className="flex flex-col flex-1 min-h-0">
        {tab === 'members' && <GuildMembersTab {...part} ask={ask} />}
        {tab === 'skills' && <GuildSkillsTab {...part} onGoldChanged={onGoldChanged} />}
        {tab === 'logbook' && <GuildLogbookTab logbook={part.guild.logbook} me={part.me} />}
        {tab === 'manage' && part.guild.role === 'leader' && <GuildManageTab {...part} />}
      </div>
    </div>
  );
}

/** 고정 정보 줄: 길드 이름, 길드 레벨, 다음 레벨까지 진행 막대와 누적 기여, 인원. 레벨이 오르는 조건은 막대의 툴팁이다 */
function GuildStatus({ guild }: { guild: GuildInfo }) {
  const bar = growthBar(guild.growth);
  return (
    <Inset className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-3 h-10 px-3 shrink-0">
      <b className="max-w-40 truncate pr-3 border-r border-line text-text">{guild.name}</b>
      <span className="pf-accent text-base text-gold">Lv.{guild.growth.level}</span>
      <Tip plain text={GUILD_LEVEL_HELP} className="block">
        <span className="block h-2 border border-line bg-bg shadow-[inset_1px_1px_0_var(--bevel-hi)]" role="meter"
              aria-label="다음 레벨까지 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(bar.ratio * 100)}>
          <span className={cx('block h-full shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]', bar.remaining === null ? 'bg-gold' : 'bg-accent')}
                style={{ width: `${bar.ratio * 100}%` }} />
        </span>
      </Tip>
      <span className="pf-accent text-xs">{growthTotalText(guild.growth)}</span>
      <span className="flex items-baseline gap-2 pl-3 border-l border-line">
        <span className="text-xs text-text-dim">인원</span>
        <span className="pf-accent text-xs">{splitMembers(guild.members).active.length}/{GUILD_MAX_MEMBERS}</span>
      </span>
    </Inset>
  );
}
