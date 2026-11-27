import { useState } from 'react';
import { PLAYER_LIST_SORT_OPTIONS, selectPlayerList } from '../../../../features/live/model/live';
import type { PlayerListSort } from '../../../../features/live/model/live';
import { usePlayersIn } from '../../../../features/live/service/useLive';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import { fmtNum } from '../../../ui/format';
import type { Notify } from '../../../ui/hud/messageFeed';
import IconButton from '../../../ui/IconButton';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PersonSprite from '../../../ui/PersonSprite';
import PixelIcon from '../../../ui/PixelIcon';
import SlotCell from '../../../ui/SlotCell';
import Subheading from '../../../ui/Subheading';
import TextInput from '../../../ui/TextInput';
import ToggleChip from '../../../ui/ToggleChip';
import { SCROLL_Y } from '../../../ui/scrollArea';
import { PlayerInfo } from './PlayerInfo';

// 같은 바다 접속 목록 — PC 920px(xl) 고정 높이 창에 좌측 280px 목록(검색·2종 정렬·2행 카드)과 우측 상세를 두고,
// 모바일 레이아웃에서는 상단 목록과 하단 상세로 쌓는다. 고른 사람이 목록에서 빠지면 보이는 첫 사람을 따른다.
function boatTierToneClass(boat: number): string {
  if (boat < 1) return 'text-text-dim';
  if (boat >= 9) return 'text-gold';
  if (boat >= 7) return 'text-orange';
  if (boat >= 5) return 'text-text';
  if (boat >= 3) return 'text-accent';
  return 'text-common';
}

export default function PlayersModal({ region, account, accountFailed = false, setToast, onClose }: {
  region: string;
  account: string | null;
  accountFailed?: boolean;
  setToast: Notify;
  onClose: () => void;
}) {
  const players = usePlayersIn(region);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PlayerListSort>('fame');
  const [picked, setPicked] = useState<string | null>(null);

  const visiblePlayers = selectPlayerList(players, { query, sort });
  const selected = visiblePlayers.find(p => p.uid === picked)
    ?? visiblePlayers[0]
    ?? players.find(p => p.uid === picked)
    ?? players[0];

  return (
    <Modal layer="stage" xl height={560} mobileFixed onClose={onClose}>
      <ModalCard title="이 바다의 플레이어" onClose={onClose} fixed>
        {selected ? (
          <div className="grid grid-cols-[280px_minmax(0,1fr)] gap-3 flex-1 min-h-0 mobile:grid-cols-1 mobile:grid-rows-[auto_minmax(0,1fr)] mobile:gap-2">
            <Inset as="section" aria-label="접속자 목록" className="p-2 flex flex-col gap-1.5 min-h-0 mobile:max-h-[196px]">
              <Subheading className="flex items-center justify-between text-xs mb-0 shrink-0">
                <span>접속 중</span>
                <span className="pf-accent text-accent">{visiblePlayers.length}명</span>
              </Subheading>

              <div className="relative shrink-0 flex items-center">
                <TextInput
                  compact
                  value={query}
                  maxLength={24}
                  onChange={e => setQuery(e.target.value)}
                  aria-label="닉네임 검색"
                  placeholder="닉네임 검색"
                  className="w-full px-2 py-1 pr-7"
                />
                {query.trim() !== '' && (
                  <IconButton
                    type="button"
                    glyph="close"
                    size={10}
                    tone="dim"
                    aria-label="검색어 지우기"
                    onClick={() => setQuery('')}
                    className="absolute right-1 size-6 justify-center"
                  />
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0" role="group" aria-label="목록 정렬">
                {PLAYER_LIST_SORT_OPTIONS.map(opt => {
                  const active = sort === opt.value;
                  return (
                    <ToggleChip
                      key={opt.value}
                      size="sm"
                      pressed={active}
                      emphasis={active}
                      onClick={() => setSort(opt.value)}
                    >
                      {opt.label}
                    </ToggleChip>
                  );
                })}
              </div>

              {visiblePlayers.length > 0 ? (
                <div className={cx(SCROLL_Y, 'flex-1 min-h-0 flex flex-col gap-1.5')}>
                  {visiblePlayers.map(p => {
                    const on = p.uid === selected.uid;
                    return (
                      <SlotCell
                        key={p.uid}
                        form={on ? 'pressed' : 'raised'}
                        ariaPressed={on}
                        onSelect={() => setPicked(p.uid)}
                        className="p-1.5 grid grid-cols-[36px_minmax(0,1fr)] items-center gap-2 text-left min-w-0 shrink-0"
                      >
                        <span
                          className={cx(
                            'w-9 h-[46px] bg-(--inset-light) border flex items-center justify-center shrink-0 overflow-hidden',
                            on ? 'border-gold' : 'border-line-dim',
                          )}
                        >
                          <PersonSprite look={p.look} scale={2} />
                        </span>
                        <span className="flex flex-col gap-1 min-w-0">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span className="size-[7px] shrink-0 bg-accent" aria-hidden="true" />
                            <span className={cx('truncate text-xs', on ? 'text-gold font-bold' : 'text-text font-medium')}>
                              {p.nick}
                            </span>
                          </span>
                          <span className="flex items-center justify-between gap-2 min-w-0">
                            <span
                              className={cx(
                                'pf-accent text-2xs px-1 py-px bg-bg border border-current leading-none shrink-0',
                                boatTierToneClass(p.boat),
                              )}
                            >
                              {p.boatTierLabel}
                            </span>
                            <span
                              className="inline-flex items-center gap-1 shrink-0 text-gold"
                              aria-label={`명성 ${fmtNum(p.fame)}`}
                            >
                              <PixelIcon glyph="star" size={11} className="shrink-0" />
                              <span className="pf-accent text-2xs tabular-nums leading-none">{fmtNum(p.fame)}</span>
                            </span>
                          </span>
                        </span>
                      </SlotCell>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  className="flex-1 p-2.5 gap-1.5"
                  message="검색과 일치하는 플레이어가 없어요."
                  action={<Button size="sm" onClick={() => setQuery('')}>검색 초기화</Button>}
                />
              )}
            </Inset>
            <PlayerInfo key={selected.uid} target={selected} self={false} account={account} accountFailed={accountFailed} setToast={setToast} />
          </div>
        ) : (
          <EmptyState
            className="flex-1"
            glyph="people"
            message={(
              <div className="flex flex-col gap-1">
                <b className="text-text text-sm">지금 이 바다에 다른 플레이어가 없어요.</b>
                <span>같은 바다에 다른 낚시꾼이 들어오면 이곳에 외형과 배 단계가 함께 보여요.</span>
              </div>
            )}
          />
        )}
      </ModalCard>
    </Modal>
  );
}
