import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type {
  PipBagTone,
  PipCatchItem,
  PipLeapTrigger,
  PipScalePreset,
  PipSpotInfo,
} from '../../../features/pip/model/pipMonitor';
import type { Look } from '../../../game/content/wardrobe';
import type { FishArtStyle } from '../../../game/rendering/pixel/fishArt';
import PixelIcon from '../PixelIcon';
import Tip from '../Tip';
import { cx } from '../cx';
import HeaderFrame from '../hud/HeaderFrame';
import { HEADER_BUTTON_GAP_CLASS, HEADER_BUTTON_ICON_CLASS, HEADER_BUTTON_LABEL_CLASS } from '../hud/headerTier';
import PipFloatingTip, { type PipTipState } from './PipFloatingTip';
import PipMonitorView from './PipMonitorView';

/** PC 스테이지 HUD 좌상단 정사각형 미니창 열기/닫기 버튼 */
export function PipHudButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <Tip wraps hoverOnly text={open ? '미니창 닫기' : '미니창 열기'}>
      <HeaderFrame
        as="button"
        square
        aria-label={open ? '미니창 닫기' : '미니창 열기'}
        aria-pressed={open}
        onClick={onToggle}
        className={cx(
          'relative inline-flex flex-col items-center justify-center cursor-pointer',
          HEADER_BUTTON_GAP_CLASS,
          open ? 'text-gold border-gold' : 'text-text-dim hover:text-gold',
        )}
      >
        <PixelIcon glyph="pip" size={18} className={HEADER_BUTTON_ICON_CLASS} />
        <span className={cx(HEADER_BUTTON_LABEL_CLASS, 'font-bold leading-none tracking-tight')} aria-hidden="true">
          미니창
        </span>
      </HeaderFrame>
    </Tip>
  );
}

interface PipMonitorPortalProps {
  pipWindow: Window;
  spotInfo: PipSpotInfo;
  look: Look;
  fishingActive: boolean;
  bagCount: number;
  bagCap: number;
  bagPercent: number;
  bagFull: boolean;
  bagTone: PipBagTone;
  clockText: string;
  daytime: boolean;
  displayGameHour: number;
  getLiveGameHour: () => number;
  fishArtStyle: FishArtStyle;
  recentCatches: readonly PipCatchItem[];
  leapTrigger: PipLeapTrigger | null;
  catchFxSeq: number;
  exitingLogItem: PipCatchItem | null;
  scalePreset: PipScalePreset;
  zoom: number;
  onCycleScale: () => void;
  onFocusGameTab: () => void;
}

/** 열린 Document Picture-in-Picture 창 본문에 미니 모니터를 포털로 마운트한다 */
export default function PipMonitorPortal({
  pipWindow,
  spotInfo,
  look,
  fishingActive,
  bagCount,
  bagCap,
  bagPercent,
  bagFull,
  bagTone,
  clockText,
  daytime,
  displayGameHour,
  getLiveGameHour,
  fishArtStyle,
  recentCatches,
  leapTrigger,
  catchFxSeq,
  exitingLogItem,
  scalePreset,
  zoom,
  onCycleScale,
  onFocusGameTab,
}: PipMonitorPortalProps) {
  const [tipEntry, setTipEntry] = useState<{
    tip: PipTipState;
    catchFxSeq: number;
    fishingActive: boolean;
  } | null>(null);
  const tip =
    tipEntry && tipEntry.catchFxSeq === catchFxSeq && tipEntry.fishingActive === fishingActive
      ? tipEntry.tip
      : null;

  const subscribeMotion = useCallback((listener: () => void) => {
    const mq = pipWindow.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return () => {};
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [pipWindow]);
  const getMotionSnapshot = useCallback(
    () => Boolean(pipWindow.matchMedia?.('(prefers-reduced-motion: reduce)').matches),
    [pipWindow],
  );
  const reducedMotion = useSyncExternalStore(subscribeMotion, getMotionSnapshot, () => false);

  const showTip = useCallback((text: string, element: HTMLElement) => {
    setTipEntry({
      tip: { text, anchorRect: element.getBoundingClientRect() },
      catchFxSeq,
      fishingActive,
    });
  }, [catchFxSeq, fishingActive]);

  const hideTip = useCallback(() => {
    setTipEntry(null);
  }, []);

  useEffect(() => {
    const pipDoc = pipWindow.document;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTipEntry(null);
    };
    const onDismiss = () => setTipEntry(null);
    pipDoc.addEventListener('keydown', onKeyDown);
    pipWindow.addEventListener('blur', onDismiss);
    pipWindow.addEventListener('resize', onDismiss);
    return () => {
      pipDoc.removeEventListener('keydown', onKeyDown);
      pipWindow.removeEventListener('blur', onDismiss);
      pipWindow.removeEventListener('resize', onDismiss);
    };
  }, [pipWindow]);

  if (pipWindow.closed) return null;

  return createPortal(
    <>
      <PipMonitorView
        spotInfo={spotInfo}
        look={look}
        fishingActive={fishingActive}
        bagCount={bagCount}
        bagCap={bagCap}
        bagPercent={bagPercent}
        bagFull={bagFull}
        bagTone={bagTone}
        clockText={clockText}
        daytime={daytime}
        displayGameHour={displayGameHour}
        getLiveGameHour={getLiveGameHour}
        fishArtStyle={fishArtStyle}
        recentCatches={recentCatches}
        leapTrigger={leapTrigger}
        catchFxSeq={catchFxSeq}
        exitingLogItem={exitingLogItem}
        scalePreset={scalePreset}
        zoom={zoom}
        reducedMotion={reducedMotion}
        onCycleScale={onCycleScale}
        onFocusGameTab={onFocusGameTab}
        onShowTip={showTip}
        onHideTip={hideTip}
      />
      <PipFloatingTip tip={tip} />
    </>,
    pipWindow.document.body,
  );
}
