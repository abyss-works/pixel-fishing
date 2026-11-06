import { useMemo, useState } from 'react';
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
import type { BaseId, RegionId } from '../../../game/content/places';
import { zoneById } from '../../../game/content/zones';
import type { Msg } from '../../layouts/hud/useMessageLog';
import type { Notify } from '../../ui/hud/messageFeed';
import GameStageLayout from '../../layouts/game-stage/GameStageLayout';
import Field from '../../layouts/game-stage/Field';
import HudLayout from '../../layouts/hud/HudLayout';
import { FILTER_CHANNELS } from '../../../features/display/model/messageFilter';
import BaseMenu from './base-menu/BaseMenu';
import GameTabs from './tabs/GameTabs';
import { DEFAULT_TAB } from './tabs/tabs';
import type { TabKey } from './tabs/tabs';
import FacilityModal from '../overlays/facility/FacilityModal';
import type { ActionPanel } from '../overlays/facility/FacilityModal';
import FerryModal from '../overlays/ferry/FerryModal';
import StatsModal from '../overlays/stats/StatsModal';
import { useDialogs } from '../../ui/useDialogs';
import RankingModal from '../overlays/ranking/RankingModal';
import GameMenu from '../overlays/menu/GameMenu';
import MailboxModal from '../overlays/mailbox/MailboxModal';
import FriendsModal from '../overlays/friends/FriendsModal';
import GuildModal from '../overlays/guild/GuildModal';
import GuildInviteDialog from '../overlays/guild/GuildInviteDialog';
import AccountModal from '../overlays/account/AccountModal';
import { useGuildAlerts } from '../../../features/guild/service/useGuildAlerts';
import { useGuildInviteLanding } from '../../../features/guild/service/useGuildInvite';
import { useGuild } from '../../../features/guild/service/useGuild';
import { useFriendAlerts } from '../../../features/friends/service/useFriendAlerts';
import WorldMapModal from '../overlays/world-map/WorldMapModal';
import WhatsNewModal from '../overlays/whats-new/WhatsNewModal';
import TutorialModal from '../overlays/tutorial/TutorialModal';
import { useTutorialTrigger } from '../../../features/tutorial/service/tutorial';
import { guildMatesIn, useChat, useLive } from '../../../features/live/service/useLive';
import TraceCard from '../overlays/bounty/TraceCard';
import AwayCard from '../overlays/away/AwayCard';
import AwayReportModal from '../overlays/away/AwayReportModal';
import { awayLineText } from '../overlays/away/awayText';
import { useAwayReport } from '../../../features/away/service/useAwayReport';
import PresenceChip from '../overlays/live/PresenceChip';
import ChatBar from '../overlays/live/ChatBar';
import PlayersModal from '../overlays/live/PlayersModal';
import PlayerModal from '../overlays/live/PlayerInfo';
import type { PlayerTarget } from '../overlays/live/PlayerInfo';
import { chatMessages } from '../overlays/live/chatFeed';
import { mergeMessages } from '../../ui/hud/messageFeed';
import EncounterModal from '../overlays/bounty/EncounterModal';
import type { EncounterResult } from '../overlays/bounty/EncounterModal';
import { josa } from '../../ui/format';
import { cx } from '../../ui/cx';
import { useCanvasCover } from '../../layouts/game-stage/canvasCover';
import { useMobileLayout } from '../../layouts/useMobileLayout';
import { useBlockZoom } from '../../layouts/useBlockZoom';

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
  /** 액션 밖에서 서버가 바꾼 게임 상태를 다시 읽는다(길드 보너스 기부의 골드) */
  onResync: () => Promise<void>;
  /** 진행을 막는 앱 모달(새 버전, 다른 창 접속) — 앱 최상위가 실패 정책에 따라 공급한다 */
  blocker?: ReactNode;
  /** 스테이지 아래 가운데에 놓을 환경 배지 — 앱 최상위가 개발 환경과 함께 공급한다 */
  badge?: ReactNode;
}

// 길드에 들어가 있지 않으면 길드 채널 토글을 회색으로 둔다
const GUILD_OFF = ['guild'] as const;

export default function GameView(props: GameViewProps) {
  const { game, scene } = props;
  const [activeTab, setActiveTab] = useState<TabKey>(DEFAULT_TAB);
  const mobile = useMobileLayout();
  useBlockZoom();
  /** 모바일 시트 — 처음에는 닫혀 있다 */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 모바일 채팅 입력 줄 — 메시지 창 기록 칸을 누르면 열린다 */
  const [chatOpen, setChatOpen] = useState(false);
  /** 모바일 낚시 상태 띠가 들어갈 HUD 자리 */
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [guildOpen, setGuildOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const [ferryOpen, setFerryOpen] = useState(false);
  /** 추적 중인 네임드 의뢰 — 흔적 카드의 추적 버튼이 열고, 토벌·돌아가기·닫기가 닫는다 */
  const [tracking, setTracking] = useState<string | null>(null);
  const covered = useCanvasCover();
  const atSea = scene.kind === 'region' && scene.id !== 'village';
  // 튜토리얼 트리거 — 마을(집 포함)과 바다에 처음 나왔을 때
  useTutorialTrigger('village', scene.kind === 'region' ? scene.id === 'village' : scene.id === 'home');
  useTutorialTrigger('sea', atSea);
  useLive();
  const chat = useChat();
  /** 같은 바다 접속 목록 창 */
  const [playersOpen, setPlayersOpen] = useState(false);
  /** 채팅 이름에서 연 플레이어 정보 — 다른 사람의 글줄이면 그 글줄을 신고할 수 있다 */
  const [player, setPlayer] = useState<PlayerTarget | null>(null);
  const { guild } = useGuild(props.account !== null);
  // 길드 보너스는 서버가 적용한다. 화면은 서버가 알려 준 레벨과 효과를 보이기만 한다(스탯 창 보너스 탭, 가방 칸)
  const guildBonus = guild ? { level: guild.growth.level, effects: guild.effects } : null;
  const bagBonus = guildBonus?.effects.bag ?? 0;
  useFriendAlerts(props.account !== null, props.setToast);
  useGuildAlerts(props.account !== null, props.setToast);
  // 초대 링크로 열렸으면 게임 상태를 불러온 뒤 확인 창을 띄운다. 게스트가 계정 창을 여는 동안은 숨기고, 계정이 생기면 다시 띄운다
  const invite = useGuildInviteLanding();
  const [accountOpen, setAccountOpen] = useState(false);
  const inviteReady = invite.code !== null && props.syncState === 'on' && !accountOpen && props.blocker == null;
  // 방치 결과 보고 — 돌아오면 메시지 창에 한 줄, 오래 비웠으면 알림 카드. 카드의 자세히가 결과 창을 연다
  const away = useAwayReport(s => props.setToast(awayLineText(s), 'gold'));
  const [awayOpen, setAwayOpen] = useState(false);
  const closeAway = () => { setAwayOpen(false); away.dismiss(); };
  const log = chat.enabled
    ? mergeMessages(mergeMessages(props.log, chatMessages(chat.lines)), chatMessages(chat.guildLines, 'guild'))
    : props.log;
  const encounter = tracking ? selectEncounter(game, tracking, new Date().toISOString()) : null;
  const worldScene = scene.kind === 'region' && scene.id === 'world';
  const region: RegionId = scene.kind === 'region' ? scene.id : BASE_PACKS[scene.id].region;
  // 미니맵의 길드원 점 — 지금 길드원(떠난 선원과 나 제외) 가운데 같은 바다에 접속한 사람
  const guildMates = useMemo(() => {
    const ids = new Set((guild?.members ?? []).filter(m => m.leftAt === null && m.uid !== chat.you).map(m => m.uid));
    return ids.size > 0 ? () => guildMatesIn(region, ids) : undefined;
  }, [guild, region, chat.you]);

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
      case 'sell': case 'rod': case 'boat': case 'shop': case 'bounty': case 'wardrobe':
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
      case 'ferry':
        setActionPanel(null);
        setFerryOpen(true);
        return;
    }
  };

  // 빠른 이동 — 목적지를 고르면 창을 닫고 여객선처럼 확인을 받은 뒤 그 항구로 옮긴다
  const pickPort = (port: BaseId) => {
    setFerryOpen(false);
    const name = BASE_PACKS[port].name;
    void confirm({ layer: 'stage', title: '여객선', body: `여객선을 타고 ${name}에 갈까요?
지금 있는 항구를 떠나 ${name}에서 정비를 이어 가요.`,
      confirmLabel: `${name}에 가기` })
      .then(ok => { if (ok) go({ kind: 'base', id: port }, `여객선을 타고 ${name}에 도착했어요. 시설을 눌러 정비해 보세요.`); });
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
    <div className={cx('flex w-screen overflow-hidden', mobile ? 'h-dvh flex-col' : 'h-screen max-[820px]:flex-col')}>
      <GameStageLayout>
        {scene.kind === 'base' ? (
          <BaseMenu key={scene.id} base={scene.id} game={game} onFacility={onFacility} />
        ) : (
          <Field key={scene.id} region={scene.id} game={game} dispatch={props.dispatch} setToast={props.setToast}
                 onScene={go} onWarmup={props.onWarmup} paused={encounter !== null || props.blocker != null}
                 initialPos={props.entryPos ?? undefined} statusSlot={statusSlot} />
        )}

        <HudLayout game={game} bagBonus={bagBonus} scene={scene} log={log} covered={covered}
                   logFooter={chat.enabled ? (
                     <ChatBar inGuild={guild !== null} guest={props.account === null}
                              open={!mobile || chatOpen} onLeave={mobile ? () => setChatOpen(false) : undefined} />
                   ) : null}
                   onStatusSlot={setStatusSlot}
                   onActivateLog={chat.enabled && props.account !== null ? () => setChatOpen(true) : undefined}
                   onPickLine={chat.enabled ? m => {
                     if (!m.from) return;
                     setPlayer({ uid: m.from.uid, nick: m.author ?? '', chatId: m.from.uid === chat.you ? undefined : m.from.chatId });
                   } : undefined}
                   you={chat.you}
                   guildMates={guildMates}
                   channels={chat.enabled ? FILTER_CHANNELS : undefined}
                   disabledChannels={guild === null ? GUILD_OFF : undefined}
                   onOpenStats={openStats} onOpenMap={onOpenMap}
                   notice={atSea || (away.report && !awayOpen) ? (
                     <div className="flex flex-col gap-2">
                       {away.report && !awayOpen && (
                         <AwayCard report={away.report} onClose={away.dismiss} onDetail={() => setAwayOpen(true)} />
                       )}
                       {atSea && <TraceCard onTrack={setTracking} />}
                     </div>
                   ) : null}
                   chips={atSea ? <PresenceChip region={region} onOpen={() => setPlayersOpen(true)} /> : null}
                   badge={props.badge} />
        {dialogs}
        {encounter && (
          <EncounterModal key={encounter.quest.id} data={encounter}
                          onResolve={resolveEncounter} onClose={() => setTracking(null)} />
        )}

        {statsOpen && (
          <StatsModal game={game} guild={guildBonus}
                      movement={scene.kind === 'region' ? REGION_PACKS[scene.id].movement : 'walk'}
                      region={region} nickname={props.nickname}
                      onClose={() => setStatsOpen(false)} />
        )}
        {rankingOpen && <RankingModal onClose={() => setRankingOpen(false)} />}
        {away.report && awayOpen && (
          <AwayReportModal report={away.report} game={game} onClose={closeAway}
                           onOpenBag={() => { closeAway(); setActiveTab('bag'); }} />
        )}
        <GameMenu account={props.account} setToast={props.setToast}
                  onGuild={() => setGuildOpen(true)} onFriends={() => setFriendsOpen(true)}
                  onMailbox={() => setMailboxOpen(true)} />
        {friendsOpen && <FriendsModal setToast={props.setToast} onClose={() => setFriendsOpen(false)} />}
        {guildOpen && <GuildModal setToast={props.setToast} onGoldChanged={props.onResync} onClose={() => setGuildOpen(false)} />}
        {inviteReady && invite.code && (
          <GuildInviteDialog code={invite.code} account={props.account} setToast={props.setToast}
                             onAccount={() => setAccountOpen(true)} onClose={invite.clear} />
        )}
        {accountOpen && (
          <AccountModal game={game} setToast={props.setToast} onAuthChanged={props.onAuthChanged}
                        account={props.account} uid={props.uid} nickname={props.nickname} onRename={props.onRename}
                        syncLabel={props.syncLabel} syncState={props.syncState} onClose={() => setAccountOpen(false)} />
        )}
        {playersOpen && atSea && (
          <PlayersModal region={region} account={props.account} setToast={props.setToast} onClose={() => setPlayersOpen(false)} />
        )}
        {player && (
          <PlayerModal target={player} self={player.uid === chat.you} account={props.account}
                       setToast={props.setToast} onClose={() => setPlayer(null)} />
        )}
        {mailboxOpen && (
          <MailboxModal dispatch={props.dispatch} setToast={props.setToast} onClose={() => setMailboxOpen(false)} />
        )}

        {ferryOpen && scene.kind === 'base' && (
          <FerryModal game={game} from={scene.id} onPick={pickPort} onClose={() => setFerryOpen(false)} />
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
        sheetOpen={sheetOpen} onSheetOpenChange={setSheetOpen}
        game={game} dispatch={props.dispatch} setToast={props.setToast}
        syncLabel={props.syncLabel} syncState={props.syncState}
        account={props.account} uid={props.uid} onAuthChanged={props.onAuthChanged}
        nickname={props.nickname} onRename={props.onRename}
      />

      {/* 세이브가 준비된 뒤(서버 연결 또는 로컬)에만 소식 창을 계획한다 */}
      <WhatsNewModal game={game} ready={props.syncState === 'on' || props.syncState === 'off'} />
      <TutorialModal seen={game.tutorials} ready={props.syncState === 'on' || props.syncState === 'off'}
                     dispatch={props.dispatch} />
      {props.blocker}
      {worldMapOpen && <WorldMapModal world={worldScene} onClose={() => setWorldMapOpen(false)} />}
    </div>
  );
}
