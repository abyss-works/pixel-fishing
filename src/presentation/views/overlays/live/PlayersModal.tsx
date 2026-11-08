import { useState } from 'react';
import { usePlayersIn } from '../../../../features/live/service/useLive';
import { cx } from '../../../ui/cx';
import Frame from '../../../ui/Frame';
import type { Notify } from '../../../ui/hud/messageFeed';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import { PlayerInfo } from './PlayerInfo';
import { SCROLL_Y_ROWS } from '../../../ui/scrollArea';

// 같은 바다 접속 목록. 680 폭에 탭이 없어 내용 높이를 따른다.
// 위는 이 바다에 있는 다른 플레이어의 이름 칸 격자(3열, 세 줄 높이, 넘치면 칸 안에서 굴린다), 아래는 고른 사람의 정보 세 칸이다.
// 목록에 있는 사람은 모두 접속 중이라 접속 표시를 따로 붙이지 않는다. 고른 사람이 바다를 떠나면 목록의 첫 사람을 보인다.
export default function PlayersModal({ region, account, setToast, onClose }: {
  region: string;
  account: string | null;
  setToast: Notify;
  onClose: () => void;
}) {
  const players = usePlayersIn(region);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = players.find(p => p.uid === picked) ?? players[0];

  return (
    <Modal layer="stage" md onClose={onClose}>
      <ModalCard title="이 바다의 플레이어" onClose={onClose}>
        {selected ? (
          <div className="flex flex-col gap-3">
            <section className="flex flex-col gap-1.5" aria-label="접속한 플레이어">
              <span className="flex justify-between text-xs text-text-dim">
                <span>접속한 플레이어</span><span className="pf-accent">{players.length}</span>
              </span>
              {/* 세 줄(32px 칸 셋, 사이 6px 둘)에 위 여백 4px을 더한 높이 */}
              <Inset className="flex flex-col p-2">
                <div className={`${SCROLL_Y_ROWS} h-[112px]`}>
                  <div className="grid grid-cols-3 gap-1.5 mobile:grid-cols-2">
                    {players.map(p => {
                      const on = p.uid === selected.uid;
                      return (
                        <Frame key={p.uid} as="button" type="button" aria-pressed={on} onClick={() => setPicked(p.uid)}
                               className={cx('h-8 px-2.5 flex items-center text-xs text-left bg-surface-2 cursor-pointer min-w-0',
                                 on && 'border-gold text-gold font-bold translate-y-px shadow-[inset_-2px_-2px_0_var(--bevel-lo),inset_2px_2px_0_var(--bevel-hi)]')}>
                          <span className="truncate">{p.nick}</span>
                        </Frame>
                      );
                    })}
                  </div>
                </div>
              </Inset>
            </section>
            <PlayerInfo key={selected.uid} target={selected} self={false} account={account} setToast={setToast} layout="grid" />
          </div>
        ) : (
          <Inset className="h-[120px] flex items-center justify-center">
            <Note>지금 이 바다에 다른 플레이어가 없어요.</Note>
          </Inset>
        )}
      </ModalCard>
    </Modal>
  );
}
