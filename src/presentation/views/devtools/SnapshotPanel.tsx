import { useState } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { DevBountySnapshot } from '../../../game/rules/debug';
import type { DevSnapshotEntry } from '../../../features/devtools/model/snapshots';
import { useDevSnapshots } from '../../../features/devtools/service/useDevSnapshots';
import Button from '../../ui/Button';
import Inset from '../../ui/Inset';
import Note from '../../ui/Note';
import Panel from '../../ui/Panel';
import TextInput from '../../ui/TextInput';

// 원클릭 테스트 스냅샷 — 현재 상태(도감·가방·전시·토벌·수배 진행·도전권·업적 카운터)를 로컬에 백업하고,
// 테스트 뒤 snapshot.restore 명령으로 정규화 표까지 한 트랜잭션으로 복원한다.
export default function SnapshotPanel({ game, busy, onRestore, onSaved, onCaptureBounty }: {
  game: GameState;
  busy: boolean;
  onRestore: (entry: DevSnapshotEntry) => void;
  onSaved: (entry: DevSnapshotEntry) => void;
  onCaptureBounty?: () => Promise<DevBountySnapshot | undefined>;
}) {
  const { snapshots, save, attachBounty, remove } = useDevSnapshots();
  const [label, setLabel] = useState('');

  const handleSave = () => {
    const entry = save(game, label);
    setLabel('');
    onSaved(entry);
    if (onCaptureBounty) {
      void onCaptureBounty().then(bounty => {
        if (bounty) attachBounty(entry.id, bounty);
      }).catch(() => { /* 수배 DB 조회 실패 시 상태 스냅샷만 유지 */ });
    }
  };

  return (
    <Panel title="원클릭 테스트 스냅샷 (최대 5개)" className="gap-2">
      <Note size="2xs" className="my-0">
        테스트 전에 현재 계정을 백업해 두면, 복원 시 도감·가방·토벌 기록·업적 카운터까지 한 번에 되돌린다.
      </Note>
      <div className="flex items-center gap-2">
        <TextInput value={label}
                   placeholder="스냅샷 이름 (선택)"
                   aria-label="스냅샷 이름"
                   onChange={e => setLabel(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={handleSave}>현재 상태 저장</Button>
      </div>
      {snapshots.length === 0 ? (
        <Note size="xs" className="my-0">저장된 스냅샷이 없다.</Note>
      ) : (
        <div className="flex flex-col gap-1.5">
          {snapshots.map(entry => (
            <Inset key={entry.id} className="p-2 flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <b className="text-xs text-gold truncate">{entry.label}</b>
                <span className="text-2xs text-text-dim shrink-0">
                  {entry.savedAt.slice(5, 16).replace('T', ' ')}
                </span>
              </div>
              <span className="text-2xs text-text-dim">{entry.summary}</span>
              <div className="flex items-center gap-1.5 justify-end">
                <Button size="sm" disabled={busy} onClick={() => onRestore(entry)}>복원</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(entry.id)}>삭제</Button>
              </div>
            </Inset>
          ))}
        </div>
      )}
    </Panel>
  );
}
