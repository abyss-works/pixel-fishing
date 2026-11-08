// 수배판 — 바운티 헌팅의 수주·의뢰 완료·보상 UI (항구 전용, 마을의 집 제외).
// 네임드 도전은 여기서 치르지 않는다 — 바다 위 흔적 카드·조우 창이 맡고, 토벌 뒤 보상만 여기서 받는다.
// 상태 변경은 dispatch(서버 권위)만, 표시용 조회는 useBounty 경유(RLS 본인 읽기)다.
// 성공할 때마다 스냅샷을 다시 읽는다 — 진행도·오늘 남은 클리어는 서버(DB)가 진실이다.
// 라이선스 취득 절차는 없다 — 조건 충족이면 본문이 바로 열린다. 미충족이면
// 본문을 흐리게 하고 조건 리스트를 덮는다.
// 창은 탭이 있어 높이가 고정이다. 구역과 오늘 남은 클리어는 어느 탭에서나 의미가 있어 탭 위 고정 정보 줄에 두고,
// 초기화 시각과 클리어 기준은 그 줄의 툴팁이다. 수주를 막는 이유(오프라인, 한도 소진, 다른 구역 수주)는 수주 버튼의 툴팁이다.
import { useEffect, useState } from 'react';
import { useTutorialTrigger } from '../../../../features/tutorial/service/tutorial';
import { REJECT_TEXT } from '../../../../game/rules/logic.js';
import type { GameState } from '../../../../game/rules/logic.js';
import type { BountyKind, BountyPort } from '../../../../game/content/bounties.js';
import { zoneById } from '../../../../game/content/zones.js';
import type { GameAction } from '../../../../game/rules/actions.js';
import { gameDay } from '../../../../features/bounty/service/queryKeys';
import { questLabel, selectBountyPanelData } from '../../../../features/bounty/model/panel';
import { useBounty } from '../../../../features/bounty/service/useBounty';
import { useEncounterAlertSetting } from '../../../../features/bounty/service/encounterAlert';
import type { DispatchResult, MaybePromise } from '../../../../features/gameplay/service/types';
import { when } from '../../../../shared/lib/when';
import BountyCard from './BountyCard';
import { ClearsLeft } from './boardParts';
import NamedCard from './NamedCard';
import RelicCard from './RelicCard';
import CheckToggle from '../../../ui/CheckToggle';
import Gated from '../../../ui/Gated';
import Inset from '../../../ui/Inset';
import PixelIcon from '../../../ui/PixelIcon';
import TabBar from '../../../ui/TabBar';
import { fmtGold, josa } from '../../../ui/format';
import type { MessageTone, Notify } from '../../../ui/hud/messageFeed';
import { SCROLL_Y } from '../../../ui/scrollArea';

type BoardScreen = 'quests' | 'named' | 'relic';

/** 네임드 탭과 유물 탭의 카드 줄 - PC는 가로로 같은 폭, 모바일 레이아웃은 한 열로 쌓아 값 칸이 잘리지 않게 한다 */
const CARD_ROW = 'grid grid-flow-col auto-cols-fr gap-2 flex-1 min-h-0 mobile:grid-flow-row mobile:auto-cols-auto mobile:flex-none';

const OFFLINE_TEXT = '오프라인에서는 의뢰를 수주하거나 마칠 수 없어요.\n서버에 연결된 뒤 다시 해 주세요.';

/** 고정 정보 줄: 구역, 오늘 남은 클리어(일반 의뢰, 네임드 토벌). 스냅샷이 오기 전에는 값 자리에 -를 둔다 */
function BoardStatus({ zoneName, leftAll, leftNamed, dailyCap, namedDailyCap }: {
  zoneName: string; leftAll: number | null; leftNamed: number | null; dailyCap: number; namedDailyCap: number;
}) {
  return (
    <Inset className="flex items-center gap-3 h-10 px-3 shrink-0 text-xs">
      <b className="text-sm text-text">{zoneName}</b>
      <ClearsLeft leftAll={leftAll} leftNamed={leftNamed} dailyCap={dailyCap} namedDailyCap={namedDailyCap} />
    </Inset>
  );
}

/** 라이선스 미달 조건 목록 — 닫힌 게이트 위에 덮는다 */
function CondList({ conds }: { conds: ReturnType<typeof selectBountyPanelData>['basicConds'] }) {
  return (
    <ul>
      {conds.map(c => (
        <li key={c.key}>
          <PixelIcon glyph="checkOff" size={11} /> {c.label}
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
  // 튜토리얼 트리거 — 일반 의뢰·네임드 토벌 탭을 처음 열었을 때
  useTutorialTrigger('bounty-quests', screen === 'quests');
  useTutorialTrigger('bounty-named', screen === 'named');
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
    zone, leftAll, leftNamed, dailyCap, namedDailyCap, offers, progressOf, isAccepted, basicConds, namedConds,
    basicOpen, namedOpen, canTake, canTakeNamed, notice, namedOffers, relics,
  } = data;

  /** 수주를 막는 이유 — 오프라인이면 그것, 아니면 갈래의 한도 소진·다른 구역 수주 */
  const reasonOf = (kind: BountyKind): string | null =>
    loaded && snap === null ? OFFLINE_TEXT : notice[kind];

  const gradeCard = (d: 'easy' | 'normal' | 'hard') => {
    const q = offers[d];
    if (!q) return null;
    const prog = progressOf(q.id);
    return (
      <BountyCard key={q.id} quest={q} progress={prog} accepted={isAccepted(q.id)}
        canAccept={basicOpen && canTake} reason={reasonOf('general')} busy={busy}
        onAccept={() => run({ type: 'acceptQuest', questId: q.id, port },
          `${josa(questLabel(q), '을/를')} 수주했어요. 지금부터 잡는 물고기를 세요.`)}
        onDeliver={() => run({ type: 'deliverBounty', questId: q.id },
          `의뢰를 완료했어요! ${fmtGold(q.reward)}를 받았어요. 잡은 물고기는 가방에 그대로 있어요.`, 'gold')} />
    );
  };

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      <BoardStatus zoneName={zoneById(zone)?.shortName ?? zone} leftAll={leftAll} leftNamed={leftNamed}
                   dailyCap={dailyCap} namedDailyCap={namedDailyCap} />
      <TabBar
        tabs={[
          { key: 'quests' as BoardScreen, label: '일반 의뢰' },
          { key: 'named' as BoardScreen, label: '네임드 토벌' },
          { key: 'relic' as BoardScreen, label: '유물' },
        ]}
        activeKey={screen}
        onSelect={setScreen}
      />
      <div className={`flex flex-col gap-2 flex-1 min-h-0 ${SCROLL_Y}`}>
      {screen === 'quests' ? (
        <Gated open={basicOpen} overlay={<CondList conds={basicConds} />}>
          <div className="grid grid-cols-3 gap-2 items-stretch flex-1 min-h-0">
            {gradeCard('easy')}
            {gradeCard('normal')}
            {gradeCard('hard')}
          </div>
        </Gated>
      ) : screen === 'named' ? (
        <>
        <div className="flex-1 min-h-0 flex flex-col mobile:flex-none">
        <Gated open={namedOpen} overlay={<CondList conds={namedConds} />}>
          <div className={CARD_ROW}>
            {namedOffers.map(({ quest, reward, ticketMins, relic }) => (
              <NamedCard key={quest.id} game={game} quest={quest}
                canAccept={namedOpen && canTakeNamed} reason={reasonOf('named')} busy={busy}
                progress={progressOf(quest.id)} accepted={isAccepted(quest.id)}
                ticketMins={ticketMins}
                materialName={relic?.materialName ?? null}
                onAccept={() => run(
                  { type: 'acceptQuest', questId: quest.id, port },
                  `${josa(questLabel(quest), '을/를')} 수주했어요.`)}
                onDeliver={() => run(
                  { type: 'deliverBounty', questId: quest.id },
                  `토벌 보상으로 ${fmtGold(reward.value)}와 교환 재료를 받았어요!`, 'gold')} />
            ))}
          </div>
        </Gated>
        </div>
        {/* 조우는 방치 중에도 일어난다 — 다른 화면을 보고 있으면 시스템 알림으로 알린다.
            권한 요청은 이 클릭 안에서 해야 브라우저가 묻는다. 체크가 없을 때도 줄 높이를 비워 둔다 */}
        <div className="h-6 shrink-0 flex items-center">
          {namedOpen && alertSetting.permission !== 'unsupported' && (
            <CheckToggle label="조우하면 알림 받기"
              checked={alertSetting.active}
              onChange={on => {
                if (!on) { alertSetting.disable(); return; }
                void alertSetting.enable().then(ok => {
                  if (!ok) setToast('브라우저가 알림을 막았어요. 주소창의 사이트 설정에서 허용할 수 있어요.', 'warn');
                });
              }} />
          )}
        </div>
        </>
      ) : (
        <div className={CARD_ROW}>
          {relics.map(({ artifact, owned, level, mats }) => (
            <RelicCard key={artifact.id} artifact={artifact} owned={owned} level={level}
              materialCount={mats} busy={busy}
              onExchange={() => run(
                { type: 'exchangeArtifact', artifact: artifact.id },
                `${josa(artifact.name, '을/를')} 손에 넣었어요!`, 'gold')} />
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
