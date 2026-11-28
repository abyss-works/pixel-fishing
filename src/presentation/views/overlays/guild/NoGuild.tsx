import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  GUILD_CREATE_RULES, inviteDialogView, joinRequestDaysLeft, normalizeGuildCode,
} from '../../../../features/guild/model/guild';
import type { GuildCooldownInfo, GuildMyRequest } from '../../../../features/guild/model/guild';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { useGuildInvite } from '../../../../features/guild/service/useGuildInvite';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import Subheading from '../../../ui/Subheading';
import TabBar from '../../../ui/TabBar';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import { SCROLL_Y } from '../../../ui/scrollArea';
import GuildInviteSummary from './GuildInviteSummary';
import GuildListView from './GuildListView';
import type { GuildRun } from './guildProps';

/** 코드로 들어오기 — 바로 들어갔는지 신청이 됐는지, 거부면 안내 문장 */
export type GuildJoin = (code: string) => Promise<{ error: string | null; requested: boolean }>;

/** 목록에서 가입·신청하기 — 바로 들어갔는지 신청이 됐는지, 거부면 안내 문장 */
export type GuildJoinPublic = (guildId: string) => Promise<{ error: string | null; requested: boolean }>;

type NoGuildTab = 'list' | 'create';

/** 찾기와 만들기 버튼의 너비를 맞춘다 */
const ACTION_WIDTH = 'w-16 shrink-0';

const NO_COOLDOWN: GuildCooldownInfo = { active: false, remainingMs: 0, remainingText: null };

// 길드가 없을 때 — 가입 후 창과 같은 680x560 고정 크기 안에 2탭(길드 목록, 길드 만들기)으로 나눈다.
// 길드 목록 상단에는 인라인 초대 코드 바를 두고, 넣어 둔 가입 신청이나 재가입 대기가 있으면 탭 아래 배너로 안내한다.
export default function NoGuild({ busy, run, join, joinPublic, request, cooldown = NO_COOLDOWN, dialogHost, setToast }: {
  busy: boolean;
  run: GuildRun;
  join: GuildJoin;
  joinPublic?: GuildJoinPublic;
  /** 넣어 둔 가입 신청 */
  request: GuildMyRequest | null;
  /** 재가입 대기 상태 */
  cooldown?: GuildCooldownInfo;
  dialogHost?: HTMLElement | null;
  setToast: Notify;
}) {
  const nowISO = useNow();
  const cooldownTooltip = cooldown.active && cooldown.remainingText
    ? `재가입 대기 중이라 ${cooldown.remainingText} 뒤에 이용할 수 있어요.`
    : null;
  const [tab, setTab] = useState<NoGuildTab>('list');

  const [name, setName] = useState('');
  const [input, setInput] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const invite = useGuildInvite(code);
  const view = code && invite.settled ? inviteDialogView(invite.preview, { account: true, guild: null }, 'code') : null;

  const onFind = (e: FormEvent) => {
    e.preventDefault();
    const c = normalizeGuildCode(input);
    setCodeError(c ? null : '길드 코드는 8자리예요.');
    // 같은 코드는 쿼리 키가 그대로라 다시 읽히지 않는다 — 찾기를 누르면 최신 상태를 읽는다
    if (c && c === code) void invite.refresh();
    setCode(c);
  };
  const onJoin = async () => {
    if (!code || cooldown.active) return;
    const r = await join(code);
    setCodeError(r.error);
    if (!r.error) sendNotice(setToast, {
      kind: 'guild.modalAction',
      text: r.requested ? '가입 신청을 보냈어요. 길드장이 승인하면 들어가요.' : '길드에 들어갔어요.',
      toastText: r.requested ? '길드 가입 신청 전송!' : '길드에 들어갔어요!',
    });
  };
  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (cooldown.active) return;
    const value = name.trim();
    const error = await run({ op: 'create', name: value });
    setNameError(error);
    if (!error) sendNotice(setToast, {
      kind: 'guild.modalAction',
      text: `${value} 길드를 만들었어요.`,
      toastText: `${value} 길드 창설!`,
    });
  };
  const onCancel = async () => {
    const error = await run({ op: 'cancelRequest' });
    if (error) sendNotice(setToast, { kind: 'system.modalRejected', text: error });
    else sendNotice(setToast, { kind: 'guild.modalAction', text: '가입 신청을 거뒀어요.', tone: 'neutral' });
  };
  const fallbackJoinPublic: GuildJoinPublic = async guildId => {
    const error = await run({ op: 'joinPublic', guildId });
    return { error, requested: false };
  };

  const inviteBar = (
    <Inset tone="deep" className="flex flex-col gap-2 px-2.5 py-2 shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text whitespace-nowrap shrink-0">
          <PixelIcon glyph="key" size={12} />
          <span>초대 코드</span>
        </span>
        <form className="flex items-center gap-1.5 flex-1 min-w-[190px]" onSubmit={onFind}>
          <TextInput
            compact="sm"
            className="flex-1 min-w-0 w-full uppercase pf-accent tracking-widest"
            value={input}
            maxLength={16}
            onChange={e => setInput(e.target.value)}
            aria-label="길드 초대 코드"
            placeholder="길드 코드 8자리"
          />
          <Button type="submit" size="sm" disabled={busy} className={ACTION_WIDTH}>찾기</Button>
        </form>
      </div>
      {codeError && <Note tone="warn" className="my-0">{codeError}</Note>}
      {!codeError && invite.loading && <Note className="my-0">길드를 찾는 중이에요.</Note>}
      {!codeError && invite.failed && <Note tone="warn" className="my-0">길드를 불러오지 못했어요. 찾기를 눌러 다시 시도해 주세요.</Note>}
      {!codeError && code && view && (
        <GuildInviteSummary
          preview={invite.preview}
          view={view}
          busy={busy}
          disabledTooltip={cooldownTooltip}
          onConfirm={() => { void onJoin(); }}
        />
      )}
    </Inset>
  );

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <TabBar<NoGuildTab> inline activeKey={tab} onSelect={setTab} tabs={[
        { key: 'list', label: '길드 목록', icon: <PixelIcon glyph="compass" size={12} /> },
        { key: 'create', label: '길드 만들기', icon: <PixelIcon glyph="plus" size={12} /> },
      ]} />

      {cooldown.active && cooldown.remainingText && (
        <Inset tone="deep" border="danger" role="status" className="flex items-start gap-2 px-3 py-2 text-xs shrink-0">
          <PixelIcon glyph="clock" size={14} className="mt-0.5 text-danger shrink-0" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-text font-bold">길드 재가입 대기 중이라 지금은 가입하거나 새 길드를 만들 수 없어요.</span>
            <span className="text-text-dim">{`${cooldown.remainingText} 뒤에 다시 이용할 수 있어요.`}</span>
          </div>
        </Inset>
      )}

      {request && (
        <Inset tone="deep" className="flex items-center justify-between gap-2 px-3 py-2 text-xs shrink-0 flex-wrap">
          <span className="flex-1 min-w-[180px]">
            <b>{request.name}</b> 길드에 가입을 신청했어요. 바로 가입하면 기존 신청이 취소돼요.
          </span>
          <span className="pf-accent text-2xs text-text-dim shrink-0">{joinRequestDaysLeft(request.requestedAt, nowISO)}일 남음</span>
          <Button size="sm" disabled={busy} onClick={() => { void onCancel(); }}>신청 취소</Button>
        </Inset>
      )}

      {tab === 'list' && (
        <GuildListView
          busy={busy}
          cooldownTooltip={cooldownTooltip}
          request={request}
          dialogHost={dialogHost}
          setToast={setToast}
          onJoinPublic={joinPublic ?? fallbackJoinPublic}
          topSlot={inviteBar}
          emptyAction={<Button size="sm" variant="primary" onClick={() => setTab('create')}>길드 만들기</Button>}
        />
      )}

      {tab === 'create' && (
        <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col gap-2.5')}>
          <Subheading className="mb-0 text-xs">새 길드 만들기</Subheading>
          <Inset tone="deep" className="px-3 py-2.5 flex flex-col gap-1.5 text-xs text-text-dim">
            {GUILD_CREATE_RULES.map(rule => (
              <div key={rule} className="flex items-start gap-2">
                <span className="size-[5px] mt-1.5 shrink-0 bg-gold" aria-hidden="true" />
                <span>{rule}</span>
              </div>
            ))}
          </Inset>
          <form className="flex gap-2" onSubmit={e => { void onCreate(e); }}>
            <TextInput compact="sm" className="flex-1 min-w-0 w-full" value={name} maxLength={16}
                       onChange={e => setName(e.target.value)} aria-label="길드 이름" placeholder="길드 이름" />
            {cooldownTooltip ? (
              <Tip wraps text={cooldownTooltip}>
                <Button type="submit" size="sm" variant="primary" disabled className={ACTION_WIDTH}>만들기</Button>
              </Tip>
            ) : (
              <Button type="submit" size="sm" variant="primary" disabled={busy} className={ACTION_WIDTH}>만들기</Button>
            )}
          </form>
          {nameError && <Note tone="warn">{nameError}</Note>}
        </div>
      )}
    </div>
  );
}
