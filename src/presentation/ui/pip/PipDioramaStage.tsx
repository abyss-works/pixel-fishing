import { useEffect, useRef } from 'react';
import {
  computePipLeapFrame,
  PIP_JUMP_DURATION_S,
  type PipBagTone,
  type PipCatchItem,
  type PipLeapTrigger,
  type PipScalePreset,
  type PipSpotInfo,
} from '../../../features/pip/model/pipMonitor';
import type { FishArtStyle } from '../../../game/rendering/pixel/fishArt';
import { renderPipDiorama } from '../../../game/rendering/canvas/scenes/pipDiorama';
import PixelIcon from '../PixelIcon';
import { cx } from '../cx';

const CALM_FRAME_MS = 125;

interface PipDioramaStageProps {
  spotInfo: PipSpotInfo;
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
  leapTrigger: PipLeapTrigger | null;
  scalePreset: PipScalePreset;
  reducedMotion: boolean;
  onCycleScale: () => void;
  onFocusGameTab: () => void;
  onShowTip: (text: string, element: HTMLElement) => void;
  onHideTip: () => void;
}

/** PiP 상단 픽셀 디오라마 캔버스와 4모서리 HUD 오버레이 */
export default function PipDioramaStage({
  spotInfo,
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
  leapTrigger,
  scalePreset,
  reducedMotion,
  onCycleScale,
  onFocusGameTab,
  onShowTip,
  onHideTip,
}: PipDioramaStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const getLiveGameHourRef = useRef(getLiveGameHour);
  const displayGameHourRef = useRef(displayGameHour);
  useEffect(() => {
    getLiveGameHourRef.current = getLiveGameHour;
    displayGameHourRef.current = displayGameHour;
  }, [getLiveGameHour, displayGameHour]);

  const leapStateRef = useRef<{ item: PipCatchItem; elapsedS: number; seq: number } | null>(null);
  const lastAppliedLeapSeqRef = useRef(0);

  useEffect(() => {
    if (!leapTrigger || !fishingActive) {
      leapStateRef.current = null;
      return;
    }
    if (leapTrigger.seq <= lastAppliedLeapSeqRef.current) return;
    lastAppliedLeapSeqRef.current = leapTrigger.seq;
    leapStateRef.current = {
      seq: leapTrigger.seq,
      item: leapTrigger.item,
      elapsedS: 0,
    };
  }, [leapTrigger, fishingActive]);

  useEffect(() => {
    if (!reducedMotion) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const activeItem = leapStateRef.current?.item ?? null;
    renderPipDiorama(ctx, canvas.width, canvas.height, {
      timeMs: 0,
      gameHour: getLiveGameHourRef.current() ?? displayGameHourRef.current,
      fishingActive,
      spotName: spotInfo.spotName,
      seaTheme: spotInfo.seaTheme,
      fishArtStyle,
      reducedMotion: true,
      leap: fishingActive && activeItem
        ? {
            elapsedS: PIP_JUMP_DURATION_S / 2,
            flipped: false,
            rarity: activeItem.rarity,
            form: activeItem.form,
            fishSubject: activeItem.fishSubject,
          }
        : null,
    });
  }, [spotInfo.spotName, spotInfo.seaTheme, fishingActive, reducedMotion, displayGameHour, leapTrigger, fishArtStyle]);

  // 애니메이션 루프와 visibilitychange 리스너를 오프너가 아닌 PiP 창 컨텍스트에 직접 바인딩한다
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;
    const ctx = canvas.getContext('2d');
    const pipDoc = canvas.ownerDocument;
    const pipWin = pipDoc.defaultView;
    if (!ctx || !pipWin) return;

    let rafId = 0;
    let lastDrawnMs = -Infinity;
    let lastTickMs = pipWin.performance.now();

    const drawFrame = (nowMs: number) => {
      const dt = Math.min(0.1, Math.max(0, (nowMs - lastTickMs) / 1000));
      lastTickMs = nowMs;

      const leap = leapStateRef.current;
      if (leap) {
        leap.elapsedS += dt;
        if (leap.elapsedS >= PIP_JUMP_DURATION_S) {
          leapStateRef.current = null;
        }
      }

      const activeLeap = leapStateRef.current;
      const frameBudget = activeLeap ? 14 : CALM_FRAME_MS;
      if (nowMs - lastDrawnMs >= frameBudget) {
        lastDrawnMs = nowMs;
        const frame = activeLeap ? computePipLeapFrame(activeLeap.elapsedS) : null;
        renderPipDiorama(ctx, canvas.width, canvas.height, {
          timeMs: nowMs,
          gameHour: getLiveGameHourRef.current(),
          fishingActive,
          spotName: spotInfo.spotName,
          seaTheme: spotInfo.seaTheme,
          fishArtStyle,
          reducedMotion: false,
          leap: activeLeap && frame?.active
            ? {
                elapsedS: activeLeap.elapsedS,
                flipped: frame.flipped,
                rarity: activeLeap.item.rarity,
                form: activeLeap.item.form,
                fishSubject: activeLeap.item.fishSubject,
              }
            : null,
        });
      }
    };

    const tick = (nowMs: number) => {
      if (pipDoc.hidden) {
        rafId = 0;
        return;
      }
      drawFrame(nowMs);
      rafId = pipWin.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (rafId !== 0 || pipDoc.hidden) return;
      lastTickMs = pipWin.performance.now();
      lastDrawnMs = -Infinity;
      drawFrame(lastTickMs);
      rafId = pipWin.requestAnimationFrame(tick);
    };

    const handleVisibility = () => {
      if (pipDoc.hidden) {
        if (rafId !== 0) {
          pipWin.cancelAnimationFrame(rafId);
          rafId = 0;
        }
      } else {
        startLoop();
      }
    };

    startLoop();
    pipDoc.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (rafId !== 0) {
        pipWin.cancelAnimationFrame(rafId);
      }
      pipDoc.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [spotInfo.spotName, spotInfo.seaTheme, fishingActive, reducedMotion, fishArtStyle]);

  const bagTipText = `가방 ${bagCount.toLocaleString('ko-KR')} / ${bagCap.toLocaleString('ko-KR')}`;
  const spotStatusLabel = fishingActive ? '낚시 중' : '대기 중';
  const spotTipText = `${spotInfo.spotName} (${spotStatusLabel})`;
  const focusTipText = bagFull
    ? '가방이 가득 찼어요\n누르면 게임 탭으로 이동해요'
    : '게임 탭으로 이동';

  return (
    <div className="pf-pip-stage" data-sea-theme={spotInfo.seaTheme}>
      <canvas
        ref={canvasRef}
        className="pf-pip-canvas"
        width={420}
        height={112}
        aria-label="실시간 바다 낚시 디오라마"
      />

      <div
        className="pf-pip-spot-chip pf-pip-glass"
        tabIndex={0}
        aria-label={spotTipText}
        onMouseEnter={e => onShowTip(spotTipText, e.currentTarget)}
        onMouseLeave={onHideTip}
        onFocus={e => onShowTip(spotTipText, e.currentTarget)}
        onBlur={onHideTip}
      >
        <span className={cx('pf-pip-dot', !fishingActive && 'is-idle')} />
        <span className="pf-pip-spot-name">{spotInfo.spotName}</span>
      </div>

      <div className="pf-pip-time-chip pf-pip-glass">
        <PixelIcon glyph={daytime ? 'sun' : 'moon'} size={12} />
        <span className="pf-pip-num">{clockText}</span>
      </div>

      <div className="pf-pip-actions">
        <button
          type="button"
          className={cx('pf-pip-icon-btn', scalePreset !== 100 && 'is-active')}
          aria-label={`창 크기 ${scalePreset}%`}
          onClick={onCycleScale}
          onMouseEnter={e => onShowTip(`창 크기 ${scalePreset}%`, e.currentTarget)}
          onMouseLeave={onHideTip}
          onFocus={e => onShowTip(`창 크기 ${scalePreset}%`, e.currentTarget)}
          onBlur={onHideTip}
        >
          <PixelIcon glyph="pipScale" size={12} />
        </button>
        <button
          type="button"
          className={cx('pf-pip-icon-btn', bagFull && 'is-bag-full')}
          aria-label="게임 탭으로 이동"
          onClick={onFocusGameTab}
          onMouseEnter={e => onShowTip(focusTipText, e.currentTarget)}
          onMouseLeave={onHideTip}
          onFocus={e => onShowTip(focusTipText, e.currentTarget)}
          onBlur={onHideTip}
        >
          <PixelIcon glyph="external" size={12} />
        </button>
      </div>

      <div
        className="pf-pip-bag-hud pf-pip-glass"
        tabIndex={0}
        aria-label={bagTipText}
        onMouseEnter={e => onShowTip(bagTipText, e.currentTarget)}
        onMouseLeave={onHideTip}
        onFocus={e => onShowTip(bagTipText, e.currentTarget)}
        onBlur={onHideTip}
      >
        <span className={cx('pf-pip-bag-pct pf-pip-num', bagTone === 'warn' && 'is-warn', bagTone === 'danger' && 'is-danger')}>
          {bagPercent}%
        </span>
        <div className="pf-pip-bag-track" aria-hidden="true">
          <div
            className={cx('pf-pip-bag-fill', bagTone === 'warn' && 'is-warn', bagTone === 'danger' && 'is-danger')}
            style={{ height: `${bagPercent}%` }}
          />
        </div>
        <span className={cx('pf-pip-bag-icon', bagTone === 'danger' && 'is-danger')} aria-hidden="true">
          <PixelIcon glyph="backpack" size={12} />
        </span>
      </div>
    </div>
  );
}
