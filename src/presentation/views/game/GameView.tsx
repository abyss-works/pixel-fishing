import { useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import { REJECT_TEXT } from '../../../game/rules/logic';
import type { RejectReason } from '../../../game/rules/rules';
import { when } from '../../../shared/lib/when';
import { selectEncounter } from '../../../features/bounty/model/challenge';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import { BASE_PACKS, REGION_PACKS } from '../../../game/world';
import type { FurnitureId, Point, SceneRef } from '../../../game/world';
import type { RegionId } from '../../../game/content/places';
import { zoneById } from '../../../game/content/zones';
import type { Msg } from '../../layouts/hud/useMessageLog';
import type { Notify } from '../../ui/hud/messageFeed';
import GameStageLayout from '../../layouts/game-stage/GameStageLayout';
import Field from '../../layouts/game-stage/Field';
import HudLayout from '../../layouts/hud/HudLayout';
import BaseMenu from './base-menu/BaseMenu';
import GameTabs from './tabs/GameTabs';
import { DEFAULT_TAB } from './tabs/tabs';
import type { TabKey } from './tabs/tabs';
import FacilityModal from '../overlays/facility/FacilityModal';
import type { ActionPanel } from '../overlays/facility/FacilityModal';
import StatsModal from '../overlays/stats/StatsModal';
import { useDialogs } from '../../ui/useDialogs';
import RankingModal from '../overlays/ranking/RankingModal';
import MailboxButton from '../overlays/mailbox/MailboxButton';
import MailboxModal from '../overlays/mailbox/MailboxModal';
import WorldMapModal from '../overlays/world-map/WorldMapModal';
import UpdateModal from '../overlays/update/UpdateModal';
import WhatsNewModal from '../overlays/whats-new/WhatsNewModal';
import TraceCard from '../overlays/bounty/TraceCard';
import EncounterModal from '../overlays/bounty/EncounterModal';
import type { EncounterResult } from '../overlays/bounty/EncounterModal';
import { josa } from '../../ui/format';
import { useCanvasCover } from '../../layouts/game-stage/canvasCover';

interface GameViewProps {
  game: GameState;
  scene: SceneRef;
  entryPos: Point | null;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onScene: (scene: SceneRef, message: string, entryPos?: Point) => void;
  onWarmup: () => void;
  log: Msg[];
  syncLabel: string | null;
  syncState: string;
  account: string | null;
  uid: string | null;
  nickname: string | null;
  onRename: (name: string) => Promise<null | RejectReason>;
  onAuthChanged: () => Promise<void>;
  outdated: boolean;
  /** 스테이지 아래 가운데에 놓을 환경 배지 — 앱 최상위가 개발 환경과 함께 공급한다 */
  badge?: ReactNode;
}

export default function GameView(props: GameViewProps) {
  const { game, scene } = props;
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  /** 추적 중인 네임드 의뢰 — 흔적 카드의 추적 버튼이 열고, 토벌·돌아가기·닫기가 닫는다 */
  const [tracking, setTracking] = useState<string | null>(null);
  const covered = useCanvasCover();
  const atSea = scene.kind === 'region' && scene.id !== 'village';
  const encounter = tracking ? selectEncounter(game, tracking) : null;
  const worldScene = scene.kind === 'region' && scene.id === 'world';
  const region: RegionId = scene.kind === 'region' ? scene.id : BASE_PACKS[scene.id].region;

  const go = (nextScene: SceneRef, message: string, entryPos?: Point) => {
    setActionPanel(null);
    setStatsOpen(false);
    setRankingOpen(false);
    setTracking(null);
    props.onScene(nextScene, message, entryPos);
  };

  const { confirm, dialogs } = useDialogs();

  const onFacility = (id: FurnitureId) => {
    if (scene.kind !== 'base') return;
    const pack = BASE_PACKS[scene.id];
    switch (id) {
      case 'sell': case 'rod': case 'boat': case 'shop': case 'bounty':
        setActionPanel(panel => panel === id ? null : id);
        return;
      case 'rank':
        setActionPanel(null);
        setRankingOpen(true);
        return;
      case 'exit':
        go({ kind: 'region', id: pack.region }, pack.exitMsg, pack.exitAt);
        return;
      case 'travel': {
        // 여객선은 다른 지역으로 위치를 통째로 옮기므로 확인을 받는다
        const travel = pack.travel;
        if (!travel) return;
        setActionPanel(null);
        const place = REGION_PACKS[travel.to].info.shortName;
        void confirm({ layer: 'stage', title: '여객선', body: `여객선을 타고 ${place}로 돌아갈까요?
지금 있는 바다를 떠나 ${place}에서 다시 시작해요.`,
          confirmLabel: `${place}로 가기` })
          .then(ok => { if (ok) go({ kind: 'region', id: travel.to }, travel.msg); });
        return;
      }
    }
  };

  const openStats = () => setStatsOpen(open => !open);
  // 승부 결과 확정 — 서버가 도감·진행도·도전권을 바꾼다. 실패는 감사만 남아 창을 그대로 둔다
  const resolveEncounter = (r: EncounterResult) => {
    if (!encounter) return;
    when(props.dispatch({ type: 'resolveChallenge', questId: encounter.quest.id,
      success: r.success, hits: r.hits, misses: r.misses }), result => {
      if (result.status === 'rejected') { props.setToast(REJECT_TEXT[result.error], 'warn'); setTracking(null); return; }
      if (r.success) {
        const zoneName = zoneById(encounter.quest.zone)?.shortName ?? encounter.quest.zone;
        props.setToast(`${josa(encounter.named.name, '을/를')} 토벌했어요! ${zoneName}의 수배판에서 보상 받기를 눌러 주세요.`, 'gold');
        setTracking(null);
      }
    });
  };
  const onOpenMap = () => setWorldMapOpen(true);

  return (
    <div className="flex h-screen w-screen overflow-hidden max-[820px]:flex-col">
      <GameStageLayout>
        {scene.kind === 'base' ? (
          <BaseMenu key={scene.id} base={scene.id} game={game} onFacility={onFacility} />
        ) : (
          <Field key={scene.id} region={scene.id} game={game} dispatch={props.dispatch} setToast={props.setToast}
                 onScene={go} onWarmup={props.onWarmup} paused={encounter !== null}
                 initialPos={props.entryPos ?? undefined} />
        )}

        <HudLayout game={game} scene={scene} log={props.log} covered={covered}
                   onOpenStats={openStats} onOpenMap={onOpenMap}
                   notice={atSea ? <TraceCard onTrack={setTracking} /> : null} badge={props.badge} />
        {dialogs}
        {encounter && (
          <EncounterModal key={encounter.quest.id} data={encounter}
                          onResolve={resolveEncounter} onClose={() => setTracking(null)} />
        )}

        {statsOpen && (
          <StatsModal game={game}
                      movement={scene.kind === 'region' ? REGION_PACKS[scene.id].movement : 'walk'}
                      region={region} nickname={props.nickname}
                      onClose={() => setStatsOpen(false)} />
        )}
        {rankingOpen && <RankingModal onClose={() => setRankingOpen(false)} />}
        <MailboxButton onOpen={() => setMailboxOpen(true)} setToast={props.setToast} />
        {mailboxOpen && (
          <MailboxModal dispatch={props.dispatch} setToast={props.setToast} onClose={() => setMailboxOpen(false)} />
        )}

        {actionPanel && (
          <FacilityModal panel={actionPanel} game={game} dispatch={props.dispatch}
                         base={scene.kind === 'base' ? scene.id : undefined} uid={props.uid}
                         setToast={props.setToast} onClose={() => setActionPanel(null)} />
        )}
      </GameStageLayout>

      <GameTabs
        region={region}
        activeTab={activeTab} setActiveTab={setActiveTab}
        game={game} dispatch={props.dispatch} setToast={props.setToast}
        syncLabel={props.syncLabel} syncState={props.syncState}
        account={props.account} uid={props.uid} onAuthChanged={props.onAuthChanged}
        nickname={props.nickname} onRename={props.onRename}
      />

      {/* 세이브가 준비된 뒤(서버 연결 또는 로컬)에만 소식 창을 계획한다 */}
      <WhatsNewModal game={game} ready={props.syncState === 'on' || props.syncState === 'off'} />
      {props.outdated && <UpdateModal />}
      {worldMapOpen && <WorldMapModal world={worldScene} onClose={() => setWorldMapOpen(false)} />}
    </div>
  );
}
