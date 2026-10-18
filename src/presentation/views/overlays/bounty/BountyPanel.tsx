// 수배판 — 바운티 헌팅의 수주·납품·보상 UI (항구 전용, 마을의 집 제외).
// 네임드 도전은 여기서 치르지 않는다 — 바다 위 흔적 카드·조우 창이 맡고, 토벌 뒤 보상만 여기서 받는다.
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 useBounty 경유(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·오늘 남은 클리어는 서버(DB)가 진실이다.
// 라이선스 취득 절차는 없다 — 조건 충족이면 본문이 바로 열린다. 미충족이면
// 본문을 흐리게 하고 조건 리스트를 덮는다.
import { useEffect, useState } from 'react';
import { REJECT_TEXT } from '../../../../game/rules/logic.js';
import type { GameState } from '../../../../game/rules/logic.js';
import type { BountyPort } from '../../../../game/content/bounties.js';
import type { GameAction } from '../../../../game/rules/actions.js';
import { gameDay } from '../../../../features/bounty/service/queryKeys';
import { questLabel, selectBountyPanelData } from '../../../../features/bounty/model/panel';
import { useBounty } from '../../../../features/bounty/service/useBounty';
import { useEncounterAlertSetting } from '../../../../features/bounty/service/encounterAlert';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { when } from '../../../../shared/lib/when';
import BountyCard from './BountyCard';
import NamedCard from './NamedCard';
import RelicCard from './RelicCard';
import CheckToggle from '../../../ui/CheckToggle';
import Gated from '../../../ui/Gated';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import TabBar from '../../../ui/TabBar';
import { fmtGold, josa } from '../../../ui/format';
import type { MessageTone, Notify } from '../../../ui/hud/messageFeed';

type BoardScreen = 'quests' | 'named' | 'relic';

/** 라이선스 조건 목록 — 닫힌 게이트 위에 덮는다. 충족한 조건은 줄을 긋는다 */
function CondList({ conds }: { conds: ReturnType<typeof selectBountyPanelData>['basicConds'] }) {
  return (
    <ul>
      {conds.map(c => (
        <li key={c.key} className={c.ok ? 'line-through text-text-dim' : ''}>
          <PixelIcon glyph={c.ok ? 'checkOn' : 'checkOff'} size={11} /> {c.label}
        </li>
      ))}
    </ul>
  );
}

export default function BountyPanel({ game, port, uid, dispatch, setToast }: {
  game: GameState;
  port: BountyPort;
  /** 표시 대상 — 일일 의뢰 해시에 쓴다. 없으면 로컬 고정값 (서버 검증은 uid 기준) */
  uid: string | null;
  dispatch: (a: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
}) {
  const { snap, loaded, refresh } = useBounty();
  const alertSetting = useEncounterAlertSetting();
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<BoardScreen>('quests');
  // 도전권 잔여 표시용 시계 — 스냅샷 적재 시점에 함께 찍는다 (액션마다 refresh되므로 충분).
  // 렌더 중 Date.now 호출은 금지라 비동기 콜백에서만 찍는다.
  const [nowMs, setNowMs] = useState(0);
  useEffect(() => { if (loaded) setNowMs(Date.now()); }, [loaded, snap]);
  const run = (action: GameAction, done: string, tone: MessageTone = 'info') => {
    if (busy) return;
    setBusy(true);
    when(dispatch(action), r => {
      setBusy(false);
      if (r.status === 'ok') { setToast(done, tone); refresh(); }
      else if (r.status === 'rejected') setToast(REJECT_TEXT[r.error], 'warn');
    });
  };

  const day = gameDay();
  const data = selectBountyPanelData({ game, port, uid, day, nowMs, snapshot: snap });
  const {
    leftAll, leftNamed, dailyCap, namedDailyCap, offers, progressOf, isAccepted, basicConds, namedConds,
    basicOpen, namedOpen, canTake, canTakeNamed, notice, ticketMins, hasTicket,
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
          `${josa(questLabel(q), '을/를')} 수주했어요.`)}
        onDeliver={() => run({ type: 'deliverBounty', questId: q.id },
          `납품 완료! ${fmtGold(q.reward)}를 받았어요.`, 'gold')} />
    );
  };

  const namedQuest = offers.named;

  return (
    <div className="flex flex-col gap-2">
      <TabBar
        tabs={[
          { key: 'quests' as BoardScreen, label: '일반 의뢰' },
          { key: 'named' as BoardScreen, label: '네임드 토벌' },
          { key: 'relic' as BoardScreen, label: '유물' },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      <p className="text-text-dim text-xs">
        {leftAll === null ? '오늘 남은 클리어 —' : `오늘 남은 클리어 일반 ${leftAll}/${dailyCap} · 네임드 ${leftNamed}/${namedDailyCap}`}
      </p>
      <p className="text-text-dim text-xs">조건을 채우지 못한 의뢰는 새벽 4시에 사라져요.</p>
      {loaded && snap === null && (
        <Note>오프라인에서는 의뢰를 수주하거나 마칠 수 없어요. 서버에 연결된 뒤 다시 해 주세요.</Note>
      )}
      {screen === 'quests' && notice.general && <Note size="xs" className="my-0">{notice.general}</Note>}
      {screen === 'named' && notice.named && <Note size="xs" className="my-0">{notice.named}</Note>}
      {screen === 'quests' ? (
        <div className="min-h-[26rem]">
        <Gated open={basicOpen} overlay={<CondList conds={basicConds} />}>
          <div className="grid grid-cols-3 gap-2 items-stretch">
            <div className="h-full">{gradeCard('easy')}</div>
            <div className="h-full">{gradeCard('normal')}</div>
            <div className="h-full">{gradeCard('hard')}</div>
          </div>
        </Gated>
        </div>
      ) : screen === 'named' ? (
        <div className="min-h-[26rem]">
        <Gated open={namedOpen} overlay={<CondList conds={namedConds} />}>
          {namedQuest && (
            <NamedCard key={namedQuest.id} game={game} quest={namedQuest}
              canAccept={namedOpen && canTakeNamed} busy={busy}
              progress={progressOf(namedQuest.id)} accepted={isAccepted(namedQuest.id)}
              ticketMins={hasTicket ? ticketMins : null}
              onAccept={() => run(
                { type: 'acceptQuest', questId: namedQuest.id, port },
                `${josa(questLabel(namedQuest), '을/를')} 수주했어요.`)}
              onDeliver={() => run(
                { type: 'deliverBounty', questId: namedQuest.id },
                `토벌 보상으로 ${fmtGold(namedQuest.reward)}와 교환 재료를 받았어요!`, 'gold')} />
          )}
        </Gated>
        {/* 조우는 방치 중에도 일어난다 — 다른 화면을 보고 있으면 시스템 알림으로 알린다.
            권한 요청은 이 클릭 안에서 해야 브라우저가 묻는다 */}
        {namedOpen && alertSetting.permission !== 'unsupported' && (
          <CheckToggle className="mt-2" label="조우하면 알림 받기"
            checked={alertSetting.active}
            onChange={on => {
              if (!on) { alertSetting.disable(); return; }
              void alertSetting.enable().then(ok => {
                if (!ok) setToast('브라우저가 알림을 막았어요. 주소창의 사이트 설정에서 허용할 수 있어요.', 'warn');
              });
            }} />
        )}
        </div>
      ) : (
        <div className="min-h-[26rem]">
          {relic && (
            <RelicCard key={relic.id} artifact={relic} owned={relicOwned}
              materialCount={relicMats} busy={busy}
              onExchange={() => run(
                { type: 'exchangeArtifact', artifact: relic.id },
                `${josa(relic.name, '을/를')} 손에 넣었어요!`, 'gold')} />
          )}
        </div>
      )}
    </div>
  );
}
