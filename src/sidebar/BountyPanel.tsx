// 수배판 — 현상금 라이선스·수주·납품 UI (항구 전용, 고향 제외).
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 readBounty(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·수주권은 서버(DB)가 진실이다.
import { useEffect, useState } from 'react';
import {
  BOUNTIES, BOUNTY_LICENSE_FAME, zoneOfPort,
} from '../data/bounties.js';
import type { BountyPort, BountyQuest } from '../data/bounties.js';
import { BOUNTY_DAILY_CAP, BOUNTY_PORT_DAILY_CAP } from '../game/balance.js';
import { RARITY } from '../data/rarity.js';
import { namedById } from '../data/named.js';
import { zoneById } from '../data/zones.js';
import { canAcceptBountyLicense, FISH, REJECT_TEXT } from '../game/logic.js';
import type { GameState } from '../game/logic.js';
import type { GameAction } from '../game/actions.js';
import { readBounty } from '../api';
import type { BountySnapshot } from '../api';
import type { DispatchResult, MaybePromise } from '../api';
import { when } from '../api';
import Button from '../ui/Button';
import Note from '../ui/Note';

const DIFF_NAME = { easy: '쉬움', normal: '보통', hard: '어려움', named: '네임드' } as const;

function questLabel(q: BountyQuest): string {
  if (q.difficulty === 'named') {
    const known = FISH.find(f => f.id === q.targetFish) ?? namedById(q.targetFish!);
    return `지명 수배 · ${known ? known.name : q.targetFish}`;
  }
  return `${RARITY[q.grade!].name} ${q.count}마리`;
}

export default function BountyPanel({ game, port, dispatch, setToast }: {
  game: GameState;
  port: BountyPort;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: (m: string) => void;
}) {
  const zone = zoneOfPort(port)!;
  const [snap, setSnap] = useState<BountySnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => {
    let live = true;
    readBounty().then(s => { if (live) setSnap(s); });
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

  const licensed = snap?.licensed.includes(zone) ?? false;
  const leftAll = snap ? BOUNTY_DAILY_CAP - snap.acceptsToday : null;
  const leftPort = snap ? BOUNTY_PORT_DAILY_CAP - (snap.acceptsByPort[port] ?? 0) : null;
  const progressOf = (id: string) => snap?.progress.find(p => p.questId === id)?.progress ?? 0;
  const quests = BOUNTIES.filter(q => q.zone === zone);
  const licCheck = canAcceptBountyLicense(game, zone);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-lg text-gold">수배판 · {zoneById(zone)!.shortName}</h3>
      <p className="text-text-dim text-xs">
        {leftAll === null ? '수주권 —' : `수주권 ${leftAll}/${BOUNTY_DAILY_CAP} · 이 항구 ${leftPort}/${BOUNTY_PORT_DAILY_CAP}`}
      </p>
      {snap === null && (
        <Note>오프라인에서는 라이선스만 받을 수 있다. 수주·납품은 서버 연결이 필요하다.</Note>
      )}
      {!licensed && (
        <Button size="sm" disabled={!licCheck.ok || busy}
          onClick={() => run({ type: 'acceptBountyLicense', zone }, '수배 라이선스를 받았다!')}>
          라이선스 받기 · 명성 {BOUNTY_LICENSE_FAME[zone]}
          {!licCheck.ok && licCheck.reason === 'not-enough-fame' ? ' (명성 부족)' : ''}
        </Button>
      )}
      {(Object.keys(DIFF_NAME) as (keyof typeof DIFF_NAME)[]).map(d => (
        <div key={d}>
          <h4 className="text-sm text-text-dim font-normal border-b border-line pb-1 mb-1">{DIFF_NAME[d]}</h4>
          <div className="flex flex-col gap-1">
            {quests.filter(q => q.difficulty === d).map(q => {
              const prog = progressOf(q.id);
              const done = prog >= q.count;
              const active = prog > 0;
              return (
                <div key={q.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    {questLabel(q)} <span className="pf-accent">{q.reward}G</span>
                    {active && <span className="text-text-dim text-xs"> ({prog}/{q.count})</span>}
                  </span>
                  {done ? (
                    <Button size="sm" disabled={busy}
                      onClick={() => run({ type: 'deliverBounty', questId: q.id },
                        `납품 완료! ${q.reward}G를 받았다.`)}>
                      납품하기
                    </Button>
                  ) : (
                    <Button size="sm" disabled={snap === null || !licensed || (leftAll ?? 0) <= 0 || (leftPort ?? 0) <= 0 || busy}
                      onClick={() => run({ type: 'acceptQuest', questId: q.id, port },
                        `의뢰를 수주했다 — ${questLabel(q)}.`)}>
                      수주 · {d === 'named' ? questLabel(q) : `${RARITY[q.grade!].name} ${q.count}마리`}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
