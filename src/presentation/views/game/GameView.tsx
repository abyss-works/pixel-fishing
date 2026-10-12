import { useState } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import type { RejectReason } from '../../../game/rules/rules';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/model/types';
import { BASE_PACKS, REGION_PACKS } from '../../../game/world';
import type { FurnitureId, Point, SceneRef } from '../../../game/world';
import type { RegionId } from '../../../game/content/places';
import type { Msg } from '../../layouts/hud/useMessageLog';
import GameStageLayout from '../../layouts/game-stage/GameStageLayout';
import Base from '../../layouts/game-stage/Base';
import Field from '../../layouts/game-stage/Field';
import HudLayout from '../../layouts/hud/HudLayout';
import GameTabs from './tabs/GameTabs';
import { DEFAULT_TAB } from './tabs/tabs';
import type { TabKey } from './tabs/tabs';
import FacilityModal from '../overlays/facility/FacilityModal';
import type { ActionPanel } from '../overlays/facility/FacilityModal';
import StatsModal from '../overlays/stats/StatsModal';
import WorldMapModal from '../overlays/world-map/WorldMapModal';
import UpdateModal from '../overlays/update/UpdateModal';
import { useCanvasCover } from '../../../features/admin/model/canvasCover';

interface GameViewProps {
  game: GameState;
  scene: SceneRef;
  entryPos: Point | null;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: (message: string) => void;
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
}

export default function GameView(props: GameViewProps) {
  const { game, scene } = props;
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const covered = useCanvasCover();
  const worldScene = scene.kind === 'region' && scene.id === 'world';
  const region: RegionId = scene.kind === 'region' ? scene.id : BASE_PACKS[scene.id].region;

  const go = (nextScene: SceneRef, message: string, entryPos?: Point) => {
    setActionPanel(null);
    setStatsOpen(false);
    props.onScene(nextScene, message, entryPos);
  };

  const onFacility = (id: FurnitureId) => {
    if (scene.kind !== 'base') return;
    const pack = BASE_PACKS[scene.id];
    switch (id) {
      case 'sell': case 'rod': case 'boat': case 'shop': case 'bounty':
        setActionPanel(panel => panel === id ? null : id);
        return;
      case 'dex':
        setActionPanel(null);
        setActiveTab('dex');
        return;
      case 'exit':
        go({ kind: 'region', id: pack.region }, pack.exitMsg, pack.exitAt);
        return;
      case 'travel':
        if (pack.travel) go({ kind: 'region', id: pack.travel.to }, pack.travel.msg);
        return;
    }
  };

  const openStats = () => setStatsOpen(open => !open);
  const onOpenMap = () => setWorldMapOpen(true);

  return (
    <div className="flex h-screen w-screen overflow-hidden max-[820px]:flex-col">
      <GameStageLayout>
        {scene.kind === 'base' ? (
          <Base key={scene.id} base={scene.id} game={game} onFacility={onFacility} />
        ) : (
          <Field key={scene.id} region={scene.id} game={game} dispatch={props.dispatch} setToast={props.setToast}
                 onScene={go} onOpenMap={onOpenMap} onWarmup={props.onWarmup}
                 onShop={() => setActionPanel(panel => panel === 'boat' ? panel : 'boat')}
                 initialPos={props.entryPos ?? undefined} />
        )}

        <HudLayout game={game} scene={scene} log={props.log} covered={covered}
                   onOpenStats={openStats} onOpenMap={onOpenMap} />

        {statsOpen && (
          <StatsModal game={game}
                      movement={scene.kind === 'region' ? REGION_PACKS[scene.id].movement : 'walk'}
                      region={region}
                      onClose={() => setStatsOpen(false)} />
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

      {props.outdated && <UpdateModal />}
      {worldMapOpen && <WorldMapModal world={worldScene} onClose={() => setWorldMapOpen(false)} />}
    </div>
  );
}
