import { useState } from 'react';
import { GUILD_MAX_MEMBERS } from '../../../../game/rules/guild';
import type { ArtifactHolder } from '../../../../game/rules/artifactLevel';
import {
  GUILD_LEVEL_HELP, enhancePoolSummary, growthBar, guildErrorText, splitMembers,
} from '../../../../features/guild/model/guild';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import type { GuildConfirm, GuildInfo, GuildOp } from '../../../../features/guild/model/guild';
import { useGuild } from '../../../../features/guild/service/useGuild';
import { useGuildCooldown } from '../../../../features/guild/service/useGuildCooldown';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import ProgressCount from '../../../ui/ProgressCount';
import ProgressMeter from '../../../ui/ProgressMeter';
import TabBar from '../../../ui/TabBar';
import Tip, { TipBullets } from '../../../ui/Tip';
import { splitTipLines } from '../../../ui/tipText';
import GuildLogbookTab from './GuildLogbookTab';
import GuildManageTab from './GuildManageTab';
import GuildMembersTab from './GuildMembersTab';
import GuildSkillsTab from './GuildSkillsTab';
import NoGuild from './NoGuild';
import type { GuildJoin } from './NoGuild';
import type { GuildAsk, GuildPartProps } from './guildProps';

// 길드 창. 게임 스테이지 안에 뜨고, 길드가 있든 없든 680px 폭에 560px 높이(스테이지가 그보다 낮으면 스테이지 높이 기준)로 고정한다.
// 길드가 있으면 제목(길드 정보) 아래 한 줄에는 고정 정보(길드 이름, 레벨, 진행, 인원)와 탭(스킬, 길드원, 항해일지, 길드장에게만 관리)을 둔다.
// 길드가 없으면 3탭(공개 길드, 코드로 가입, 길드 만들기)을 둔다.
// 길드 스킬 값은 서버가 판정해 적용한다. 이 창은 서버가 보낸 값을 보여 주고 요청을 보내기만 한다.
// 창 자체는 스크롤하지 않는다. 넘치는 내용은 탭 본문 안에서만 굴린다.

export default function GuildModal({ gold, artifacts, setToast, onGoldChanged, onClose, onRetry }: {
  /** 내 골드 — 이름 바꾸기 비용을 낼 수 있는지 보인다 */
  gold: number;
  /** 보유 유물 - 오늘 기여 상한이 네임드 토벌 하루 횟수 가산을 반영한다 */
  artifacts: ArtifactHolder;
  setToast: Notify;
  /** 기부로 골드가 바뀐 뒤 게임 상태를 다시 읽는다 */
  onGoldChanged: () => Promise<void> | void;
  onClose: () => void;
  /** 조회 실패 시 다시 시도 콜백 */
  onRetry?: () => void;
}) {
  const { guild, request, cooldownUntil, loading, failed, you, act, refresh } = useGuild(true, true);
  const cooldown = useGuildCooldown(cooldownUntil ?? null);
  const retryGuild = onRetry ?? refresh;
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<GuildConfirm | null>(null);
  const [dialogHost, setDialogHost] = useState<HTMLDivElement | null>(null);

  /** 요청 하나. 거부는 안내 문장으로 돌려주고, 연결 실패는 알림으로 보인다 */
  const runOp = async (op: GuildOp): Promise<{ error: string | null; recovered?: number }> => {
    setBusy(true);
    try {
      const r = await act(op);
      return r.ok ? { error: null, recovered: r.recovered } : { error: guildErrorText(r.error, op.op, cooldown.remainingText) };
    } catch {
      return { error: '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.' };
    } finally {
      setBusy(false);
    }
  };
  const run = async (op: GuildOp): Promise<string | null> => (await runOp(op)).error;

  /** 코드로 들어오기 — 들어갔는지 신청이 됐는지를 함께 돌려준다 */
  const join: GuildJoin = async code => {
    setBusy(true);
    try {
      const r = await act({ op: 'join', code });
      return r.ok ? { error: null, requested: r.result === 'requested' } : { error: guildErrorText(r.error, 'join', cooldown.remainingText), requested: false };
    } catch {
      return { error: '길드 요청을 보내지 못했어요. 연결을 확인해 주세요.', requested: false };
    } finally {
      setBusy(false);
    }
  };

  const inGuild = Boolean(guild && you);
  const body = loading
    ? (
      <div className="flex h-40 items-center justify-center">
        <Note>길드 정보를 불러오는 중이에요.</Note>
      </div>
    )
    : failed || (guild !== null && !you)
      ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
          <Note tone="warn" className="my-0">길드 정보를 열지 못했어요.</Note>
          <Button size="sm" onClick={() => { void retryGuild(); }}>다시 시도</Button>
        </div>
      )
      : guild && you
        ? (
          <GuildView guild={guild} me={you} busy={busy} run={run}
                     onResetEnhancements={() => runOp({ op: 'resetEnhancements', guildId: guild.id })}
                     setToast={setToast} ask={setConfirm} dialogHost={dialogHost} gold={gold} artifacts={artifacts} onGoldChanged={onGoldChanged} />
        )
        : <NoGuild busy={busy} run={run} join={join} request={request} cooldown={cooldown} dialogHost={dialogHost} setToast={setToast} />;

  return (
    // 길드 유무와 무관하게 창 크기를 680px 폭, 560px 높이(스테이지가 더 낮으면 가용 높이)로 고정해 가입 전후 크기 급변을 막는다.
    <Modal layer="stage" md height={560} mobileFixed onClose={onClose}>
      <ModalCard title={inGuild ? '길드 정보' : '길드'} onClose={onClose} fixed>
        {body}
      </ModalCard>
      {confirm && (
        <ConfirmDialog layer="stage" title={confirm.title} confirmLabel={confirm.label}
                       onCancel={() => setConfirm(null)}
                       onConfirm={() => {
                         const c = confirm;
                         setConfirm(null);
                         void run(c.op).then(error => {
                           if (error) sendNotice(setToast, { kind: 'system.modalRejected', text: error });
                           else sendNotice(setToast, { kind: 'guild.modalAction', text: c.done });
                         });
                       }}>
          <p className="text-sm whitespace-pre-line">{confirm.text}</p>
          {confirm.warn && (
            <Inset tone="deep" border="danger" className="mt-2.5 p-2.5 flex flex-col gap-0.5 text-2xs text-text-dim">
              <strong className="text-danger">재가입 제한 안내</strong>
              <span>{confirm.warn}</span>
            </Inset>
          )}
        </ConfirmDialog>
      )}
      <div ref={setDialogHost} />
    </Modal>
  );
}

type GuildTab = 'skills' | 'members' | 'logbook' | 'manage';

/** 길드가 있을 때: 고정 정보 줄과 탭(길드장은 관리 탭까지 넷) */
function GuildView({ ask, dialogHost, gold, artifacts, onGoldChanged, onResetEnhancements, ...part }: GuildPartProps & {
  ask: GuildAsk; dialogHost: HTMLElement | null; gold: number; artifacts: ArtifactHolder; onGoldChanged: () => Promise<void> | void;
  onResetEnhancements: () => Promise<{ error: string | null; recovered?: number }>;
}) {
  const [tab, setTab] = useState<GuildTab>('skills');
  const remainingPoints = enhancePoolSummary(part.guild).remaining;
  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <GuildStatus guild={part.guild} />
      <TabBar<GuildTab> activeKey={tab} onSelect={setTab} tabs={[
        { key: 'skills', label: '스킬', count: remainingPoints, countTone: 'guild', countLabel: `${remainingPoints}포인트` },
        { key: 'members', label: '길드원' },
        { key: 'logbook', label: '항해일지' },
        ...(part.guild.role === 'leader' ? [{ key: 'manage' as const, label: '관리', count: part.guild.requests.length }] : []),
      ]} />
      <div className="flex flex-col flex-1 min-h-0">
        {tab === 'skills' && <GuildSkillsTab {...part} gold={gold} dialogHost={dialogHost} onResetEnhancements={onResetEnhancements} onGoldChanged={onGoldChanged} />}
        {tab === 'members' && <GuildMembersTab {...part} ask={ask} artifacts={artifacts} />}
        {tab === 'logbook' && <GuildLogbookTab logbook={part.guild.logbook} me={part.me} />}
        {tab === 'manage' && part.guild.role === 'leader' && <GuildManageTab {...part} gold={gold} dialogHost={dialogHost} onGoldChanged={onGoldChanged} />}
      </div>
    </div>
  );
}

/** 고정 정보 줄: 길드 이름, 길드 레벨, 다음 레벨까지 진행 막대와 누적 기여, 인원. 레벨이 오르는 조건은 막대의 툴팁이다 */
function GuildStatus({ guild }: { guild: GuildInfo }) {
  const bar = growthBar(guild.growth);
  return (
    <Inset className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 min-h-10 px-3 py-1.5 shrink-0 mobile:grid-cols-[minmax(0,1fr)_auto_auto]">
      <b className="max-w-40 truncate text-text mobile:max-w-none">{guild.name}</b>
      <span className="pf-accent text-base text-gold">Lv.{guild.growth.level}</span>
      <Tip plain text={<TipBullets items={splitTipLines(GUILD_LEVEL_HELP)} />} className="block mobile:col-span-2 mobile:row-start-2">
        <ProgressMeter
          current={Math.round(bar.ratio * 100)}
          target={100}
          ratio={bar.ratio}
          tone={bar.remaining === null ? 'gold' : 'accent'}
          ariaLabel="다음 레벨까지 진행"
        />
      </Tip>
      {guild.growth.next !== null ? (
        <ProgressCount
          current={guild.growth.total}
          target={guild.growth.next}
          className="text-xs whitespace-nowrap mobile:row-start-2 mobile:justify-self-end"
        />
      ) : (
        <ProgressCount
          value={guild.growth.total}
          className="text-xs whitespace-nowrap mobile:row-start-2 mobile:justify-self-end"
        />
      )}
      <span className="flex items-baseline gap-1.5 whitespace-nowrap mobile:col-start-3 mobile:row-start-1">
        <span className="text-xs text-text-dim">인원</span>
        <ProgressCount current={splitMembers(guild.members).active.length} target={GUILD_MAX_MEMBERS} tight className="text-xs" />
      </span>
    </Inset>
  );
}
