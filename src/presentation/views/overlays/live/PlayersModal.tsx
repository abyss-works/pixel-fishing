import { useState } from 'react';
import { usePlayersIn } from '../../../../features/live/service/useLive';
import type { Notify } from '../../../ui/hud/messageFeed';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import Note from '../../../ui/Note';
import Panel from '../../../ui/Panel';
import SelectList from '../../../ui/SelectList';
import { PlayerInfo } from './PlayerInfo';

// 같은 바다 접속 목록 — 왼쪽은 이 바다에 있는 다른 플레이어(이름 순), 오른쪽은 고른 플레이어의 정보다.
// 고른 사람이 바다를 떠나면 목록의 첫 사람을 보인다.
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
    <Modal layer="stage" xl onClose={onClose}>
      <ModalCard title={`이 바다의 플레이어 ${players.length}명`} onClose={onClose}>
        {selected ? (
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 max-[640px]:grid-cols-1">
            <div className="pf-scroll-panel h-72 overflow-y-auto pr-1 max-[640px]:h-40">
              <SelectList label="접속한 플레이어" items={players} keyOf={p => p.uid} selectedKey={selected.uid}
                          onSelect={setPicked} renderItem={(p, on) => <span className={on ? 'text-gold' : ''}>{p.nick}</span>} />
            </div>
            <Panel title={selected.nick} className="min-w-0">
              <PlayerInfo key={selected.uid} target={selected} self={false} account={account} setToast={setToast} />
            </Panel>
          </div>
        ) : (
          <Note>지금 이 바다에 다른 플레이어가 없어요.</Note>
        )}
      </ModalCard>
    </Modal>
  );
}
