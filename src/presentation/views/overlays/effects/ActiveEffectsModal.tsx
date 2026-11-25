import type { GameState } from '../../../../game/rules/logic';
import { useNow } from '../../../../features/gameplay/service/useGameTime';
import { selectActiveEffectsView } from '../../../../features/kitchen/model/slots';
import type { ActiveEffectEntry } from '../../../../features/kitchen/model/slots';
import Badge from '../../../ui/Badge';
import Button from '../../../ui/Button';
import { cx } from '../../../ui/cx';
import { GradeName, HighlightRarityText } from '../../../ui/fish/RarityTag';
import Inset from '../../../ui/Inset';
import Modal from '../../../ui/Modal';
import ModalCard from '../../../ui/ModalCard';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import { SCROLL_Y } from '../../../ui/scrollArea';

function EffectGroup({
  glyph,
  glyphClassName,
  label,
  slotCount,
  scopeBadge,
  items,
}: {
  glyph: GlyphId;
  glyphClassName: string;
  label: string;
  slotCount?: string;
  scopeBadge?: { text: string; tone: 'dim' | 'accent' };
  items: readonly ActiveEffectEntry[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-1.5 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-text-dim">
          <PixelIcon glyph={glyph} size={12} className={glyphClassName} />
          <span>{label}</span>
          {slotCount && <span className="pf-accent text-2xs font-normal text-text-dim">{slotCount}</span>}
        </span>
        {scopeBadge && (
          <Badge tone={scopeBadge.tone} size="2xs">
            {scopeBadge.text}
          </Badge>
        )}
      </div>
      <Inset divided className="flex flex-col">
        {items.map(item => (
          <div key={item.id} className="px-3 py-2 flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2.5 flex-wrap">
              <span className="text-sm text-text">
                <GradeName name={item.title.name} grade={item.title.grade} />
              </span>
              <span className="pf-accent text-2xs text-text-dim whitespace-nowrap ml-auto">
                {item.durationText}
              </span>
            </div>
            {item.stats.map((stat, idx) =>
              'text' in stat ? (
                <p key={idx} className="m-0 text-xs text-text-dim leading-snug">
                  <HighlightRarityText text={stat.text} />
                </p>
              ) : (
                <div key={stat.label} className="flex items-baseline gap-1.5 flex-wrap text-xs">
                  <span className="text-text-dim">
                    <HighlightRarityText text={stat.label} />
                  </span>
                  <span className="pf-accent text-accent">{stat.value}</span>
                </div>
              ),
            )}
            {item.description && (
              <p className="m-0 mt-0.5 text-2xs text-text-dim leading-normal">{item.description}</p>
            )}
          </div>
        ))}
      </Inset>
    </section>
  );
}

// 적용 중인 효과 창 — HUD 효과 칩 클릭으로 여는 스테이지 모달.
// 도시락(방치)·미끼(수동)·비약·오늘의 운세 4개 구획과 남은 시간, 가방 열기/전체 보너스 보기 이동을 제공한다.
export default function ActiveEffectsModal({
  game,
  onClose,
  onOpenBag,
  onOpenStatsBonus,
}: {
  game: GameState;
  onClose: () => void;
  onOpenBag: () => void;
  onOpenStatsBonus: () => void;
}) {
  const now = useNow();
  const view = selectActiveEffectsView(game, now);

  return (
    <Modal layer="stage" sm height={480} mobileFixed onClose={onClose}>
      <ModalCard
        title="적용 중인 효과"
        fixed
        onClose={onClose}
        confirm={(
          <div className="grid grid-cols-2 gap-2">
            <Button full onClick={onOpenBag}>가방 열기</Button>
            <Button variant="primary" full onClick={onOpenStatsBonus}>전체 보너스 보기</Button>
          </div>
        )}
      >
        <div className={cx('flex flex-col gap-2.5 flex-1 min-h-0 pr-2 -mr-2', SCROLL_Y)}>
          {!view.hasAny ? (
            <Inset className="p-4 flex flex-col gap-2 items-start text-left">
              <div className="inline-flex items-center gap-2">
                <PixelIcon glyph="sparkle" size={14} className="text-accent shrink-0" />
                <p className="m-0 text-base font-bold text-text">지금 적용 중인 효과가 없어요.</p>
              </div>
              <p className="m-0 text-sm text-text-dim leading-relaxed">
                가방에서 도시락, 미끼, 비약을 사용해 보세요.
              </p>
            </Inset>
          ) : (
            <>
              <EffectGroup
                glyph="lunch"
                glyphClassName="text-accent"
                label="도시락"
                scopeBadge={{ text: '방치', tone: 'dim' }}
                items={view.lunch}
              />
              <EffectGroup
                glyph="bait"
                glyphClassName="text-special"
                label="미끼"
                slotCount={view.bait.maxSlots > 1 ? `${view.bait.slots.length}/${view.bait.maxSlots}` : undefined}
                scopeBadge={{ text: '수동', tone: 'accent' }}
                items={view.bait.slots}
              />
              <EffectGroup
                glyph="gem"
                glyphClassName="text-accent"
                label="비약"
                items={view.potions}
              />
              <EffectGroup
                glyph="star"
                glyphClassName="text-gold"
                label="오늘의 운세"
                items={view.fortune ? [view.fortune] : []}
              />
            </>
          )}
        </div>
      </ModalCard>
    </Modal>
  );
}
