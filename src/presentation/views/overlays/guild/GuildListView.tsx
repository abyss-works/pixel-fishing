import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  PUBLIC_GUILD_SORT_OPTIONS, guildActivityText, publicGuildRowState, publicJoinConfirm,
} from '../../../../features/guild/model/guild';
import type { GuildMyRequest, PublicGuildItem, PublicGuildSort } from '../../../../features/guild/model/guild';
import { sendNotice } from '../../../../features/display/model/toastPolicy';
import { usePublicGuilds } from '../../../../features/guild/service/usePublicGuilds';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import ConfirmDialog from '../../../ui/ConfirmDialog';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import type { Notify } from '../../../ui/hud/messageFeed';
import IconButton from '../../../ui/IconButton';
import Inset from '../../../ui/Inset';
import KeyValueRow from '../../../ui/KeyValueRow';
import PixelIcon from '../../../ui/PixelIcon';
import ProgressCount from '../../../ui/ProgressCount';
import Skeleton from '../../../ui/Skeleton';
import TextInput from '../../../ui/TextInput';
import Tip from '../../../ui/Tip';
import ToggleChip from '../../../ui/ToggleChip';
import { SCROLL_Y } from '../../../ui/scrollArea';

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

export interface GuildListViewProps {
  /** 내가 속한 길드 id — 있으면 소속 중 표시와 다른 길드 가입 비활성 툴팁을 보인다 */
  myGuildId?: string | null;
  busy?: boolean;
  cooldownTooltip?: string | null;
  request?: GuildMyRequest | null;
  dialogHost?: HTMLElement | null;
  setToast?: Notify;
  onJoinPublic?: (guildId: string) => Promise<{ error: string | null; requested: boolean }>;
  /** 비소속 화면 상단에 붙이는 인라인 초대 코드 바 슬롯 */
  topSlot?: ReactNode;
  emptyAction?: ReactNode;
}

/** 전체 길드 목록 — 길드 소속 여부와 무관하게 검색·정렬·가입 가능 여부를 보여 준다 */
export default function GuildListView({
  myGuildId = null,
  busy = false,
  cooldownTooltip = null,
  request = null,
  dialogHost,
  setToast,
  onJoinPublic,
  topSlot,
  emptyAction,
}: GuildListViewProps) {
  const nowISO = useNow();
  const nowMs = Date.parse(nowISO);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<PublicGuildSort>('activity');
  const [joinTarget, setJoinTarget] = useState<PublicGuildItem | null>(null);

  const updateSearch = (next: string) => {
    setSearch(next);
    if (next.trim() === '') setDebouncedSearch('');
  };

  useEffect(() => {
    if (search.trim() === '') return;
    const timer = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const publicGuilds = usePublicGuilds(debouncedSearch, sort, true);

  const confirmPublicJoin = async () => {
    if (!joinTarget || !onJoinPublic) return;
    const target = joinTarget;
    setJoinTarget(null);
    const { error, requested } = await onJoinPublic(target.guildId);
    if (error) {
      if (setToast) sendNotice(setToast, { kind: 'system.modalRejected', text: error });
      void publicGuilds.refresh();
    } else if (setToast) {
      sendNotice(setToast, {
        kind: 'guild.modalAction',
        text: requested
          ? `${target.name} 길드에 가입 신청을 보냈어요. 길드장이 승인하면 들어가요.`
          : `${target.name} 길드에 들어갔어요.`,
        toastText: requested ? '길드 가입 신청 전송!' : '길드에 들어갔어요!',
      });
    }
  };

  const confirmData = joinTarget && !myGuildId ? publicJoinConfirm(joinTarget, request) : null;
  const confirmDialog = confirmData && (
    <ConfirmDialog
      layer="stage"
      title={confirmData.title}
      confirmLabel={confirmData.label}
      onCancel={() => setJoinTarget(null)}
      onConfirm={() => { void confirmPublicJoin(); }}
    >
      <p className="m-0 text-sm">
        <b>{confirmData.guild.name}</b>{' '}
        {confirmData.mode === 'approval' ? '길드에 가입을 신청할까요?' : '길드에 바로 들어갈까요?'}
      </p>
      <Inset className="mt-2.5 px-3 py-2 flex flex-col gap-1 text-sm">
        <ul className="m-0 p-0 list-none flex flex-col">
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="길드" value={confirmData.guild.name} valueClassName="font-bold" />
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="레벨" value={`Lv.${confirmData.guild.level}`} valueClassName="pf-accent text-gold" />
          <KeyValueRow as="li" compact className="h-auto py-0.5 text-sm border-t-0" label="인원" value={`${confirmData.guild.members}/${confirmData.guild.cap}`} valueClassName="pf-accent" />
        </ul>
        <p className="m-0 pt-1.5 border-t border-line/60 text-xs text-text-dim">"{confirmData.guild.pitch}"</p>
      </Inset>
      {confirmData.pendingCancelWarn && confirmData.pendingWarnTitle && (
        <Inset tone="deep" border="danger" className="mt-2.5 p-2.5 flex flex-col gap-0.5 text-2xs text-text-dim">
          <strong className="text-danger">{confirmData.pendingWarnTitle}</strong>
          <span>{confirmData.pendingCancelWarn}</span>
        </Inset>
      )}
    </ConfirmDialog>
  );

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {topSlot}

      <div className="flex flex-col gap-1.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1 min-w-0 flex items-center">
            <TextInput
              compact="sm"
              value={search}
              maxLength={20}
              onChange={e => updateSearch(e.target.value)}
              aria-label="길드명 검색"
              placeholder="길드명 검색"
              className="w-full min-w-0 pr-8"
            />
            {search.trim() !== '' && (
              <IconButton
                type="button"
                glyph="close"
                size={10}
                tone="dim"
                aria-label="검색어 지우기"
                onClick={() => updateSearch('')}
                className="absolute right-1.5 size-6 justify-center"
              />
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
              <ToggleChip
                key={opt.value}
                variant="choice"
                size="sm"
                pressed={sort === opt.value}
                emphasis={sort === opt.value}
                onClick={() => setSort(opt.value)}
              >
                {opt.label}
              </ToggleChip>
            ))}
          </div>
          <span className="text-2xs text-text-dim whitespace-nowrap">
            {publicGuilds.loading ? '불러오는 중'
              : publicGuilds.failed ? ''
                : <>전체 <b className="pf-accent font-normal text-gold">{publicGuilds.guilds.length}</b>개</>}
          </span>
        </div>
      </div>

      <Inset as="section" aria-label="길드 목록" className="flex-1 min-h-0 flex flex-col px-2.5 py-1">
        {publicGuilds.loading ? (
          <div className="flex flex-col" role="status" aria-label="길드 목록을 불러오는 중이에요">
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
          <EmptyState
            framed={false}
            iconTone="danger"
            className="flex-1"
            glyph="warn"
            message={(
              <div className="flex flex-col gap-1">
                <b className="text-text text-sm">길드 목록을 불러오지 못했어요.</b>
                <span>네트워크 연결을 확인한 뒤 다시 시도해 주세요.</span>
              </div>
            )}
            action={<Button size="sm" onClick={() => { void publicGuilds.refresh(); }}>다시 시도</Button>}
          />
        ) : publicGuilds.guilds.length === 0 ? (
          search.trim() !== '' ? (
            <EmptyState
              framed={false}
              className="flex-1"
              glyph="compass"
              message={(
                <div className="flex flex-col gap-1">
                  <b className="text-text text-sm">검색어와 맞는 길드가 없어요.</b>
                  <span>다른 길드 이름으로 검색하거나 검색어를 지워 전체 목록을 확인해 보세요.</span>
                </div>
              )}
              action={<Button size="sm" onClick={() => updateSearch('')}>검색 초기화</Button>}
            />
          ) : (
            <EmptyState
              framed={false}
              className="flex-1"
              glyph="compass"
              message={(
                <div className="flex flex-col gap-1">
                  <b className="text-text text-sm">아직 등록된 길드가 없어요.</b>
                  <span>새 길드를 직접 만들거나 초대 코드를 입력해 들어갈 수 있어요.</span>
                </div>
              )}
              action={emptyAction}
            />
          )
        ) : (
          <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col')}>
            {publicGuilds.guilds.map((g, i) => {
              const row = publicGuildRowState(g, { myGuildId, cooldownTooltip });
              const action = row.action;
              const button = action && (
                <Button
                  size="sm"
                  variant={action.primary ? 'primary' : 'default'}
                  disabled={busy || action.disabled}
                  className="min-w-[62px]"
                  aria-label={`${g.name} 길드 ${action.label}`}
                  onClick={() => {
                    if (!action.disabled) setJoinTarget(g);
                  }}
                >
                  {action.label}
                </Button>
              );

              return (
                <div key={g.guildId} className={cx('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 py-2.5 px-0.5', i > 0 && 'border-t border-line/60')}>
                  <div className="flex flex-col gap-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                      <span className="text-sm font-bold text-text whitespace-nowrap">{g.name}</span>
                      <span className="pf-accent text-xs text-gold whitespace-nowrap">Lv.{g.level}</span>
                      <Badge tone={row.badge.tone} size="2xs">{row.badge.label}</Badge>
                      <span
                        className="inline-flex items-center gap-1 text-2xs text-text-dim whitespace-nowrap"
                        aria-label={`인원 ${g.members}명 / ${g.cap}명`}
                      >
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

                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {row.isOwnGuild ? (
                      <Badge tone="gold" size="xs">내 길드</Badge>
                    ) : action ? (
                      <>
                        {action.tooltip ? <Tip wraps text={action.tooltip}>{button}</Tip> : button}
                        {action.reason && (
                          <span className={cx('text-2xs whitespace-nowrap', action.reasonDanger ? 'text-danger' : 'text-text-dim')}>
                            {action.reason}
                          </span>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Inset>

      {confirmDialog && (dialogHost ? createPortal(confirmDialog, dialogHost) : confirmDialog)}
    </div>
  );
}
