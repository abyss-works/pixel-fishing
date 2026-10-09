// 수배판 — 현상금 수주·납품 UI (항구 전용, 고향 제외).
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 readBounty(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·수주권은 서버(DB)가 진실이다.
// 라이선스 취득 절차는 없다 — 조건 충족이면 본문이 바로 열린다. 미충족이면
// 본문을 흐리게 하고 조건 리스트를 덮는다.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { dailyQuestFor, zoneOfPort } from '../data/bounties.js';
import type { BountyDifficulty, BountyPort, BountyQuest } from '../data/bounties.js';
import { BOUNTY_DAILY_CAP, BOUNTY_PORT_DAILY_CAP } from '../game/balance.js';
import { REJECT_TEXT, licenseConditions } from '../game/logic.js';
import type { LicenseCondition } from '../game/logic.js';
import type { GameState } from '../game/logic.js';
import type { GameAction } from '../game/actions.js';
import { readBounty, kstDay } from '../api';
import type { BountySnapshot } from '../api';
import type { DispatchResult, MaybePromise } from '../api';
import { when } from '../api';
import BountyCard from './BountyCard';
import NamedCard from './NamedCard';
import Note from '../ui/Note';
import PixelIcon from '../ui/PixelIcon';
import SubTabs from '../ui/SubTabs';

type BoardScreen = 'quests' | 'named';

// 조건 게이트 — 미충족이면 본문을 흐리게 하고 조건 리스트를 덮는다.
// 버튼은 가려서 못 누른다 (우회는 서버 리듀서가 막는다).
function Gated({ open, conds, children }: {
  open: boolean; conds: LicenseCondition[]; children: ReactNode;
}) {
  if (open) return <>{children}</>;
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none" aria-hidden>{children}</div>
      <div className="absolute inset-0 flex items-center justify-center p-2">
        <div className="bg-surface border border-line rounded-sm p-2 text-sm">
          <ul>
            {conds.map(c => (
              <li key={c.key} className={c.ok ? 'line-through text-text-dim' : ''}>
                <PixelIcon glyph={c.ok ? 'checkOn' : 'checkOff'} size={11} /> {c.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function BountyPanel({ game, port, uid, dispatch, setToast }: {
  game: GameState;
  port: BountyPort;
  /** 표시 대상 — 일일 의뢰 해시에 쓴다. 없으면 로컬 고정값 (서버 검증은 uid 기준) */
  uid: string | null;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const zone = zoneOfPort(port)!;
  const [snap, setSnap] = useState<BountySnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<BoardScreen>('quests');
  const refresh = () => {
    let live = true;
    readBounty().then(s => { if (live) { setSnap(s); setLoaded(true); } });
    return () => { live = false; };
  };
  useEffect(refresh, []);
  const run = (action: GameAction, done: string) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') { setToast(done); refresh(); }
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  const leftAll = snap ? BOUNTY_DAILY_CAP - snap.acceptsToday : null;
  const leftPort = snap ? BOUNTY_PORT_DAILY_CAP - (snap.acceptsByPort[port] ?? 0) : null;
  const progressOf = (id: string) => snap?.progress.find(p => p.questId === id)?.progress ?? 0;
  const day = kstDay();
  const who = uid ?? 'local';
  const offered = (d: BountyDifficulty): BountyQuest | undefined =>
    dailyQuestFor(zone, d, who, day);
  const basicConds = licenseConditions(game, zone, 'basic');
  const namedConds = licenseConditions(game, zone, 'named');
  const basicOpen = basicConds.every(c => c.ok);
  const namedOpen = namedConds.every(c => c.ok);
  const canTake = snap !== null && (leftAll ?? 0) > 0 && (leftPort ?? 0) > 0;

  const gradeCard = (d: 'easy' | 'normal' | 'hard') => {
    const q = offered(d);
    if (!q) return null;
    const prog = progressOf(q.id);
    return (
      <BountyCard key={q.id} quest={q} progress={prog}
        canAccept={basicOpen && canTake} busy={busy}
        onAccept={() => run({ type: 'acceptQuest', questId: q.id, port },
          `의뢰를 수주했다 — ${q.id}.`)}
        onDeliver={() => run({ type: 'deliverBounty', questId: q.id },
          `납품 완료! ${q.reward}G를 받았다.`)} />
    );
  };

  const namedQuest = offered('named');

  return (
    <div className="flex flex-col gap-2">
      <SubTabs
        items={[
          { key: 'quests' as BoardScreen, label: '일반 의뢰' },
          { key: 'named' as BoardScreen, label: '네임드 의뢰' },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      <p className="text-text-dim text-xs">
        {leftAll === null ? '수주권 —' : `수주권 ${leftAll}/${BOUNTY_DAILY_CAP} · 이 항구 ${leftPort}/${BOUNTY_PORT_DAILY_CAP}`}
      </p>
      {loaded && snap === null && (
        <Note>오프라인에서는 수주·납품이 안 된다. 서버 연결이 필요하다.</Note>
      )}
      {screen === 'quests' ? (
        <div className="min-h-96">
        <Gated open={basicOpen} conds={basicConds}>
          <div className="grid grid-cols-3 gap-2 items-stretch">
            <div className="h-full">{gradeCard('easy')}</div>
            <div className="h-full">{gradeCard('normal')}</div>
            <div className="h-full">{gradeCard('hard')}</div>
          </div>
        </Gated>
        </div>
      ) : (
        <div className="min-h-96">
        <Gated open={namedOpen} conds={namedConds}>
          {namedQuest && (
            <NamedCard key={namedQuest.id} game={game} quest={namedQuest}
              canAccept={namedOpen && canTake} busy={busy}
              progress={progressOf(namedQuest.id)}
              onAccept={() => run(
                { type: 'acceptQuest', questId: namedQuest.id, port },
                `의뢰를 수주했다 — ${namedQuest.id}.`)}
              onDeliver={() => run(
                { type: 'deliverBounty', questId: namedQuest.id },
                `납품 완료! ${namedQuest.reward}G를 받았다.`)} />
          )}
        </Gated>
        </div>
      )}
    </div>
  );
}
