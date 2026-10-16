// 수배판 — 바운티 헌팅의 수주·납품·보상 UI (항구 전용, 마을의 집 제외).
// 네임드 도전은 여기서 치르지 않는다 — 바다 위 흔적 카드·조우 창이 맡고, 토벌 뒤 보상만 여기서 받는다.
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 useBounty 경유(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·수주권은 서버(DB)가 진실이다.
// 라이선스 취득 절차는 없다 — 조건 충족이면 본문이 바로 열린다. 미충족이면
// 본문을 흐리게 하고 조건 리스트를 덮는다.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic.js';
import type { GameState } from '../../../../game/rules/logic.js';
import type { BountyPort } from '../../../../game/content/bounties.js';
import type { GameAction } from '../../../../game/rules/actions.js';
import { kstDay } from '../../../../features/bounty/service/queryKeys';
import { questLabel, selectBountyPanelData } from '../../../../features/bounty/model/panel';
import { useBounty } from '../../../../features/bounty/service/useBounty';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { when } from '../../../../shared/lib/when';
import BountyCard from './BountyCard';
import NamedCard from './NamedCard';
import RelicCard from './RelicCard';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import SubTabs from '../../../ui/SubTabs';

type BoardScreen = 'quests' | 'named' | 'relic';

// 조건 게이트 — 미충족이면 본문을 흐리게 하고 조건 리스트를 덮는다.
// 버튼은 가려서 못 누른다 (우회는 서버 리듀서가 막는다).
function Gated({ open, conds, children }: {
  open: boolean; conds: ReturnType<typeof selectBountyPanelData>['basicConds']; children: ReactNode;
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
  const { snap, loaded, refresh } = useBounty();
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<BoardScreen>('quests');
  // 도전권 잔여 표시용 시계 — 스냅샷 적재 시점에 함께 찍는다 (액션마다 refresh되므로 충분).
  // 렌더 중 Date.now 호출은 금지라 비동기 콜백에서만 찍는다.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { if (loaded) setNowMs(Date.now()); }, [loaded, snap]);
  const run = (action: GameAction, done: string) => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') { setToast(done); refresh(); }
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error]);
    });
  };

  const day = kstDay();
  const data = selectBountyPanelData({ game, port, uid, day, nowMs, snapshot: snap });
  const {
    leftAll, leftNamed, dailyCap, namedDailyCap, offers, progressOf, isAccepted, basicConds, namedConds,
    basicOpen, namedOpen, canTake, canTakeNamed, ticketMins, hasTicket,
    relic, relicOwned, relicMats,
  } = data;

  const gradeCard = (d: 'easy' | 'normal' | 'hard') => {
    const q = offers[d];
    if (!q) return null;
    const prog = progressOf(q.id);
    return (
      <BountyCard key={q.id} quest={q} progress={prog} accepted={isAccepted(q.id)}
        canAccept={basicOpen && canTake} busy={busy}
        onAccept={() => run({ type: 'acceptQuest', questId: q.id, port },
          `${questLabel(q)}를 수주했다.`)}
        onDeliver={() => run({ type: 'deliverBounty', questId: q.id },
          `납품 완료! ${q.reward}G를 받았다.`)} />
    );
  };

  const namedQuest = offers.named;

  return (
    <div className="flex flex-col gap-2">
      <SubTabs
        items={[
          { key: 'quests' as BoardScreen, label: '일반 의뢰' },
          { key: 'named' as BoardScreen, label: '네임드 토벌' },
          { key: 'relic' as BoardScreen, label: '유물' },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      <p className="text-text-dim text-xs">
        {leftAll === null ? '수주권 —' : `수주권 ${leftAll}/${dailyCap} · 네임드 ${leftNamed}/${namedDailyCap}`}
      </p>
      {loaded && snap === null && (
        <Note>오프라인에서는 의뢰를 수주하거나 마칠 수 없다. 서버 연결이 필요하다.</Note>
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
      ) : screen === 'named' ? (
        <div className="min-h-96">
        <Gated open={namedOpen} conds={namedConds}>
          {namedQuest && (
            <NamedCard key={namedQuest.id} game={game} quest={namedQuest}
              canAccept={namedOpen && canTakeNamed} busy={busy}
              progress={progressOf(namedQuest.id)} accepted={isAccepted(namedQuest.id)}
              ticketMins={hasTicket ? ticketMins : null}
              onAccept={() => run(
                { type: 'acceptQuest', questId: namedQuest.id, port },
                `${questLabel(namedQuest)}를 수주했다.`)}
              onDeliver={() => run(
                { type: 'deliverBounty', questId: namedQuest.id },
                `토벌 보상 — ${namedQuest.reward}G와 교환 재료를 받았다.`)} />
          )}
        </Gated>
        </div>
      ) : (
        <div className="min-h-96">
          {relic && (
            <RelicCard key={relic.id} artifact={relic} owned={relicOwned}
              materialCount={relicMats} busy={busy}
              onExchange={() => run(
                { type: 'exchangeArtifact', artifact: relic.id },
                `유물을 손에 넣었다 — ${relic.name}.`)} />
          )}
        </div>
      )}
    </div>
  );
}
