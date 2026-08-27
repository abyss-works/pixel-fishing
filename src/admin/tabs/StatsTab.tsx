import { useEffect, useState } from 'react';
import {
  BOATS, boatNameOf, REJECT_TEXT,
} from '../../game/logic';
import type { GameState } from '../../game/logic';
import type { GameAction } from '../../game/actions';
import type { DispatchResult, MaybePromise } from '../../backend/types';
import { when } from '../../backend/types';
import TextInput from '../../ui/TextInput';
import Button from '../../ui/Button';
import Note from '../../ui/Note';
import SectionTitle from '../../ui/SectionTitle';

// 스탯 탭 — adminSet(테스트용 직접 수정). 운영에선 소유자·로컬만 서버가 받는다
// (api/action.ts 관리자 액션 게이트) — UI는 조건 없이 렌더한다(게이트는 서버 책임).
export default function StatsTab({ game, dispatch }: {
  game: GameState;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
}) {
  const [editGold, setEditGold] = useState(String(game.gold));
  const [editFame, setEditFame] = useState(String(game.fame));
  const [editRod, setEditRod] = useState(String(game.rod));
  const [editBoat, setEditBoat] = useState(String(game.boat));
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setEditGold(String(game.gold));
    setEditFame(String(game.fame));
    setEditRod(String(game.rod));
    setEditBoat(String(game.boat));
  }, [game.gold, game.fame, game.rod, game.boat]);

  const apply = () => {
    const gold = Math.floor(Number(editGold));
    const fame = Math.floor(Number(editFame));
    const rod = Math.floor(Number(editRod));
    const boat = Math.floor(Number(editBoat));
    if ([gold, fame, rod, boat].some(n => !Number.isFinite(n))) {
      setMsg('숫자를 올바르게 입력하세요.');
      return;
    }
    when(dispatch({ type: 'adminSet', gold, fame, rod, boat }), r => {
      if (r.status === 'ok') setMsg('스탯을 적용했다.');
      else if (r.status === 'rejected') setMsg(REJECT_TEXT[r.error]);
    });
  };

  return (
    <div className="flex flex-col gap-4 max-w-[480px]">
      <SectionTitle>내 스탯 — 테스트용 (직접 수정)</SectionTitle>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">골드
          <TextInput type="number" value={editGold} onChange={e => setEditGold(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">명성
          <TextInput type="number" value={editFame} onChange={e => setEditFame(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">낚싯대 Lv
          <TextInput type="number" min={1} value={editRod} onChange={e => setEditRod(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">배 단계
          <select value={editBoat} onChange={e => setEditBoat(e.target.value)}
                  className="bg-bg border border-line rounded-sm text-text text-sm px-3 py-2 outline-none focus:border-accent">
            {BOATS.map(b => <option key={b.tier} value={b.tier}>{boatNameOf(b.tier)}</option>)}
          </select>
        </label>
      </div>
      <Button size="sm" onClick={apply}>스탯 적용</Button>
      {msg && <Note>{msg}</Note>}
      <Note>
        저장은 서버(또는 로컬 리듀서)에 즉시 반영된다 — 진행 세이브를 직접 고치는 행위라
        친구 계정에서는 절대 쓰지 않는다.
      </Note>
    </div>
  );
}
