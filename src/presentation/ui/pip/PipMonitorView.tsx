import {
  formatPipCatchTip,
  type PipBagTone,
  type PipCatchItem,
  type PipLeapTrigger,
  type PipScalePreset,
  type PipSpotInfo,
} from '../../../features/pip/model/pipMonitor';
import type { Look } from '../../../game/content/wardrobe';
import type { FishArtStyle } from '../../../game/rendering/pixel/fishArt';
import PixelIcon from '../PixelIcon';
import { cx } from '../cx';
import FishSprite from '../fish/FishSprite';
import PipDioramaStage from './PipDioramaStage';

const MUTANT_WISP_SPECS = [
  { left: '16%', delay: '-0.3s', large: false },
  { left: '34%', delay: '-1.1s', large: true },
  { left: '52%', delay: '-1.8s', large: false },
  { left: '70%', delay: '-0.7s', large: true },
  { left: '86%', delay: '-2.1s', large: false },
] as const;

interface PipMonitorViewProps {
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
  reducedMotion: boolean;
  onCycleScale: () => void;
  onFocusGameTab: () => void;
  onShowTip: (text: string, element: HTMLElement) => void;
  onHideTip: () => void;
}

function CatchBadges({ item }: { item: PipCatchItem }) {
  if (!item.isBig && !item.isMutant) return null;
  return (
    <span className="pf-pip-badges">
      {item.isBig && <PixelIcon glyph="crown" size={11} className="pf-pip-badge-big" />}
      {item.isMutant && <PixelIcon glyph="sparkle" size={11} className="pf-pip-badge-mutant" />}
    </span>
  );
}

function MiniLogRowContent({ item }: { item: PipCatchItem }) {
  return (
    <>
      <div className="pf-pip-log-left">
        <FishSprite
          fish={item.fishSubject}
          preset="thumb"
          form={item.form}
          animate={false}
          className="pf-pip-mini-fish"
        />
        <span className={cx('pf-pip-fish-name', item.rarity, item.isMutant && 'is-mutant')}>
          {item.name}
        </span>
        <CatchBadges item={item} />
      </div>
      <span className="pf-pip-log-right pf-pip-num">{item.sizeText}</span>
    </>
  );
}

/** 브라우저 Document PiP 미니 모니터 본체 화면 */
export default function PipMonitorView({
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
  reducedMotion,
  onCycleScale,
  onFocusGameTab,
  onShowTip,
  onHideTip,
}: PipMonitorViewProps) {
  const latest = recentCatches[0] ?? null;
  const prevCatches = recentCatches.slice(1, 4);

  const renderBottom = () => {
    if (!fishingActive) {
      return (
        <div className="pf-pip-idle-pane">
          <div className="pf-pip-idle-copy">
            <p className="pf-pip-idle-title">지금은 낚시 중이 아니에요</p>
            <p className="pf-pip-idle-sub">낚시를 시작하면 포획이 바로 표시돼요</p>
          </div>
          {bagFull && (
            <button
              type="button"
              className="pf-pip-bag-alert-btn"
              onClick={onFocusGameTab}
            >
              가방이 가득 찼어요
            </button>
          )}
        </div>
      );
    }

    const latestTip = latest ? formatPipCatchTip(latest) : '';
    // 효과 강도는 등급이 정한 후보의 상한이다. 이 항목에 지시가 붙지 않았으면 등급만으로 그린다
    const fxIntensity = latest && leapTrigger?.item.eventId === latest.eventId ? leapTrigger.intensity : null;
    const showRarityGlow = (latest?.rarity === 'epic' || latest?.rarity === 'legendary')
      && fxIntensity !== 'small';
    const isLegendary = latest?.rarity === 'legendary' && (fxIntensity === null || fxIntensity === 'largest');
    const shouldFlash = Boolean(latest && catchFxSeq > 0);
    const borderClass = latest?.rarity === 'legendary'
      ? 'is-legendary'
      : latest?.rarity === 'epic'
        ? 'is-epic'
        : latest?.rarity === 'rare'
          ? 'is-rare'
          : '';

    return (
      <div className="pf-pip-bottom">
        <div className="pf-pip-split">
          <div
            key={`${latest?.eventId ?? 'empty'}-${catchFxSeq}`}
            className={cx('pf-pip-latest-wrap', isLegendary && 'is-legendary', shouldFlash && 'catch-flash')}
            data-rarity={latest?.rarity ?? 'common'}
          >
            {latest && showRarityGlow && (
              <>
                <span className="pf-pip-corner tl" aria-hidden="true" />
                <span className="pf-pip-corner tr" aria-hidden="true" />
                <span className="pf-pip-corner bl" aria-hidden="true" />
                <span className="pf-pip-corner br" aria-hidden="true" />
              </>
            )}
            <div
              className={cx('pf-pip-inset pf-pip-latest-card', borderClass)}
              tabIndex={latest ? 0 : undefined}
              aria-label={latest ? latestTip : undefined}
              onMouseEnter={latest ? e => onShowTip(latestTip, e.currentTarget) : undefined}
              onMouseLeave={latest ? onHideTip : undefined}
              onFocus={latest ? e => onShowTip(latestTip, e.currentTarget) : undefined}
              onBlur={latest ? onHideTip : undefined}
            >
              {latest ? (
                <>
                  {latest.isMutant && (
                    <div className="pf-pip-wisps" aria-hidden="true">
                      {MUTANT_WISP_SPECS.map((wisp, idx) => (
                        <span
                          key={idx}
                          className={cx('pf-pip-wisp', wisp.large && 'lg')}
                          style={{ left: wisp.left, animationDelay: wisp.delay }}
                        />
                      ))}
                    </div>
                  )}
                  {isLegendary && <span className="pf-pip-sweep" aria-hidden="true" />}
                  <div className="pf-pip-latest-grid">
                    <div className="pf-pip-inset pf-pip-thumb-box">
                      {showRarityGlow && <span className="pf-pip-portrait-glow" aria-hidden="true" />}
                      <FishSprite
                        fish={latest.fishSubject}
                        preset="thumb"
                        form={latest.form}
                        animate={false}
                      />
                    </div>
                    <div className="pf-pip-latest-meta">
                      <div className="pf-pip-latest-row1">
                        <span className={cx('pf-pip-fish-name', latest.rarity, latest.isMutant && 'is-mutant')}>
                          {latest.name}
                        </span>
                        <CatchBadges item={latest} />
                      </div>
                      <div className="pf-pip-latest-row2 pf-pip-num">
                        <span>{latest.sizeText}</span>
                        <span>{latest.priceText}</span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="pf-pip-waiting-text">첫 입질을 기다리는 중이에요</div>
              )}
            </div>
          </div>

          <div className="pf-pip-vsep" />

          <div className="pf-pip-log-col">
            <div key={catchFxSeq} className="pf-pip-mini-log" aria-label="최근 포획 3줄">
              {prevCatches.map((item, idx) => {
                const tipText = formatPipCatchTip(item);
                const slideClass = catchFxSeq > 0 ? (idx === 0 ? 'slide-enter' : 'slide-shift') : '';
                return (
                  <div
                    key={item.eventId}
                    className={cx('pf-pip-log-row', slideClass)}
                    tabIndex={0}
                    aria-label={tipText}
                    onMouseEnter={e => onShowTip(tipText, e.currentTarget)}
                    onMouseLeave={onHideTip}
                    onFocus={e => onShowTip(tipText, e.currentTarget)}
                    onBlur={onHideTip}
                  >
                    <MiniLogRowContent item={item} />
                  </div>
                );
              })}
              {catchFxSeq > 0 && exitingLogItem && (
                <div
                  key={`exit-${exitingLogItem.eventId}-${catchFxSeq}`}
                  className="pf-pip-log-row slide-exit"
                  aria-hidden="true"
                >
                  <MiniLogRowContent item={exitingLogItem} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      className="pf-pip-root"
      aria-label="낚시 미니 모니터"
      style={{ '--pf-pip-zoom': String(zoom) } as React.CSSProperties}
    >
      <PipDioramaStage
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
        leapTrigger={leapTrigger}
        scalePreset={scalePreset}
        reducedMotion={reducedMotion}
        onCycleScale={onCycleScale}
        onFocusGameTab={onFocusGameTab}
        onShowTip={onShowTip}
        onHideTip={onHideTip}
      />
      {renderBottom()}
    </section>
  );
}
