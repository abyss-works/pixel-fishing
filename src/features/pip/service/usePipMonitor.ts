// 브라우저 Document PiP 미니 모니터 수명주기와 실시간 상태 연동을 묶는 훅.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import type { GameState } from '../../../game/rules/logic';
import { formatGameClock, gameHour, isNight } from '../../../game/rules/time';
import type { SceneRef } from '../../../game/world';
import {
  injectPipStyles,
  isDocumentPipSupported,
  openDocumentPipWindow,
  resizeDocumentPipWindow,
} from '../../../platform/api/documentPip';
import { useFishArtStyle } from '../../display/service/fishArtStyle';
import { useFxDirective } from '../../display/service/fxPlayback';
import { usePhaseOverride, useTimeOverride } from '../../gameplay/service/timeOverride';
import { useNow } from '../../gameplay/service/useGameTime';
import { selectBagStatus } from '../../inventory/model/selectors';
import { useSpotState } from '../../travel/service/useSpotState';
import {
  computePipWallClockGameHour,
  computeScaledPipSize,
  getPipBagTone,
  initialPipMonitorState,
  nextPipScalePreset,
  parsePipScalePreset,
  PIP_AUTOCLOSE_GRACE_MS,
  PIP_LOG_EXIT_MS,
  PIP_SCALE_STORAGE_KEY,
  pipMonitorReducer,
  resolvePipAvatarLook,
  resolvePipSpotInfo,
  type PipScalePreset,
} from '../model/pipMonitor';
import { getPipLiveState, subscribePipLiveState } from './pipLiveStore';

function readStoredScale(): PipScalePreset {
  try {
    if (typeof localStorage === 'undefined') return 100;
    return parsePipScalePreset(localStorage.getItem(PIP_SCALE_STORAGE_KEY));
  } catch {
    return 100;
  }
}

function writeStoredScale(preset: PipScalePreset): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PIP_SCALE_STORAGE_KEY, String(preset));
  } catch {
    // 저장소 접근 제한 무시
  }
}

export function usePipMonitor({
  game,
  scene,
  bagBonus = 0,
  pipCss,
}: {
  game: GameState;
  scene: SceneRef;
  bagBonus?: number;
  pipCss: string;
}) {
  const supported = useMemo(() => isDocumentPipSupported(), []);
  const live = useSyncExternalStore(subscribePipLiveState, getPipLiveState, getPipLiveState);
  const currentSpot = useSpotState();
  const nowIso = useNow(5_000);
  const timeOverride = useTimeOverride();
  const phaseOverride = usePhaseOverride();
  const fishArtStyle = useFishArtStyle();

  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipWindowRef = useRef<Window | null>(null);
  const openedAtRef = useRef(0);
  const openingRef = useRef(false);

  const [scalePreset, setScalePreset] = useState<PipScalePreset>(() => readStoredScale());
  const scalePresetRef = useRef<PipScalePreset>(scalePreset);
  const [monitorState, dispatchMonitor] = useReducer(pipMonitorReducer, initialPipMonitorState);
  const lastSeenEventIdRef = useRef<string | null>(null);
  const lastPlayedFxSeqRef = useRef(-1);
  const fxDirective = useFxDirective('pip');

  useEffect(() => {
    pipWindowRef.current = pipWindow;
  }, [pipWindow]);

  useEffect(() => {
    scalePresetRef.current = scalePreset;
  }, [scalePreset]);

  const spotInfo = useMemo(
    () => resolvePipSpotInfo({ scene, currentSpot, game }),
    [scene, currentSpot, game],
  );
  const avatarLook = useMemo(
    () => resolvePipAvatarLook(game.look, scene),
    [game.look, scene],
  );
  const fishingActive = spotInfo.inRegion && live.fishingPhase !== 'idle';
  const bag = useMemo(() => selectBagStatus(game, bagBonus), [game, bagBonus]);
  const bagTone = getPipBagTone(bag.percent);
  const scaledSize = useMemo(() => computeScaledPipSize(scalePreset), [scalePreset]);

  const displayGameHour = useMemo(() => {
    if (phaseOverride === 'night') return 0;
    if (phaseOverride === 'day') return 12;
    return gameHour(nowIso) ?? 12;
  }, [nowIso, phaseOverride]);

  const getLiveGameHour = useCallback(() => {
    if (phaseOverride === 'night') return 0;
    if (phaseOverride === 'day') return 12;
    if (timeOverride) return gameHour(timeOverride) ?? 12;
    return computePipWallClockGameHour(Date.now());
  }, [phaseOverride, timeOverride]);

  const isOpen = pipWindow !== null && !pipWindow.closed;

  // 실시간 포획 버퍼를 PiP 상태에 반영 — 창이 열려 있고 새 어획이 들어왔을 때만 도약·슬라이드 연출을 켠다
  useEffect(() => {
    const incoming = live.recentCatches[0] ?? null;
    if (!incoming) {
      lastSeenEventIdRef.current = null;
      dispatchMonitor({ type: 'hydrate', recentCatches: [] });
      return;
    }
    if (!isOpen) {
      lastSeenEventIdRef.current = incoming.eventId;
      dispatchMonitor({ type: 'hydrate', recentCatches: live.recentCatches });
      return;
    }
    if (lastSeenEventIdRef.current === incoming.eventId) {
      return;
    }
    lastSeenEventIdRef.current = incoming.eventId;
    dispatchMonitor({ type: 'append', item: incoming });
  }, [live.recentCatches, isOpen]);

  // 효과 지시는 같은 사건의 버퍼 항목에 붙인다 — 지시와 버퍼 중 어느 쪽이 먼저 와도 한 번만 재생하고,
  // 창이 닫혀 있는 동안 온 지시는 재생하지 않고 소비한다
  const latestCatch = live.recentCatches[0] ?? null;
  useEffect(() => {
    if (!fxDirective || fxDirective.seq === lastPlayedFxSeqRef.current) return;
    const { request } = fxDirective;
    if (request.kind === 'live.peerCatch' || request.kind === 'catch.judgment' || !latestCatch || request.subject.eventId !== latestCatch.eventId) return;
    lastPlayedFxSeqRef.current = fxDirective.seq;
    if (isOpen) dispatchMonitor({ type: 'play', item: latestCatch, intensity: fxDirective.intensity });
  }, [fxDirective, latestCatch, isOpen]);

  // 퇴장 중인 4번째 일지 행은 240ms 전환 뒤 DOM에서 비운다
  useEffect(() => {
    if (!monitorState.exitingLogItem) return;
    const timer = window.setTimeout(() => {
      dispatchMonitor({ type: 'clear_exiting_log' });
    }, PIP_LOG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [monitorState.exitingLogItem, monitorState.catchFxSeq]);

  // 비낚시 상태로 바뀌면 진행 중인 도약·일지 퇴장 연출을 즉시 정리한다
  useEffect(() => {
    if (!fishingActive) {
      dispatchMonitor({ type: 'reset_fx' });
    }
  }, [fishingActive]);

  // 창이 열려 있는 동안 오프너 탭 복귀 시 자동 닫기 및 오프너 탭 종료·이동 시 PiP 창도 함께 닫는다
  useEffect(() => {
    if (!pipWindow) return;
    const onPipPageHide = () => {
      if (pipWindowRef.current === pipWindow) {
        pipWindowRef.current = null;
      }
      setPipWindow(current => (current === pipWindow ? null : current));
    };
    const onOpenerUnload = () => {
      if (!pipWindow.closed) pipWindow.close();
    };
    const closeOnReturn = () => {
      if (
        Date.now() - openedAtRef.current >= PIP_AUTOCLOSE_GRACE_MS
        && !document.hidden
        && document.hasFocus()
        && !pipWindow.closed
      ) {
        pipWindow.close();
        if (pipWindowRef.current === pipWindow) {
          pipWindowRef.current = null;
        }
        setPipWindow(current => (current === pipWindow ? null : current));
      }
    };
    pipWindow.addEventListener('pagehide', onPipPageHide);
    window.addEventListener('beforeunload', onOpenerUnload);
    window.addEventListener('pagehide', onOpenerUnload);
    window.addEventListener('focus', closeOnReturn);
    document.addEventListener('visibilitychange', closeOnReturn);
    return () => {
      pipWindow.removeEventListener('pagehide', onPipPageHide);
      window.removeEventListener('beforeunload', onOpenerUnload);
      window.removeEventListener('pagehide', onOpenerUnload);
      window.removeEventListener('focus', closeOnReturn);
      document.removeEventListener('visibilitychange', closeOnReturn);
    };
  }, [pipWindow]);

  // 훅 언마운트 시 열려 있는 PiP 창 정리
  useEffect(() => () => {
    const win = pipWindowRef.current;
    if (win && !win.closed) win.close();
  }, []);

  const togglePip = useCallback(async () => {
    if (!supported || openingRef.current) return;
    const activeWin = pipWindowRef.current;
    if (activeWin && !activeWin.closed) {
      activeWin.close();
      pipWindowRef.current = null;
      setPipWindow(null);
      return;
    }

    openingRef.current = true;
    try {
      const { width, height } = computeScaledPipSize(scalePresetRef.current);
      const win = await openDocumentPipWindow({
        width,
        height,
        disallowReturnToOpener: true,
        preferInitialWindowPlacement: false,
      });
      openedAtRef.current = Date.now();
      injectPipStyles(win.document, pipCss);
      const latest = getPipLiveState().recentCatches;
      lastSeenEventIdRef.current = latest[0]?.eventId ?? null;
      dispatchMonitor({ type: 'hydrate', recentCatches: latest });
      pipWindowRef.current = win;
      setPipWindow(win);
    } catch {
      // 사용자 제스처 만료 또는 브라우저 거부는 무시한다
    } finally {
      openingRef.current = false;
    }
  }, [supported, pipCss]);

  const cycleScale = useCallback(() => {
    const next = nextPipScalePreset(scalePresetRef.current);
    scalePresetRef.current = next;
    setScalePreset(next);
    writeStoredScale(next);
    const activeWin = pipWindowRef.current;
    if (activeWin && !activeWin.closed) {
      const { width, height } = computeScaledPipSize(next);
      resizeDocumentPipWindow(activeWin, width, height);
    }
  }, []);

  const focusGameTab = useCallback(() => {
    const win = pipWindowRef.current;
    if (win && !win.closed) {
      win.close();
      pipWindowRef.current = null;
      setPipWindow(null);
    }
    window.focus();
  }, []);

  return {
    supported,
    isOpen,
    pipWindow,
    scalePreset,
    zoom: scaledSize.zoom,
    spotInfo,
    avatarLook,
    fishingActive,
    bag,
    bagTone,
    clockText: formatGameClock(nowIso),
    daytime: phaseOverride ? phaseOverride === 'day' : !isNight(nowIso),
    displayGameHour,
    getLiveGameHour,
    fishArtStyle,
    recentCatches: monitorState.recentCatches,
    leapTrigger: monitorState.leapTrigger,
    catchFxSeq: monitorState.catchFxSeq,
    exitingLogItem: monitorState.exitingLogItem,
    togglePip,
    cycleScale,
    focusGameTab,
  };
}
