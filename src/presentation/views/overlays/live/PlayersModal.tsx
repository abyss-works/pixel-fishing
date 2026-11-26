import { useState } from 'react';
import { usePlayersIn } from '../../../../features/live/service/useLive';
import { cx } from '../../../ui/cx';
import EmptyState from '../../../ui/EmptyState';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import SlotCell from '../../../ui/SlotCell';
import Subheading from '../../../ui/Subheading';
import { SCROLL_Y } from '../../../ui/scrollArea';
import { PlayerInfo } from './PlayerInfo';

// 같은 바다 접속 목록 — PC 920px(xl) 고정 높이 창에 좌측 1열 목록과 우측 상세를 두고,
// 모바일 레이아웃에서는 상단 목록과 하단 상세로 쌓는다. 고른 사람이 바다를 떠나면 목록의 첫 사람을 보인다.
export default function PlayersModal({ region, account, accountFailed = false, setToast, onClose }: {
  region: string;
  account: string | null;
  accountFailed?: boolean;
  setToast: Notify;
  onClose: () => void;
}) {
  const players = usePlayersIn(region);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = players.find(p => p.uid === picked) ?? players[0];

  return (
    <Modal layer="stage" xl height={560} mobileFixed onClose={onClose}>
      <ModalCard title="이 바다의 플레이어" onClose={onClose} fixed>
        {selected ? (
          <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-3 flex-1 min-h-0 mobile:grid-cols-1 mobile:grid-rows-[auto_minmax(0,1fr)]">
            <Inset as="section" aria-label="접속자 목록" className="p-2 flex flex-col gap-1.5 min-h-0 mobile:max-h-[148px]">
              <Subheading className="flex justify-between text-xs mb-0 shrink-0">
                <span>접속 중</span>
                <span className="pf-accent text-accent">{players.length}명</span>
              </Subheading>
              <div className={`${SCROLL_Y} flex-1 min-h-0 flex flex-col gap-1`}>
                {players.map(p => {
                  const on = p.uid === selected.uid;
                  return (
                    <SlotCell
                      key={p.uid}
                      form={on ? 'pressed' : 'raised'}
                      ariaPressed={on}
                      onSelect={() => setPicked(p.uid)}
                      className="px-2 py-1.5 flex items-center justify-between gap-2 text-xs text-left min-w-0 shrink-0"
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="size-[7px] shrink-0 bg-accent" aria-hidden="true" />
                        <span className={cx('truncate', on ? 'text-gold font-bold' : 'text-text font-medium')}>{p.nick}</span>
                      </span>
                      {p.zoneLabel && <span className="text-2xs text-text-dim shrink-0">{p.zoneLabel}</span>}
                    </SlotCell>
                  );
                })}
              </div>
            </Inset>
            <PlayerInfo key={selected.uid} target={selected} self={false} account={account} accountFailed={accountFailed} setToast={setToast} />
          </div>
        ) : (
          <EmptyState className="flex-1" message="지금 이 바다에 다른 플레이어가 없어요." />
        )}
      </ModalCard>
    </Modal>
  );
}
