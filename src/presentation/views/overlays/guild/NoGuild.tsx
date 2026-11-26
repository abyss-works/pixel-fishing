import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createPortal } from 'react-dom';
import {
  GUILD_CREATE_RULES, PUBLIC_GUILD_SORT_OPTIONS, guildActivityText, inviteDialogView, joinRequestDaysLeft,
  normalizeGuildCode, publicJoinConfirm,
} from '../../../../features/guild/model/guild';
import type { GuildMyRequest, PublicGuildItem, PublicGuildSort } from '../../../../features/guild/model/guild';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { useGuildInvite } from '../../../../features/guild/service/useGuildInvite';
import { usePublicGuilds } from '../../../../features/guild/service/usePublicGuilds';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Button from '../../../ui/Button';
import ButtonRow from '../../../ui/ButtonRow';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import type { Notify } from '../../../ui/hud/messageFeed';
import IconButton from '../../../ui/IconButton';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressCount from '../../../ui/ProgressCount';
import Skeleton from '../../../ui/Skeleton';
import Subheading from '../../../ui/Subheading';
import TabBar from '../../../ui/TabBar';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import { SCROLL_Y } from '../../../ui/scrollArea';
import GuildInviteSummary from './GuildInviteSummary';
import type { GuildRun } from './guildProps';

/** 코드로 들어오기 — 바로 들어갔는지 신청이 됐는지, 거부면 안내 문장 */
export type GuildJoin = (code: string) => Promise<{ error: string | null; requested: boolean }>;

type NoGuildTab = 'open' | 'code' | 'create';

/** 찾기와 만들기 버튼의 너비를 맞춘다 */
const ACTION_WIDTH = 'w-16 shrink-0';

function GuildPitch({ pitch }: { pitch: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  return (
    <Tip
      hoverOnly
      plain
      className="block min-w-0"
      onlyIf={() => {
        const el = ref.current;
        return Boolean(el && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1));
      }}
      text={pitch}
    >
      <p ref={ref} className="m-0 text-xs text-text-dim truncate mobile:whitespace-normal mobile:line-clamp-2">{pitch}</p>
    </Tip>
  );
}

// 길드가 없을 때 — 가입 후 창과 같은 680x560 고정 크기 안에 3탭(공개 길드, 코드로 가입, 길드 만들기)으로 나눈다.
// 넣어 둔 가입 신청이 있으면 탭 아래 상단 배너로 남은 기간과 신청 취소, 바로 가입 시 기존 신청 자동 취소 안내를 보인다.
export default function NoGuild({ busy, run, join, request, dialogHost, setToast }: {
  busy: boolean;
  run: GuildRun;
  join: GuildJoin;
  /** 넣어 둔 가입 신청 */
  request: GuildMyRequest | null;
  dialogHost?: HTMLElement | null;
  setToast: Notify;
}) {
  const nowISO = useNow();
  const nowMs = Date.parse(nowISO);
  const [tab, setTab] = useState<NoGuildTab>('open');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<PublicGuildSort>('activity');
  const [joinTarget, setJoinTarget] = useState<PublicGuildItem | null>(null);
  useEffect(() => {
    if (search.trim() === '') return;
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const effectiveSearch = search.trim() === '' ? '' : debouncedSearch;
  const publicGuilds = usePublicGuilds(effectiveSearch, sort, tab === 'open');

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
    if (!code) return;
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
  const confirmPublicJoin = async () => {
    if (!joinTarget) return;
    const target = joinTarget;
    setJoinTarget(null);
    const error = await run({ op: 'joinPublic', guildId: target.guildId });
    if (error) {
      sendNotice(setToast, { kind: 'system.modalRejected', text: error });
      void publicGuilds.refresh();
    } else {
      sendNotice(setToast, {
        kind: 'guild.modalAction',
        text: `${target.name} 길드에 들어갔어요.`,
        toastText: '길드에 들어갔어요!',
      });
    }
  };

  const confirmData = joinTarget ? publicJoinConfirm(joinTarget, request) : null;
  const confirmDialog = confirmData && (
    <ConfirmDialog layer="stage" title={confirmData.title} confirmLabel={confirmData.label}
                   onCancel={() => setJoinTarget(null)}
                   onConfirm={() => { void confirmPublicJoin(); }}>
      <p className="m-0 text-sm"><b>{confirmData.guild.name}</b> 길드에 바로 들어갈까요?</p>
      <Inset className="mt-2.5 px-3 py-2 flex flex-col gap-1 text-sm">
        <ul className="m-0 p-0 list-none flex flex-col">
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="길드" value={confirmData.guild.name} valueClassName="font-bold" />
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="레벨" value={`Lv.${confirmData.guild.level}`} valueClassName="pf-accent text-gold" />
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="인원" value={`${confirmData.guild.members}/${confirmData.guild.cap}`} valueClassName="pf-accent" />
        </ul>
        <p className="m-0 pt-1.5 border-t border-line/60 text-xs text-text-dim">"{confirmData.guild.pitch}"</p>
      </Inset>
      {confirmData.pendingCancelWarn && (
        <Inset tone="deep" border="danger" className="mt-2.5 p-2.5 flex flex-col gap-0.5 text-2xs text-text-dim">
          <strong className="text-danger">기존 가입 신청 자동 취소</strong>
          <span>{confirmData.pendingCancelWarn}</span>
        </Inset>
      )}
    </ConfirmDialog>
  );

  return (
    <div className="flex flex-col gap-2.5 flex-1 min-h-0">
      <TabBar<NoGuildTab> inline activeKey={tab} onSelect={setTab} tabs={[
        { key: 'open', label: '공개 길드', icon: <PixelIcon glyph="compass" size={12} /> },
        { key: 'code', label: '코드로 가입', icon: <PixelIcon glyph="key" size={12} /> },
        { key: 'create', label: '길드 만들기', icon: <PixelIcon glyph="plus" size={12} /> },
      ]} />

      {request && (
        <Inset tone="deep" className="flex items-center justify-between gap-2 px-3 py-2 text-xs shrink-0 flex-wrap">
          <span className="flex-1 min-w-[180px]">
            <b>{request.name}</b> 길드에 가입을 신청했어요. 바로 가입하면 기존 신청이 취소돼요.
          </span>
          <span className="pf-accent text-2xs text-text-dim shrink-0">{joinRequestDaysLeft(request.requestedAt, nowISO)}일 남음</span>
          <Button size="sm" disabled={busy} onClick={() => { void onCancel(); }}>신청 취소</Button>
        </Inset>
      )}

      {tab === 'open' && (
        <div className="flex flex-col gap-2 flex-1 min-h-0">
          <div className="flex flex-col gap-1.5 shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1 min-w-0 flex items-center">
                <TextInput compact="sm" value={search} maxLength={20} onChange={e => setSearch(e.target.value)}
                           aria-label="길드명 검색" placeholder="길드명 검색" className="w-full min-w-0 pr-8" />
                {search.trim() !== '' && (
                  <IconButton type="button" glyph="close" size={10} tone="dim" aria-label="검색어 지우기"
                              onClick={() => setSearch('')} className="absolute right-1.5 size-6 justify-center" />
                )}
              </div>
              <Button size="sm" disabled={busy || publicGuilds.fetching} onClick={() => { void publicGuilds.refresh(); }}>
                <PixelIcon glyph="refresh" size={12} />
                <span>새로고침</span>
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="목록 정렬">
                <span className="text-2xs text-text-dim mr-0.5">정렬</span>
                {PUBLIC_GUILD_SORT_OPTIONS.map(opt => (
                  <ToggleChip key={opt.value} variant="choice" size="sm" pressed={sort === opt.value} emphasis={sort === opt.value}
                              onClick={() => setSort(opt.value)}>
                    {opt.label}
                  </ToggleChip>
                ))}
              </div>
              <span className="text-2xs text-text-dim whitespace-nowrap">
                {publicGuilds.loading ? '불러오는 중'
                  : publicGuilds.failed ? ''
                    : <>바로 가입 가능 <b className="pf-accent font-normal text-gold">{publicGuilds.guilds.length}</b>개</>}
              </span>
            </div>
          </div>

          <Inset as="section" aria-label="공개 길드 목록" className="flex-1 min-h-0 flex flex-col px-2.5 py-1">
            {publicGuilds.loading ? (
              <div className="flex flex-col" role="status" aria-label="공개 길드 목록을 불러오는 중이에요">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-2.5', i > 0 && 'border-t border-line/60')} aria-hidden="true">
                    <div className="flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-2/5" />
                      <Skeleton className="h-2.5 w-4/5" />
                    </div>
                    <Skeleton className="h-[30px] w-[62px]" />
                  </div>
                ))}
              </div>
            ) : publicGuilds.failed ? (
              <EmptyState framed={false} iconTone="danger" className="flex-1" glyph="warn"
                          message={(
                            <div className="flex flex-col gap-1">
                              <b className="text-text text-sm">공개 길드 목록을 불러오지 못했어요.</b>
                              <span>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</span>
                            </div>
                          )}
                          action={<Button size="sm" onClick={() => { void publicGuilds.refresh(); }}>다시 시도</Button>} />
            ) : publicGuilds.guilds.length === 0 ? (
              search.trim() !== '' ? (
                <EmptyState framed={false} className="flex-1" glyph="compass"
                            message={(
                              <div className="flex flex-col gap-1">
                                <b className="text-text text-sm">검색어와 맞는 공개 길드가 없어요.</b>
                                <span>다른 길드 이름으로 검색하거나 검색어를 지워 전체 목록을 확인해 보세요.</span>
                              </div>
                            )}
                            action={<Button size="sm" onClick={() => setSearch('')}>검색 초기화</Button>} />
              ) : (
                <EmptyState framed={false} className="flex-1" glyph="compass"
                            message={(
                              <div className="flex flex-col gap-1">
                                <b className="text-text text-sm">지금 바로 들어갈 수 있는 공개 길드가 없어요.</b>
                                <span>초대 코드를 알고 있다면 코드로 들어가거나 새 길드를 직접 만들 수 있어요.</span>
                              </div>
                            )}
                            action={(
                              <ButtonRow>
                                <Button size="sm" onClick={() => setTab('code')}>코드로 가입</Button>
                                <Button size="sm" variant="primary" onClick={() => setTab('create')}>길드 만들기</Button>
                              </ButtonRow>
                            )} />
              )
            ) : (
              <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col')}>
                {publicGuilds.guilds.map((g, i) => (
                  <div key={g.guildId} className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 px-0.5', i > 0 && 'border-t border-line/60')}>
                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 min-w-0">
                        <span className="text-sm font-bold text-text whitespace-nowrap">{g.name}</span>
                        <span className="pf-accent text-xs text-gold whitespace-nowrap">Lv.{g.level}</span>
                        <span className="inline-flex items-center gap-1 text-2xs text-text-dim whitespace-nowrap"
                              aria-label={`인원 ${g.members}명 / ${g.cap}명`}>
                          <PixelIcon glyph="people" size={11} />
                          <ProgressCount current={g.members} target={g.cap} tight className="text-2xs" />
                        </span>
                        <span className="inline-flex items-center gap-1 text-2xs text-text-dim whitespace-nowrap">
                          <PixelIcon glyph="clock" size={11} />
                          <span>{guildActivityText(g.lastActivityAt, nowMs)}</span>
                        </span>
                      </div>
                      <GuildPitch pitch={g.pitch} />
                    </div>
                    <Button size="sm" variant="primary" disabled={busy} className="min-w-[62px]" aria-label={`${g.name} 길드 가입`}
                            onClick={() => setJoinTarget(g)}>
                      가입
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Inset>
        </div>
      )}

      {tab === 'code' && (
        <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col gap-2.5')}>
          <form className="flex flex-col gap-1.5" onSubmit={onFind}>
            <Subheading className="mb-0 text-xs">초대 코드로 들어가기</Subheading>
            <div className="flex gap-2">
              <TextInput compact="sm" className="flex-1 min-w-0 w-full uppercase pf-accent tracking-widest" value={input} maxLength={16}
                         onChange={e => setInput(e.target.value)} aria-label="길드 코드" placeholder="길드 코드 8자리" />
              <Button type="submit" size="sm" disabled={busy} className={ACTION_WIDTH}>찾기</Button>
            </div>
          </form>
          <GuildInviteSummary preview={invite.preview} view={view} busy={busy} onConfirm={() => { void onJoin(); }} />
          {invite.loading && <Note>길드를 찾는 중이에요.</Note>}
          {invite.failed && <Note tone="warn">길드를 불러오지 못했어요. 찾기를 눌러 다시 시도해 주세요.</Note>}
          {codeError && <Note tone="warn">{codeError}</Note>}
        </div>
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
            <Button type="submit" size="sm" variant="primary" disabled={busy} className={ACTION_WIDTH}>만들기</Button>
          </form>
          {nameError && <Note tone="warn">{nameError}</Note>}
        </div>
      )}

      {confirmDialog && (dialogHost ? createPortal(confirmDialog, dialogHost) : confirmDialog)}
    </div>
  );
}
