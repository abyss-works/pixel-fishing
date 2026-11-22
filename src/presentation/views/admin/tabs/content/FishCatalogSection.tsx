import { useState } from 'react';
import type { CatalogFishArtStyle, FishCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import CheckToggle from '../../../../ui/CheckToggle';
import ColorSwatch from '../../../../ui/ColorSwatch';
import Inset from '../../../../ui/Inset';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Note from '../../../../ui/Note';
import PillButton from '../../../../ui/PillButton';
import { cx } from '../../../../ui/cx';
import FishSprite from '../../../../ui/fish/FishSprite';
import { fmtGold, fmtSize } from '../../../../ui/format';

function FishArtSupportBadge({ item }: { item: FishCatalogItem }) {
  const normalLabel = item.artSupport.v2NormalSource === 'hand'
    ? 'v2 손수정'
    : item.artSupport.v2NormalSource === 'generated'
      ? 'v2 원화'
      : 'v2 형태대체';
  const variantLabel = item.artSupport.v2HasVariantSprite ? '변이 전용' : '변이 공유';
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge>v1 지원</Badge>
      <Badge>{normalLabel}</Badge>
      <Badge>{variantLabel}</Badge>
    </div>
  );
}

function FishCatalogCard({
  item, artStyle, animate,
}: {
  item: FishCatalogItem;
  artStyle: CatalogFishArtStyle;
  animate: boolean;
}) {
  return (
    <Inset className="flex flex-col gap-2.5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="pf-accent text-base text-text">{item.name}</span>
          <span data-rarity={item.rarity} className="text-xs text-(--rarity-color)">
            {item.rarityName}
          </span>
          {item.night && <Badge>밤 전용</Badge>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge>{item.zoneName}</Badge>
          <Badge>{item.spotName}</Badge>
        </div>
      </div>

      <Inset tone="deep" className="grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-2">
        <div className="flex items-center gap-2.5">
          <FishSprite fish={item.fish} preset="icon" form="normal" artStyle={artStyle} animate={animate}
                      ariaLabel={`${item.name} 일반 그림`} className="shrink-0" />
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <span className="text-text-dim">일반</span>
            <div className="flex items-center gap-1.5">
              <ColorSwatch color={item.color} />
              <span className="pf-accent text-gold">{fmtGold(item.price)}</span>
            </div>
            <span className="text-2xs text-text-dim font-mono">{item.color}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 sm:border-l sm:border-line sm:pl-2.5">
          <FishSprite fish={item.fish} preset="icon" form="variant" artStyle={artStyle} animate={animate}
                      ariaLabel={`${item.variant.name} 돌연변이 그림`} className="shrink-0" />
          <div className="flex min-w-0 flex-col gap-0.5 text-xs">
            <span className="text-accent truncate">{item.variant.name}</span>
            <div className="flex items-center gap-1.5">
              <ColorSwatch color={item.variant.color} />
              <span className="pf-accent text-gold">{fmtGold(item.variantPrice)}</span>
              <span className="text-2xs text-text-dim">(×{item.variantMult})</span>
            </div>
            <span className="text-2xs text-text-dim font-mono">{item.variant.color}</span>
          </div>
        </div>
      </Inset>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-dim">
        <span>
          크기 <span className="text-text">{fmtSize(item.sizeRange.min)} ~ {fmtSize(item.sizeRange.max)}</span>
          {' · '}평균 {fmtSize(item.sizeRange.mean)}
          {' · '}월척(상위 {item.sizeRange.bigPercentile}%) ≥{' '}
          <span className="text-gold">{fmtSize(item.sizeRange.bigThreshold)}</span>
        </span>
        <span className="text-2xs">형태 {item.shape} · 가중치 {item.night ? `${item.effectiveNightWeight}(밤)` : item.baseWeight}</span>
      </div>

      <FishArtSupportBadge item={item} />

      <div className="flex flex-col gap-1 border-t border-line pt-2 text-xs leading-relaxed">
        <LoreParagraph className="text-text-dim">{item.lore}</LoreParagraph>
        <LoreParagraph className={cx('text-text', 'opacity-90')}>
          <span className="text-accent mr-1">[돌연변이]</span>{item.variant.lore}
        </LoreParagraph>
      </div>
    </Inset>
  );
}

export default function FishCatalogSection({ items }: { items: readonly FishCatalogItem[] }) {
  const [artStyle, setArtStyle] = useState<CatalogFishArtStyle>('v2');
  const [animate, setAnimate] = useState(false);

  const nightCount = items.filter(f => f.night).length;
  const v2OwnCount = items.filter(f => f.artSupport.v2HasNormalSprite).length;

  return (
    <div className="flex flex-col gap-3">
      <Inset className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-dim">그림체</span>
          <PillButton type="button" active={artStyle === 'v2'} onClick={() => setArtStyle('v2')}>
            v2 (원화)
          </PillButton>
          <PillButton type="button" active={artStyle === 'v1'} onClick={() => setArtStyle('v1')}>
            v1 (도형)
          </PillButton>
          <CheckToggle checked={animate} onChange={setAnimate} label="유영 움직임 (v2)" className="ml-2" />
        </div>
        <span className="text-xs text-text-dim">
          표시 {items.length}종 (밤 전용 {nightCount}종 · v2 원화 {v2OwnCount}종)
        </span>
      </Inset>

      {items.length === 0 ? (
        <Note className="my-0">조건에 맞는 어종이 없어요.</Note>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {items.map(item => (
            <FishCatalogCard key={item.id} item={item} artStyle={artStyle} animate={animate} />
          ))}
        </div>
      )}
    </div>
  );
}
