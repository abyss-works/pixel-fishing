import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { GameState } from '../../../game/rules/logic';
import type { GameAction } from '../../../game/rules/actions';
import { REJECT_TEXT } from '../../../game/rules/logic';
import type { RejectReason } from '../../../game/rules/rules';
import { when } from '../../../shared/lib/when';
import { selectEncounter } from '../../../features/bounty/model/challenge';
import { useBountyAlerts } from '../../../features/bounty/service/useBountyAlerts';
import { sendNotice } from '../../../features/display/model/toastPolicy';
import { useSlotExpiryAlerts } from '../../../features/kitchen/service/useSlotExpiryAlerts';
import type { DispatchResult, MaybePromise } from '../../../features/gameplay/service/types';
import { BASE_PACKS, REGION_PACKS, boardingOf } from '../../../game/world';
import type { FurnitureId, Point, SceneRef } from '../../../game/world';
import type { BaseId, RegionId } from '../../../game/content/places';
import { zoneById } from '../../../game/content/zones';
import type { FloatingToastItem } from '../../ui/FloatingToastLayer';
import FloatingToastLayer from '../../ui/FloatingToastLayer';
import type { MirrorContextPatch, Msg } from '../../layouts/hud/useMessageLog';
import type { StatsTab } from '../overlays/stats/StatsModal';
import type { ProfileStatus } from '../../../features/gameplay/service/types';
import type { Notify } from '../../ui/hud/messageFeed';
import GameStageLayout from '../../layouts/game-stage/GameStageLayout';
import Field from '../../layouts/game-stage/Field';
import HudLayout from '../../layouts/hud/HudLayout';
import { FILTER_CHANNELS } from '../../../features/display/model/messageFilter';
import { useMessageFilter } from '../../../features/display/service/messageFilter';
import { useMessageFold } from '../../../features/display/service/messageFold';
import BaseMenu from './base-menu/BaseMenu';
import GameTabs from './tabs/GameTabs';
import { DEFAULT_TAB } from './tabs/tabs';
import type { TabKey } from './tabs/tabs';
import FacilityModal from '../overlays/facility/FacilityModal';
import type { ActionPanel } from '../overlays/facility/FacilityModal';
import FerryVeil from '../../layouts/game-stage/FerryVeil';
import FerryModal from '../overlays/ferry/FerryModal';
import StatsModal from '../overlays/stats/StatsModal';
import AchievementsModal from '../overlays/achievements/AchievementsModal';
import QuestInfoModal from '../overlays/bounty/QuestInfoModal';
import { useDialogs } from '../../ui/useDialogs';
import RankingModal from '../overlays/ranking/RankingModal';
import { createGuestBlockedNotice } from './guestBlockedNotice';
import { accountLockState, isConfirmedGuest } from '../../../features/account/service/accountActions';
import type { GuestProgress } from '../../../features/account/model/accountRules';
import GameMenu from '../overlays/menu/GameMenu';
import EventHudButton from '../overlays/events/EventHudButton';
import MobileEventHudButton from '../overlays/events/MobileEventHudButton';
import EventsModal from '../overlays/events/EventsModal';
import { hasEventsAlert } from '../../../features/events/model/events';
import { useEvents } from '../../../features/events/service/useEvents';
import MailboxModal from '../overlays/mailbox/MailboxModal';
import FriendsModal from '../overlays/friends/FriendsModal';
import GuildModal from '../overlays/guild/GuildModal';
import GuildInviteDialog from '../overlays/guild/GuildInviteDialog';
import AccountModal from '../overlays/account/AccountModal';
import GoogleReturn from '../overlays/account/GoogleReturn';
import { settleAction } from '../../../features/gameplay/service/useGame';
import { useGuildAlerts } from '../../../features/guild/service/useGuildAlerts';
import { useGuildInviteLanding } from '../../../features/guild/service/useGuildInvite';
import { useGuild } from '../../../features/guild/service/useGuild';
import { useFriendAlerts } from '../../../features/friends/service/useFriendAlerts';
import { useMailAlerts } from '../../../features/mailbox/service/useMailAlerts';
import WorldMapModal from '../overlays/world-map/WorldMapModal';
import WhatsNewModal from '../overlays/whats-new/WhatsNewModal';
import TutorialModal from '../overlays/tutorial/TutorialModal';
import AlertPromptModal from '../overlays/alerts/AlertPromptModal';
import BaitRefundModal from '../overlays/bait-refund/BaitRefundModal';
import { useBaitRefund } from '../../../features/inventory/service/baitRefund';
import { useWhatsNewPending } from '../../../features/announcements/service/whatsNew';
import FortuneModal from '../overlays/fortune/FortuneModal';
import FortuneCalendarModal from '../overlays/fortune/FortuneCalendarModal';
import ActiveEffectsModal from '../overlays/effects/ActiveEffectsModal';
import { setBagSection } from './tabs/bag/bagView';
import { useFortuneModal } from '../../../features/fortune/service/fortuneModal';
import { useTutorialPending, useTutorialTrigger } from '../../../features/tutorial/service/tutorial';
import { useBagFullAlert } from '../../../features/alerts/service/bagFullAlert';
import { selectBagStatus } from '../../../features/inventory/model/selectors';
import { resolveLiveRegion } from '../../../features/live/model/live';
import { guildMatesIn, sendRegion, useChat, useLive } from '../../../features/live/service/useLive';
import { useLiveNickSync } from '../../../features/live/service/useLiveNickSync';
import { useNotices } from '../../../features/live/service/useNotices';
import { useSpotState } from '../../../features/travel/service/useSpotState';
import TraceCard from '../overlays/bounty/TraceCard';
import AwayCard from '../overlays/away/AwayCard';
import AwayReportModal from '../overlays/away/AwayReportModal';
import { awayLineText } from '../overlays/away/awayText';
import { useAwayReport } from '../../../features/away/service/useAwayReport';
import PresenceChip from '../overlays/live/PresenceChip';
import ChatBar from '../overlays/live/ChatBar';
import NoticeModal from '../overlays/live/NoticeModal';
import NoticeStack from '../overlays/live/NoticeStack';
import PlayersModal from '../overlays/live/PlayersModal';
import PlayerModal from '../overlays/live/PlayerInfo';
import type { PlayerTarget } from '../overlays/live/PlayerInfo';
import { chatMessages } from '../overlays/live/chatFeed';
import { mergeMessages } from '../../ui/hud/messageFeed';
import EncounterModal from '../overlays/bounty/EncounterModal';
import type { EncounterResult } from '../overlays/bounty/EncounterModal';
import Frame from '../../ui/Frame';
import PixelIcon from '../../ui/PixelIcon';
import Tip from '../../ui/Tip';
import { fmtNum, josa } from '../../ui/format';
import { cx } from '../../ui/cx';
import { useCanvasCover } from '../../layouts/game-stage/canvasCover';
import { useMobileLayout } from '../../layouts/useMobileLayout';
import { useBlockZoom } from '../../layouts/useBlockZoom';
import { keyboardStyle, useVisibleBox } from '../../layouts/visibleBox';
import { windowHostRef } from '../../ui/windowLayer';

interface GameViewProps {
  game: GameState;
  scene: SceneRef;
  entryPos: Point | null;
  /** 장소를 지정할 때마다 늘어나는 순번 — 같은 지역 안의 이동을 Field에 알린다 */
  placeSeq: number;
  dispatch: (action: GameAction) => MaybePromise<DispatchResult>;
  setToast: Notify;
  onScene: (scene: SceneRef, message: string, entryPos?: Point, returnPos?: Point) => void;
  /** 서버에 알리지 않고 화면의 장소만 바꾼다 */
  onPlace: (scene: SceneRef, entryPos?: Point) => void;
  log: Msg[];
  toasts?: readonly FloatingToastItem[];
  onDismissToast?: (id: number) => void;
  onMirrorEnv?: (patch: MirrorContextPatch) => void;
  syncLabel: string | null;
  syncState: string;
  /** 이 기기의 게스트 진행 — 계정을 바꿀 때 버려지는 것이 있는지 확인 창을 띄울지 가른다 */
  guestProgress: GuestProgress;
  account: string | null;
  /** 계정 확인이 끝났는가 — 끝나기 전의 계정 없음은 게스트가 아니라 미확인이다 */
  accountChecked: boolean;
  /** 세션 확인에 실패했는가 — 계정 없음이지만 게스트가 아니다 */
  accountFailed: boolean;
  uid: string | null;
  nickname: string | null;
  profileStatus?: ProfileStatus;
  onRename: (name: string) => Promise<null | RejectReason>;
  onAuthChanged: () => Promise<void>;
  /** 액션 밖에서 서버가 바꾼 게임 상태를 다시 읽는다(길드 보너스 기부의 골드) */
  onResync: () => Promise<void>;
  /** 현재 저장 버전을 읽는다 — 모르면 null */
  saveVersion?: () => number | null;
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
  /** 화면 키보드 높이 — 키보드는 게임 영역 아래를 덮을 뿐 스테이지 크기를 바꾸지 않는다. 채팅만 키보드 위에 붙는다(--keyboard-h) */
  const visible = useVisibleBox();
  /** 모바일 시트 — 처음에는 닫혀 있다 */
  const [sheetOpen, setSheetOpen] = useState(false);
  /** 모바일 낚시 상태 띠가 들어갈 HUD 자리 */
  const [statusSlot, setStatusSlot] = useState<HTMLElement | null>(null);
  /** 획득 카드가 들어갈 HUD 자리 */
  const [catchSlot, setCatchSlot] = useState<HTMLElement | null>(null);
  const [actionPanel, setActionPanel] = useState<ActionPanel>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsInitialTab, setStatsInitialTab] = useState<StatsTab>('summary');
  const [effectsOpen, setEffectsOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [fortuneOpen, setFortuneOpen] = useState(false);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventBusy, setEventBusy] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [guildOpen, setGuildOpen] = useState(false);
  const [worldMapOpen, setWorldMapOpen] = useState(false);
  const [ferryOpen, setFerryOpen] = useState(false);
  /** 진행 중인 빠른 이동 — 떠나는 항구와 가는 항구 */
  const [trip, setTrip] = useState<{ from: BaseId; to: BaseId } | null>(null);
  /** 추적 중인 네임드 의뢰 — 흔적 카드의 추적 버튼이 열고, 토벌·돌아가기·닫기가 닫는다 */
  const [tracking, setTracking] = useState<string | null>(null);
  const covered = useCanvasCover();
  const atSea = scene.kind === 'region' && scene.id === 'world';
  const showPresence = scene.kind === 'region' && (scene.id === 'world' || REGION_PACKS[scene.id].showOthers === true);
  // 튜토리얼 트리거 — 마을 야외와 바다에 처음 나왔을 때
  useTutorialTrigger('village', scene.kind === 'region' && scene.id === 'village');
  useTutorialTrigger('sea', atSea);
  // 트리거 등록 효과가 끝나기 전에는 뒤 차례 알림 카드를 만들지 않는다 — 자식 효과가 부모보다 먼저 실행될 수 있기 때문이다
  const [tutorialTriggersReady, setTutorialTriggersReady] = useState(false);
  useEffect(() => { setTutorialTriggersReady(true); }, []);
  // 첫 화면의 안내 창 순서 - 업데이트 소식, 미끼 환불 안내, 오늘의 운세, 튜토리얼, 브라우저 알림 안내. 앞 창이 끝나야 다음 창이 뜬다
  const saveReady = props.syncState === 'on' || props.syncState === 'off';
  const whatsNewPending = useWhatsNewPending();
  const baitRefund = useBaitRefund({
    refund: game.baitRefund, boat: game.boat, ready: saveReady, suspended: whatsNewPending, dispatch: props.dispatch,
  });
  const fortune = useFortuneModal({ ready: saveReady, suspended: whatsNewPending || baitRefund.pending });
  const tutorialPending = useTutorialPending(game.tutorials);
  useLive();
  useLiveNickSync();
  const chat = useChat();
  const spot = useSpotState();
  const liveRegion = resolveLiveRegion(scene, spot.zone);
  useEffect(() => {
    if (chat.enabled) sendRegion(liveRegion);
  }, [chat.enabled, liveRegion]);
  const { activeNotices, endedNotices, stackNotices, dismissNotice } = useNotices();
  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  /** 같은 바다 접속 목록 창 */
  const [playersOpen, setPlayersOpen] = useState(false);
  /** 채팅 이름에서 연 플레이어 정보 — 다른 사람의 글줄이면 그 글줄을 신고할 수 있다 */
  const [player, setPlayer] = useState<PlayerTarget | null>(null);
  const { guild } = useGuild(props.account !== null);
  const accountState = accountLockState(props.account, props.accountFailed);
  const { snap: eventsSnap } = useEvents({ enabled: true });
  const hasActiveEvents = Boolean(eventsSnap?.events.some(ev => ev.active));
  const eventsAlert = hasEventsAlert(eventsSnap, accountState);
  const progress = props.guestProgress;
  // 길드 보너스는 서버가 적용한다. 화면은 서버가 알려 준 레벨과 효과를 보이기만 한다(스탯 창 보너스 탭, 가방 칸)
  const guildBonus = guild ? { level: guild.growth.level, effects: guild.effects, bonuses: guild.bonuses } : null;
  const bagBonus = guildBonus?.effects.bag ?? 0;
  useBagFullAlert(selectBagStatus(game, bagBonus).full);
  useFriendAlerts(props.account !== null, props.setToast);
  useGuildAlerts(props.account !== null, props.setToast, guild);
  useMailAlerts();
  useBountyAlerts(props.setToast);
  useSlotExpiryAlerts(game, props.setToast);
  // 초대 링크로 열렸으면 게임 상태를 불러온 뒤 확인 창을 띄운다. 게스트가 계정 창을 여는 동안은 숨기고, 계정이 생기면 다시 띄운다
  const invite = useGuildInviteLanding();
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountSailIntent, setAccountSailIntent] = useState(false);
  const [manageAccountOpen, setManageAccountOpen] = useState(false);
  const inviteReady = invite.code !== null && props.syncState === 'on' && !accountOpen && props.blocker == null;
  // 방치 결과 보고 — 돌아오면 메시지 창에 한 줄, 오래 비웠으면 알림 카드. 카드의 자세히가 결과 창을 연다
  const away = useAwayReport((s, hasCard) => sendNotice(props.setToast, {
    kind: 'away.summary',
    text: awayLineText(s),
    toastText: `귀환 정산 ${fmtNum(s.catches)}마리 포획`,
    suppressIfAwayCardVisible: hasCard,
  }));
  const [awayOpen, setAwayOpen] = useState(false);
  const closeAway = () => { setAwayOpen(false); away.dismiss(); };
  const log = chat.enabled
    ? mergeMessages(
        mergeMessages(
          mergeMessages(props.log, chatMessages(chat.globalLines, 'global')),
          chatMessages(chat.localLines, 'local'),
        ),
        chatMessages(chat.guildLines, 'guild'),
      )
    : props.log;
  const noticeStrip = activeNotices.length > 0 ? (
    <Tip wraps hoverOnly text="누르면 공지사항 창이 열려요." className="flex w-full min-w-0">
      <Frame
        as="button"
        type="button"
        aria-label="공지사항 열기"
        onClick={() => setNoticeModalOpen(true)}
        className="w-full min-w-0 flex items-center gap-1.5 px-2 py-1 text-xs text-left cursor-pointer border-gold bg-[color-mix(in_oklab,var(--c-bg)_88%,transparent)] hover:bg-[color-mix(in_oklab,var(--c-surface-2)_88%,transparent)] transition-colors"
      >
        <span className="pf-accent shrink-0 bg-gold px-1 py-0.5 text-2xs leading-none font-bold text-bg">공지</span>
        <PixelIcon glyph="megaphone" size={12} className="shrink-0 text-gold" />
        <span className="min-w-0 flex-1 truncate text-left text-text">{activeNotices[0].title}</span>
      </Frame>
    </Tip>
  ) : null;
  const messageFilter = useMessageFilter();
  // 메시지 창 접기 — 채팅을 쓰지 않는 환경에서는 입력 줄이 없어 펼칠 수 없으므로 접지 않는다
  const fold = useMessageFold(scene.kind === 'base', log, messageFilter.filter);
  const folded = chat.enabled && fold.folded;
  const awayCardVisible = Boolean(away.report && !awayOpen);
  const { onMirrorEnv } = props;
  useEffect(() => {
    onMirrorEnv?.({ folded, awayCardVisible });
  }, [onMirrorEnv, folded, awayCardVisible]);
  const encounter = tracking ? selectEncounter(game, tracking, new Date().toISOString()) : null;
  const worldScene = scene.kind === 'region' && scene.id === 'world';
  const region: RegionId = scene.kind === 'region' ? scene.id : BASE_PACKS[scene.id].region;
  // 미니맵의 길드원 점 — 지금 길드원(떠난 선원과 나 제외) 가운데 같은 바다에 접속한 사람
  const guildMates = useMemo(() => {
    const ids = new Set((guild?.members ?? []).filter(m => m.leftAt === null && m.uid !== chat.you).map(m => m.uid));
    return ids.size > 0 ? () => guildMatesIn(region, ids) : undefined;
  }, [guild, region, chat.you]);

  const openAccount = (sailIntent = false) => {
    setAccountSailIntent(sailIntent);
    setAccountOpen(true);
  };
  const reopenManageAccount = () => {
    setActiveTab('settings');
    if (mobile) setSheetOpen(true);
    setManageAccountOpen(true);
  };
  const closeAccount = () => {
    setAccountOpen(false);
    setAccountSailIntent(false);
  };
  const onGuestBlocked = createGuestBlockedNotice({
    accountOpen,
    openAccount: () => openAccount(true),
    onSailIntent: () => setAccountSailIntent(true),
    setToast: props.setToast,
  });

  const resetPanels = () => {
    setActionPanel(null);
    setStatsOpen(false);
    setEffectsOpen(false);
    setAchievementsOpen(false);
    setFortuneOpen(false);
    setRankingOpen(false);
    setEventsOpen(false);
    setTracking(null);
  };

  const go = (nextScene: SceneRef, message: string, entryPos?: Point, returnPos?: Point) => {
    resetPanels();
    props.onScene(nextScene, message, entryPos, returnPos);
  };

  const { confirm, dialogs } = useDialogs();

  const onFacility = (id: FurnitureId) => {
    if (scene.kind !== 'base') return;
    // 빠른 이동 전환 중에는 거점의 이동 동작을 받지 않는다
    if (trip && (id === 'exit' || id === 'travel' || id === 'ferry')) return;
    const pack = BASE_PACKS[scene.id];
    const boarding = boardingOf(scene.id);
    switch (id) {
      case 'sell': case 'rod': case 'boat': case 'bounty': case 'wardrobe': case 'kitchen':
        setActionPanel(panel => panel === id ? null : id);
        return;
      case 'rank':
        setActionPanel(null);
        setRankingOpen(true);
        return;
      case 'exit':
        go({ kind: 'region', id: boarding.region }, boarding.msg, boarding.at);
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

  // 빠른 이동 — 목적지를 고르면 창을 닫고 여객선처럼 확인을 받은 뒤 전환을 시작한다
  const pickPort = (port: BaseId) => {
    setFerryOpen(false);
    if (trip || scene.kind !== 'base') return;
    const name = BASE_PACKS[port].name;
    const detail = scene.id === 'home'
      ? `지금 집을 나서 ${name} 앞바다로 곧바로 옮겨 가요.`
      : `지금 있는 항구를 떠나 ${name}에서 정비를 이어 가요.`;
    void confirm({ layer: 'stage', title: '여객선', body: `여객선을 타고 ${name}에 갈까요?\n${detail}`,
      confirmLabel: `${name}에 가기` })
      .then(ok => { if (ok && scene.kind === 'base') setTrip(current => current ?? { from: scene.id, to: port }); });
  };

  // 전환 1단계 — 지금 거점에서 필드로 나온 모습(집은 문 앞 마을, 항구는 접안을 푼 앞바다)
  const ferrySurface = () => {
    if (!trip) return;
    const b = boardingOf(trip.from);
    resetPanels();
    props.onPlace({ kind: 'region', id: b.region }, b.at);
  };
  // 전환 2단계 — 도착 항구의 승선 자리로 옮기고 서버에 알린다. 실패하면 떠난 거점에 남는다
  const ferryMove = async () => {
    if (!trip) return;
    const b = boardingOf(trip.to);
    const settled = await settleAction(() => props.dispatch({ type: 'travel', to: { kind: 'region', id: b.region } }));
    if (settled.ok) {
      props.onPlace({ kind: 'region', id: b.region }, b.at);
      sendNotice(props.setToast, {
        kind: 'travel.routineMove',
        text: `여객선을 타고 ${BASE_PACKS[trip.to].name} 앞바다에 도착했어요.`,
      });
      return;
    }
    if (settled.notice) {
      sendNotice(props.setToast, {
        kind: 'travel.blocked',
        text: settled.notice,
        cooldownKey: 'travel.blocked:ferry',
      });
    }
    props.onPlace({ kind: 'base', id: trip.from });
  };

  const openStats = () => {
    setStatsInitialTab('summary');
    setStatsOpen(open => !open);
  };
  const openQuests = () => setQuestsOpen(open => !open);
  // 승부 결과 확정 — 서버가 도감·진행도·도전권을 바꾼다. 실패는 감사만 남아 창을 그대로 둔다
  const resolveEncounter = (r: EncounterResult) => {
    if (!encounter) return;
    when(props.dispatch({ type: 'resolveChallenge', questId: encounter.quest.id,
      success: r.success, hits: r.hits, misses: r.misses }), result => {
      if (result.status === 'rejected') {
        sendNotice(props.setToast, { kind: 'system.modalRejected', text: REJECT_TEXT[result.error] });
        setTracking(null);
        return;
      }
      if (r.success) {
        const zoneName = zoneById(encounter.quest.zone)?.shortName ?? encounter.quest.zone;
        sendNotice(props.setToast, {
          kind: 'bounty.challengeResolved',
          text: `${josa(encounter.named.name, '을/를')} 토벌했어요! ${zoneName}의 수배판에서 보상 받기를 눌러 주세요.`,
          toastText: `${encounter.named.name} 토벌 성공!`,
        });
        setTracking(null);
      }
    });
  };
  const onOpenMap = () => setWorldMapOpen(true);

  const enterEventZone = async (eventId: string) => {
    if (eventBusy) return;
    setEventBusy(true);
    try {
      const settled = await settleAction(() => props.dispatch({ type: 'enterEventZone', eventId }));
      if (settled.ok) {
        resetPanels();
        props.onPlace({ kind: 'region', id: 'championship' }, REGION_PACKS.championship.spawn);
        sendNotice(props.setToast, {
          kind: 'travel.routineMove',
          text: `${REGION_PACKS.championship.name}에 입장했어요.`,
        });
        return;
      }
      if (settled.notice) {
        sendNotice(props.setToast, {
          kind: 'travel.blocked',
          text: settled.notice,
          cooldownKey: 'event.enter',
        });
      }
    } finally {
      setEventBusy(false);
    }
  };

  const leaveEventZone = async () => {
    if (eventBusy) return;
    setEventBusy(true);
    try {
      let nextLocation: GameState['location'] | null = null;
      const settled = await settleAction(async () => {
        const res = await props.dispatch({ type: 'leaveEventZone' });
        if (res.status === 'ok') nextLocation = res.state.location;
        return res;
      });
      if (settled.ok) {
        resetPanels();
        const fallbackDest = game.boat < 1
          ? ({ kind: 'region', id: 'village' } as const)
          : ({ kind: 'base', id: 'harbor' } as const);
        const dest = nextLocation ?? fallbackDest;
        props.onPlace(dest);
        const destName = dest.kind === 'base'
          ? BASE_PACKS[dest.id].name
          : REGION_PACKS[dest.id].info.shortName;
        sendNotice(props.setToast, {
          kind: 'travel.routineMove',
          text: `${destName}에 도착했어요.`,
        });
        return;
      }
      if (settled.notice) {
        sendNotice(props.setToast, {
          kind: 'travel.blocked',
          text: settled.notice,
          cooldownKey: 'event.leave',
        });
      }
    } finally {
      setEventBusy(false);
    }
  };

  const settleEventReward = async (eventId: string) => {
    if (eventBusy) return;
    setEventBusy(true);
    try {
      let settledGrant: { gold: number; fame: number } | null = null;
      const settled = await settleAction(async () => {
        const res = await props.dispatch({ type: 'settleEventReward', eventId });
        if (res.status === 'ok' && res.result.type === 'eventSettle') {
          settledGrant = { gold: res.result.gold, fame: res.result.fame };
        }
        return res;
      });
      if (settled.ok) {
        if (settledGrant) {
          const { gold, fame } = settledGrant;
          sendNotice(props.setToast, {
            kind: 'achievement.claimed',
            text: `대회 보상을 정산해 골드 ${fmtNum(gold)}G와 명성 ${fmtNum(fame)}을 받았어요.`,
            toastText: `대회 보상 ${fmtNum(gold)}G 정산!`,
          });
        }
        return;
      }
      if (settled.notice) {
        sendNotice(props.setToast, {
          kind: 'system.modalRejected',
          text: settled.notice,
        });
      }
    } finally {
      setEventBusy(false);
    }
  };

  return (
    <div ref={windowHostRef} className={cx('group/root fixed inset-0 flex overflow-hidden overscroll-none', mobile && 'flex-col')}
         style={keyboardStyle(visible)}
         data-keyboard={visible.keyboard ? '' : undefined}>
      <GameStageLayout>
        {scene.kind === 'base' ? (
          <BaseMenu key={scene.id} base={scene.id} game={game} onFacility={onFacility} locked={trip !== null} accountState={accountState} />
        ) : (
          <Field key={scene.id} region={scene.id} game={game} dispatch={props.dispatch} setToast={props.setToast}
                 onScene={go} guest={isConfirmedGuest(props.account, props.accountChecked)} onGuestBlocked={onGuestBlocked} paused={encounter !== null || props.blocker != null}
                 initialPos={props.entryPos ?? undefined} placeSeq={props.placeSeq}
                 locked={trip !== null} statusSlot={statusSlot} catchSlot={catchSlot} uid={props.uid} saveVersion={props.saveVersion} />
        )}

        <HudLayout game={game} bagBonus={bagBonus} scene={scene} log={log} covered={covered}
                   logTopSlot={noticeStrip}
                   logFooter={chat.enabled ? (
                     <ChatBar inGuild={guild !== null} accountState={accountState}
                              folded={folded} unread={fold.unread} onUnfold={fold.toggle} onTyping={fold.setTyping} />
                   ) : null}
                   filter={messageFilter.filter} onToggleFilter={messageFilter.toggle}
                   folded={folded} onFold={chat.enabled ? fold.toggle : undefined}
                   onStatusSlot={setStatusSlot}
                   onCatchSlot={setCatchSlot}
                   onPickLine={chat.enabled ? m => {
                     if (!m.from) return;
                     setPlayer({ uid: m.from.uid, nick: m.author ?? '', chatId: m.from.uid === chat.you ? undefined : m.from.chatId });
                   } : undefined}
                   you={chat.you}
                   guildMates={guildMates}
                   channels={chat.enabled ? FILTER_CHANNELS : undefined}
                   disabledChannels={guild === null ? GUILD_OFF : undefined}
                   onOpenStats={openStats} onOpenEffects={() => setEffectsOpen(open => !open)} onOpenMap={onOpenMap}
                   notice={atSea || (away.report && !awayOpen) ? (
                     <div className="flex flex-col gap-2">
                       {away.report && !awayOpen && (
                         <AwayCard report={away.report} onClose={away.dismiss} onDetail={() => setAwayOpen(true)} />
                       )}
                       {atSea && <TraceCard onTrack={setTracking} />}
                     </div>
                   ) : null}
                   chips={showPresence ? <PresenceChip region={region} onOpen={() => setPlayersOpen(true)} /> : null}
                   badge={props.badge} accountState={accountState}
                   eventButton={hasActiveEvents ? (
                     mobile ? (
                       <MobileEventHudButton
                         open={eventsOpen}
                         alert={eventsAlert}
                         onClick={() => setEventsOpen(open => !open)}
                       />
                     ) : (
                       <EventHudButton
                         open={eventsOpen}
                         alert={eventsAlert}
                         onClick={() => setEventsOpen(open => !open)}
                       />
                     )
                   ) : null}
                   menu={(
                     <GameMenu game={game} account={props.account} accountState={accountState} setToast={props.setToast} onQuests={openQuests}
                               onAchievements={() => setAchievementsOpen(true)}
                               onFortune={() => setFortuneOpen(true)}
                               onGuild={() => setGuildOpen(true)} onFriends={() => setFriendsOpen(true)}
                               onMailbox={() => setMailboxOpen(true)} />
                   )} />
        {dialogs}
        {encounter && (
          <EncounterModal key={encounter.quest.id} data={encounter}
                          onResolve={resolveEncounter} onClose={() => setTracking(null)} />
        )}

        {statsOpen && (
          <StatsModal game={game} guild={guildBonus} initialTab={statsInitialTab}
                      movement={scene.kind === 'region' ? REGION_PACKS[scene.id].movement : 'walk'}
                      region={region} nickname={props.nickname} profileStatus={props.profileStatus}
                      onClose={() => setStatsOpen(false)} />
        )}
        {effectsOpen && (
          <ActiveEffectsModal
            game={game}
            onClose={() => setEffectsOpen(false)}
            onOpenBag={() => {
              setEffectsOpen(false);
              setBagSection('items');
              setActiveTab('bag');
              if (mobile) setSheetOpen(true);
            }}
            onOpenStatsBonus={() => {
              setEffectsOpen(false);
              setStatsInitialTab('bonus');
              setStatsOpen(true);
            }}
          />
        )}
        {questsOpen && <QuestInfoModal game={game} onClose={() => setQuestsOpen(false)} />}
        {achievementsOpen && (
          <AchievementsModal game={game} guest={accountState !== 'account'} dispatch={props.dispatch}
                             setToast={props.setToast}
                             onOpenStatsBonus={() => {
                               setAchievementsOpen(false);
                               setStatsInitialTab('bonus');
                               setStatsOpen(true);
                             }}
                             onClose={() => setAchievementsOpen(false)} />
        )}
        {fortuneOpen && (
          <FortuneCalendarModal gameFortune={game.fortune} accountState={accountState} onClose={() => setFortuneOpen(false)} />
        )}
        {rankingOpen && <RankingModal onClose={() => setRankingOpen(false)} />}
        {away.report && awayOpen && (
          <AwayReportModal report={away.report} game={game} onClose={closeAway}
                           onOpenBag={() => { closeAway(); setActiveTab('bag'); }} />
        )}
        {friendsOpen && <FriendsModal setToast={props.setToast} onClose={() => setFriendsOpen(false)} />}
        {guildOpen && <GuildModal gold={game.gold} artifacts={game} setToast={props.setToast} onGoldChanged={props.onResync} onClose={() => setGuildOpen(false)} />}
        {inviteReady && invite.code && (
          <GuildInviteDialog code={invite.code} account={props.account} setToast={props.setToast}
                             onAccount={() => openAccount(false)} onClose={invite.clear} />
        )}
        <GoogleReturn setToast={props.setToast} progress={progress}
                      reopenAccount={origin => (origin === 'manage' ? reopenManageAccount() : openAccount(false))} />
        {accountOpen && (
          <AccountModal layer="stage" mode="connect" setToast={props.setToast} onAuthChanged={props.onAuthChanged} account={props.account} accountFailed={props.accountFailed}
                        syncLabel={props.syncLabel} syncState={props.syncState} sailReturn={accountSailIntent} onClose={closeAccount} />
        )}
        {playersOpen && showPresence && (
          <PlayersModal region={region} account={props.account} accountFailed={props.accountFailed} setToast={props.setToast} onClose={() => setPlayersOpen(false)} />
        )}
        {player && (
          <PlayerModal target={player} self={player.uid === chat.you} account={props.account} accountFailed={props.accountFailed}
                       setToast={props.setToast} onClose={() => setPlayer(null)} />
        )}
        {mailboxOpen && (
          <MailboxModal dispatch={props.dispatch} setToast={props.setToast} onClose={() => setMailboxOpen(false)} />
        )}
        {eventsOpen && (
          <EventsModal
            accountState={accountState}
            game={game}
            nickname={props.nickname}
            busy={eventBusy}
            onEnterEventZone={enterEventZone}
            onLeaveEventZone={leaveEventZone}
            onSettleEventReward={settleEventReward}
            onConnectGoogle={() => {
              setEventsOpen(false);
              openAccount(false);
            }}
            onClose={() => setEventsOpen(false)}
          />
        )}

        {trip && <FerryVeil onSurface={ferrySurface} onMove={ferryMove} onDone={() => setTrip(null)} />}
        {ferryOpen && scene.kind === 'base' && (
          <FerryModal game={game} from={scene.id} onPick={pickPort} onClose={() => setFerryOpen(false)} />
        )}
        {actionPanel && (
          <FacilityModal panel={actionPanel} game={game} dispatch={props.dispatch}
                         base={scene.kind === 'base' ? scene.id : undefined} uid={props.uid}
                         sellBonus={guildBonus?.effects.sell ?? 0} accountState={accountState}
                         setToast={props.setToast} onClose={() => setActionPanel(null)} />
        )}
        {worldMapOpen && <WorldMapModal world={worldScene} onClose={() => setWorldMapOpen(false)} />}
        {/* 세이브가 준비된 뒤(서버 연결 또는 로컬)에만 소식 창을 계획한다 */}
        <WhatsNewModal game={game} ready={saveReady} />
        {baitRefund.notice && <BaitRefundModal notice={baitRefund.notice} onClose={baitRefund.close} />}
        {fortune.fortune && <FortuneModal fortune={fortune.fortune} onClose={fortune.close} />}
        <TutorialModal seen={game.tutorials} ready={saveReady} after={baitRefund.pending || fortune.pending} dispatch={props.dispatch} />
        {tutorialTriggersReady && (
          <AlertPromptModal ready={saveReady} after={whatsNewPending || baitRefund.pending || fortune.pending || tutorialPending || inviteReady || accountOpen} setToast={props.setToast} />
        )}
        <NoticeModal open={noticeModalOpen} activeNotices={activeNotices} endedNotices={endedNotices} onClose={() => setNoticeModalOpen(false)} />
        <NoticeStack notices={stackNotices} onDismiss={dismissNotice} />
        {props.toasts && props.toasts.length > 0 && props.onDismissToast && (
          <FloatingToastLayer toasts={props.toasts} maxVisible={mobile ? 2 : 3} onDismiss={props.onDismissToast} />
        )}
      </GameStageLayout>

      <GameTabs
        region={region}
        activeTab={activeTab} setActiveTab={setActiveTab}
        sheetOpen={sheetOpen} onSheetOpenChange={setSheetOpen}
        manageAccountOpen={manageAccountOpen} onManageAccountOpenChange={setManageAccountOpen}
        game={game} sellBonus={guildBonus?.effects.sell ?? 0} bagBonus={bagBonus} dispatch={props.dispatch} setToast={props.setToast}
        syncLabel={props.syncLabel} syncState={props.syncState}
        account={props.account} accountChecked={props.accountChecked} accountFailed={props.accountFailed} uid={props.uid} onAuthChanged={props.onAuthChanged}
        nickname={props.nickname} profileStatus={props.profileStatus} onRename={props.onRename}
      />

      {props.blocker}
    </div>
  );
}
