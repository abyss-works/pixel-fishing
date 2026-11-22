import { useState } from 'react';
import type { CatalogFishArtStyle, NamedCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import CheckToggle from '../../../../ui/CheckToggle';
import Inset from '../../../../ui/Inset';
import KeyValueRow from '../../../../ui/KeyValueRow';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Note from '../../../../ui/Note';
import PillButton from '../../../../ui/PillButton';
import Subheading from '../../../../ui/Subheading';
import TitledCell from '../../../../ui/TitledCell';
import FishSprite from '../../../../ui/fish/FishSprite';
import { fmtGold } from '../../../../ui/format';

function NamedCatalogCard({
  item, artStyle, animate,
}: {
  item: NamedCatalogItem;
  artStyle: CatalogFishArtStyle;
  animate: boolean;
}) {
  return (
    <TitledCell
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>{item.name}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge>{item.placeLabel}</Badge>
            <Badge>결투 체력 {item.hp}</Badge>
            <Badge>{item.artSupport.v2HasSprite ? 'v2 원화' : 'v2 형태'}</Badge>
          </span>
        </span>
      }
    >
      <Inset className="flex flex-col gap-3 p-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[200px_minmax(0,1fr)]">
          <Inset tone="deep" className="flex flex-col items-center justify-center p-3">
            <FishSprite fish={item.spriteFish} preset="card" artStyle={artStyle} animate={animate}
                        ariaLabel={`${item.name} 스프라이트`} />
            <span className="mt-1 text-2xs text-text-dim font-mono">{item.id}</span>
          </Inset>

          <Inset tone="deep" divided className="flex flex-col justify-center">
            <KeyValueRow label="출현 수역" value={item.placeLabel} />
            <KeyValueRow label="결투 체력" value={<span className="pf-accent">{item.hp} (가속 ×{item.duelSpeedup})</span>} />
            <KeyValueRow label="수배 보상"
                         value={item.bountyRewardGold !== null
                           ? <span className="pf-accent text-gold">{fmtGold(item.bountyRewardGold)}</span>
                           : '—'} />
            <KeyValueRow label="보상 유물"
                         value={item.rewardArtifact
                           ? (
                             <span>
                               {item.rewardArtifact.name}{' '}
                               <span data-rarity={item.rewardArtifact.grade} className="text-(--rarity-color)">
                                 ({item.rewardArtifact.gradeLabel})
                               </span>
                               <span className="text-xs text-text-dim"> · 재료: {item.rewardArtifact.materialName}</span>
                             </span>
                           )
                           : '—'} />
          </Inset>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <Subheading>도감 로어</Subheading>
            <LoreParagraph className="text-xs leading-relaxed text-text">{item.lore}</LoreParagraph>
          </div>
          <div>
            <Subheading>수배서 문구</Subheading>
            <LoreParagraph className="text-xs leading-relaxed text-text-dim">{item.poster}</LoreParagraph>
          </div>
        </div>

        <Inset tone="deep" className="px-3 py-2">
          <span className="text-2xs text-text-dim mr-2">바다 위 흔적</span>
          <span className="text-xs text-gold italic">{item.trace}</span>
        </Inset>

        <div className="border-t border-line pt-2">
          <Subheading>전승 ({item.chronicle.length}문단)</Subheading>
          <div className="flex flex-col gap-2">
            {item.chronicle.map((paragraph, idx) => (
              <LoreParagraph key={idx} className="text-xs leading-[1.85] text-text-dim">
                <span className="pf-accent text-text mr-1.5">{idx + 1}.</span>{paragraph}
              </LoreParagraph>
            ))}
          </div>
        </div>
      </Inset>
    </TitledCell>
  );
}

export default function NamedCatalogSection({ items }: { items: readonly NamedCatalogItem[] }) {
  const [artStyle, setArtStyle] = useState<CatalogFishArtStyle>('v2');
  const [animate, setAnimate] = useState(true);

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
        <span className="text-xs text-text-dim">네임드 {items.length}종</span>
      </Inset>

      {items.length === 0 ? (
        <Note className="my-0">조건에 맞는 네임드가 없어요.</Note>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map(item => (
            <NamedCatalogCard key={item.id} item={item} artStyle={artStyle} animate={animate} />
          ))}
        </div>
      )}
    </div>
  );
}
