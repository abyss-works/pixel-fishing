import CloseButton from '../../../../ui/CloseButton';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Modal from '../../../../ui/Modal';
import { cx } from '../../../../ui/cx';
import { SCROLL_Y } from '../../../../ui/scrollArea';

interface LoreZoneInfo {
  name: string;
  tagline: string;
  lore: string;
}

function ScrollRoller() {
  return (
    <div className="pf-lore-scroll-roller" aria-hidden="true">
      <span className="pf-lore-scroll-cap" />
      <div className="pf-lore-scroll-shaft">
        <span className="pf-lore-scroll-ring is-left" />
        <span className="pf-lore-scroll-ring is-right" />
      </div>
      <span className="pf-lore-scroll-cap" />
    </div>
  );
}

function EdgeStain({ className }: { className: string }) {
  return (
    <svg className={cx('pf-lore-scroll-stain', className)} viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="2" y="2" width="4" height="3" fill="var(--lore-stain-a)" opacity="0.35" />
      <rect x="6" y="3" width="3" height="2" fill="var(--lore-stain-b)" opacity="0.3" />
      <rect x="1" y="5" width="3" height="4" fill="var(--lore-stain-b)" opacity="0.28" />
      <rect x="4" y="6" width="2" height="2" fill="var(--lore-stain-a)" opacity="0.32" />
      <rect x="8" y="6" width="2" height="1" fill="var(--lore-stain-a)" opacity="0.22" />
      <rect x="3" y="10" width="2" height="2" fill="var(--lore-stain-b)" opacity="0.25" />
      <rect x="10" y="2" width="2" height="2" fill="var(--lore-stain-a)" opacity="0.2" />
    </svg>
  );
}

function CompassDivider() {
  return (
    <div className="pf-lore-scroll-divider" aria-hidden="true">
      <span className="pf-lore-scroll-divider-line" />
      <svg width="11" height="11" viewBox="0 0 11 11" shapeRendering="crispEdges">
        <rect x="5" y="0" width="1" height="11" fill="currentColor" />
        <rect x="0" y="5" width="11" height="1" fill="currentColor" />
        <rect x="4" y="4" width="3" height="3" fill="currentColor" />
        <rect x="5" y="5" width="1" height="1" fill="var(--lore-plate-bg)" />
      </svg>
      <span className="pf-lore-scroll-divider-line" />
    </div>
  );
}

function WaxSealAnchor() {
  return (
    <svg className="pf-lore-scroll-seal" width="56" height="68" viewBox="0 0 28 34" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="11" y="21" width="2" height="5" fill="var(--lore-wax-cord-lo)" />
      <rect x="10" y="26" width="2" height="4" fill="var(--lore-wax-cord-mid)" />
      <rect x="9" y="30" width="2" height="3" fill="var(--lore-wax-cord-hi)" />
      <rect x="15" y="21" width="2" height="4" fill="var(--lore-wax-cord-lo)" />
      <rect x="16" y="25" width="2" height="5" fill="var(--lore-wax-cord-mid)" />
      <rect x="17" y="30" width="2" height="4" fill="var(--lore-wax-cord-hi)" />
      <rect x="8" y="2" width="12" height="2" fill="var(--lore-wax-deep)" />
      <rect x="6" y="4" width="16" height="2" fill="var(--lore-wax-mid)" />
      <rect x="4" y="6" width="20" height="12" fill="var(--lore-wax-base)" />
      <rect x="6" y="18" width="16" height="2" fill="var(--lore-wax-mid)" />
      <rect x="8" y="20" width="12" height="2" fill="var(--lore-wax-deep)" />
      <rect x="7" y="5" width="14" height="2" fill="var(--lore-wax-hi)" />
      <rect x="6" y="7" width="2" height="10" fill="var(--lore-wax-hi)" />
      <rect x="19" y="7" width="2" height="10" fill="var(--lore-wax-dark)" />
      <rect x="7" y="17" width="14" height="2" fill="var(--lore-wax-dark)" />
      <rect x="8" y="7" width="11" height="10" fill="var(--lore-wax-inner)" />
      <rect x="13" y="8" width="2" height="2" fill="var(--lore-wax-gold)" />
      <rect x="11" y="10" width="6" height="1" fill="var(--lore-wax-gold)" />
      <rect x="13" y="11" width="2" height="4" fill="var(--lore-wax-gold)" />
      <rect x="10" y="13" width="2" height="2" fill="var(--lore-wax-gold)" />
      <rect x="16" y="13" width="2" height="2" fill="var(--lore-wax-gold)" />
      <rect x="11" y="15" width="6" height="1" fill="var(--lore-wax-gold)" />
    </svg>
  );
}

// 클래식 양피지 항해 두루마리 — 지역 탭 상단 구역 이야기의 전체 원문을 오버레이로 읽는다.
export default function RegionLoreModal({ zone, parentZone, onClose }: {
  zone: LoreZoneInfo;
  parentZone?: { name: string } | null;
  onClose: () => void;
}) {
  const heading = parentZone ? `${parentZone.name} > ${zone.name}` : zone.name;
  const paragraphs = zone.lore.split('\n\n').filter(Boolean);

  return (
    <Modal layer="app" bare frameless title={heading} onClose={onClose}>
      <div className="pf-lore-scroll min-h-0 flex-1">
        <ScrollRoller />
        <div className="pf-lore-scroll-sheet">
          <EdgeStain className="is-tl" />
          <EdgeStain className="is-br" />
          <div className="pf-lore-scroll-fold is-top" aria-hidden="true" />
          <div className="pf-lore-scroll-fold is-bottom" aria-hidden="true" />
          <div className="pf-lore-scroll-notch is-left" aria-hidden="true" />
          <div className="pf-lore-scroll-notch is-right" aria-hidden="true" />

          <div className="pf-lore-scroll-plate">
            <CloseButton onClose={onClose} className="pf-lore-scroll-close top-3 right-3" />
            <div className="pr-8 shrink-0">
              {parentZone && <div className="pf-lore-scroll-kicker">{parentZone.name}</div>}
              <div className="pf-lore-scroll-title">{zone.name}</div>
              <p className="pf-lore-scroll-subtitle">{zone.tagline}</p>
            </div>
            <CompassDivider />
            <div className={cx(SCROLL_Y, 'min-h-0 flex-1 flex flex-col gap-3.5 pb-4')}>
              {paragraphs.map((p, idx) => (
                <LoreParagraph key={idx} className="pf-lore-scroll-paragraph leading-[1.85]">
                  {p}
                </LoreParagraph>
              ))}
            </div>
          </div>
        </div>
        <ScrollRoller />
        <WaxSealAnchor />
      </div>
    </Modal>
  );
}
