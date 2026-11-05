// 스테이지 HUD 전체 — 게임 화면(GameView)과 같은 조합으로 자원 바, 메시지 창과 채팅 입력, 오른쪽 아래 열(알림 카드,
// 접속 칩, 미끼 칩, 미니맵), 낚시 상태 띠 또는 획득 카드, 환경 배지를 한 스테이지에 올린다.
// 실시간 채널과 수배판 응답은 MSW가 준다. 게임 시각은 시간 고정으로 정한다.
import type { Meta, StoryObj } from '@storybook/react';
import type { ReactNode } from 'react';
import { FISH } from '../../../game/content/fish';
import { newState } from '../../../game/rules/logic';
import type { CatchInfo, GameState } from '../../../game/rules/logic';
import type { AwaySummary } from '../../../game/rules/away';
import type { SceneRef } from '../../../game/world';
import { setZone } from '../../../game/world/currentSpot';
import { FILTER_CHANNELS } from '../../../features/display/model/messageFilter';
import { setTimeOverride } from '../../../features/gameplay/service/timeOverride';
import CatchCard from '../../ui/hud/CatchCard';
import AwayCard from '../../views/overlays/away/AwayCard';
import TraceCard from '../../views/overlays/bounty/TraceCard';
import ChatBar from '../../views/overlays/live/ChatBar';
import PresenceChip from '../../views/overlays/live/PresenceChip';
import { DevEnvContext, devEnvOf } from '../../views/devtools/devEnv';
import EnvBadge from '../../views/devtools/EnvBadge';
import FishingStatus from '../game-stage/FishingStatus';
import GameFrame from '../game-stage/GameFrame';
import HudLayout from './HudLayout';
import { bountyHandler, clockAt, LiveFeed, liveHandler, ME, MIXED_LOG, NAMED_QUEST, OTHERS } from './hudStoryFixtures';

const game: GameState = {
  ...newState(), gold: 12_417, fame: 4_210, boat: 2, rod: 12,
  activeBait: 'bait-common', items: { 'bait-common': 12 },
};

const away: AwaySummary = {
  from: '2026-11-06T10:30:00.000Z', to: '2026-11-06T12:44:00.000Z', awayMs: (2 * 60 + 14) * 60_000,
  catches: 412, value: 18_240, fame: 1_240,
  perHour: { catches: 184, value: 8_168, fame: 555 },
  grades: [], variants: { count: 3, share: 0.007 },
  newFish: [{ fishId: 'tuna', form: 'normal', rarity: 'epic', maxSize: 182.4 }, { fishId: 'seabream', form: 'normal', rarity: 'rare', maxSize: 52.1 }],
  released: { count: 38, value: 1_420 }, bagFullAfterMs: 100 * 60_000, spot: null,
};

interface Args {
  scene: SceneRef;
  /** 게임 프레임 안 오버레이 — 낚시 상태 띠나 획득 카드 */
  frame?: ReactNode;
  awayReport?: AwaySummary;
  inGuild?: boolean;
}

function Hud({ scene, frame, awayReport, inGuild = true }: Args) {
  const atSea = scene.kind === 'region' && scene.id !== 'village';
  return (
    <DevEnvContext.Provider value={devEnvOf('preview')}>
      <LiveFeed />
      <GameFrame>{frame}</GameFrame>
      <HudLayout game={game} scene={scene} log={MIXED_LOG} covered={false} you={ME}
                 onOpenStats={() => {}} onOpenMap={() => {}} onPickLine={() => {}}
                 channels={FILTER_CHANNELS} disabledChannels={inGuild ? undefined : ['guild']}
                 logFooter={<ChatBar inGuild={inGuild} />}
                 notice={atSea || awayReport ? (
                   <div className="flex flex-col gap-2">
                     {awayReport && <AwayCard report={awayReport} onClose={() => {}} onDetail={() => {}} />}
                     {atSea && <TraceCard onTrack={() => {}} />}
                   </div>
                 ) : null}
                 chips={atSea ? <PresenceChip region="world" onOpen={() => {}} /> : null}
                 badge={<EnvBadge build="v0.15.4-a1b2c3d" />} />
    </DevEnvContext.Provider>
  );
}

const SEA: SceneRef = { kind: 'region', id: 'world' };
const fish = (id: string) => FISH.find(f => f.id === id)!;
const bigCatch: CatchInfo = { size: 312.4, form: 'normal', percentile: 3, isBig: true, isNew: true };

const meta: Meta<typeof Hud> = {
  title: 'Stage/HudLayout',
  component: Hud,
  parameters: {
    layout: 'fullscreen', stage: {},
    msw: [liveHandler({ others: OTHERS }), bountyHandler()],
  },
  beforeEach: () => {
    setTimeOverride(clockAt(30));
    setZone('pacific');
    return () => { setTimeOverride(null); setZone(null); };
  },
  args: { scene: SEA, frame: <FishingStatus phase="wait" /> },
};
export default meta;
type Story = StoryObj<typeof Hud>;

/** 바다에서 입질을 기다리는 중 — 흔적 없음 */
export const SeaWait: Story = {};

/** 바다에서 획득한 순간 — 띠 대신 카드 */
export const SeaCatch: Story = { args: { frame: <CatchCard fish={fish('sailfish')} info={bigCatch} /> } };

/** 흔적 카드, 지금 있는 구역의 의뢰 — 추적 버튼 */
export const TraceHere: Story = {
  parameters: { msw: [liveHandler({ others: OTHERS }), bountyHandler({
    progress: [{ quest_id: NAMED_QUEST, progress: 0 }], tickets: [{ quest_id: NAMED_QUEST, issuedMinutesAgo: 20 }],
  })] },
};

/** 흔적 카드, 다른 구역의 의뢰 — 기본 테두리와 구역 이름 */
export const TraceFar: Story = {
  parameters: { msw: [liveHandler({ others: OTHERS }), bountyHandler({
    progress: [{ quest_id: 'seasia-named-leviathan', progress: 0 }], tickets: [{ quest_id: 'seasia-named-leviathan', issuedMinutesAgo: 20 }],
  })] },
};

/** 토벌을 마치고 보상을 안 받았다 */
export const TraceDone: Story = {
  parameters: { msw: [liveHandler({ others: OTHERS }), bountyHandler({ progress: [{ quest_id: NAMED_QUEST, progress: 1 }] })] },
};

/** 돌아온 직후 — 방치 결과 카드가 맨 위에 쌓인다 */
export const Away: Story = { args: { awayReport: away } };

/** 거점(항구) — 미니맵과 접속 칩이 없고, 시계가 메뉴 버튼 자리 왼쪽에 붙는다. 길드가 없다 */
export const Base: Story = { args: { scene: { kind: 'base', id: 'harbor' }, frame: null, inGuild: false } };
