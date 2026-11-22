import { useState } from 'react';
import type { HatCatalogItem, WardrobeCatalog } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import ColorSwatch from '../../../../ui/ColorSwatch';
import DataTable from '../../../../ui/DataTable';
import Inset from '../../../../ui/Inset';
import Note from '../../../../ui/Note';
import PersonSprite from '../../../../ui/PersonSprite';
import PillButton from '../../../../ui/PillButton';
import SlotCell from '../../../../ui/SlotCell';
import Subheading from '../../../../ui/Subheading';
import TableBox from '../../../../ui/TableBox';
import { fmtGold } from '../../../../ui/format';

function WardrobePaletteRow({
  title, colors, picked, onPick,
}: {
  title: string;
  colors: readonly string[];
  picked: number;
  onPick: (idx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Subheading>{title} ({colors.length}색)</Subheading>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {colors.map((hex, i) => (
          <SlotCell key={hex} ariaLabel={`${title} ${i + 1}번 색 ${hex}`} picked={picked === i}
                    onSelect={() => onPick(i)} className="flex flex-col items-center gap-1 p-1.5">
            <ColorSwatch color={hex} big />
            <span className="text-2xs text-text-dim font-mono">{i}</span>
          </SlotCell>
        ))}
      </div>
    </div>
  );
}

export default function WardrobeCatalogSection({
  wardrobe, hats,
}: {
  wardrobe: WardrobeCatalog;
  hats: readonly HatCatalogItem[];
}) {
  const [shirt, setShirt] = useState(wardrobe.defaultLook.shirt);
  const [pants, setPants] = useState(wardrobe.defaultLook.pants);
  const [selectedHatId, setSelectedHatId] = useState<string | null>(wardrobe.hats[0]?.id ?? null);
  const [sourceFilter, setSourceFilter] = useState<'all' | 'gold' | 'achievement'>('all');

  const previewLook = { shirt, pants, hat: selectedHatId };
  const selectedHat = wardrobe.hats.find(h => h.id === selectedHatId) ?? null;

  const visibleHats = sourceFilter === 'all'
    ? hats
    : hats.filter(h => h.source === sourceFilter);

  return (
    <div className="flex flex-col gap-4">
      <Inset className="flex flex-wrap items-center justify-between gap-4 p-3">
        <div className="flex items-center gap-4">
          <PersonSprite look={previewLook} scale={4} ariaLabel="확대한 캐릭터 미리보기" />
          <PersonSprite look={previewLook} scale={2} onBoat ariaLabel="배 위 캐릭터 미리보기" />
          <PersonSprite look={previewLook} scale={3} headOnly ariaLabel="머리 미리보기" />
          <div className="flex flex-col gap-1 text-xs">
            <span className="pf-accent text-sm text-gold">
              {selectedHat ? selectedHat.name : '모자 없음'}
            </span>
            <span className="text-text-dim">
              웃옷 #{shirt} ({wardrobe.shirtColors[shirt]}) · 바지 #{pants} ({wardrobe.pantsColors[pants]})
            </span>
            {selectedHat && (
              <span className="text-text-dim">
                {selectedHat.source === 'gold'
                  ? `상점 구매 · ${fmtGold(selectedHat.price)}`
                  : `업적 획득 · ${selectedHat.achievementName ?? ''} — ${selectedHat.achievementDesc ?? ''}`}
              </span>
            )}
          </div>
        </div>
        <PillButton type="button" active={selectedHatId === null} onClick={() => setSelectedHatId(null)}>
          모자 벗기
        </PillButton>
      </Inset>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Subheading>의상 프리셋 ({wardrobe.presets.length}종)</Subheading>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {wardrobe.presets.map(p => (
              <SlotCell key={p.name} ariaLabel={`${p.name} 프리셋 적용`}
                        picked={shirt === p.shirt && pants === p.pants}
                        onSelect={() => { setShirt(p.shirt); setPants(p.pants); }}
                        className="flex flex-col items-center gap-1 py-2">
                <PersonSprite look={{ shirt: p.shirt, pants: p.pants, hat: selectedHatId }} scale={3} />
                <span className="text-xs">{p.name}</span>
                <span className="text-2xs text-text-dim">웃옷 {p.shirt} · 바지 {p.pants}</span>
              </SlotCell>
            ))}
          </div>
        </div>

        <WardrobePaletteRow title="웃옷 팔레트" colors={wardrobe.shirtColors} picked={shirt} onPick={setShirt} />
        <WardrobePaletteRow title="바지 팔레트" colors={wardrobe.pantsColors} picked={pants} onPick={setPants} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Subheading>모자 카탈로그 (표시 {visibleHats.length} / 전체 {wardrobe.hats.length}종)</Subheading>
          <div className="flex items-center gap-1.5">
            <PillButton type="button" active={sourceFilter === 'all'} onClick={() => setSourceFilter('all')}>
              전체 ({hats.length})
            </PillButton>
            <PillButton type="button" active={sourceFilter === 'gold'} onClick={() => setSourceFilter('gold')}>
              상점 ({hats.filter(h => h.source === 'gold').length})
            </PillButton>
            <PillButton type="button" active={sourceFilter === 'achievement'} onClick={() => setSourceFilter('achievement')}>
              업적 ({hats.filter(h => h.source === 'achievement').length})
            </PillButton>
          </div>
        </div>

        {visibleHats.length === 0 ? (
          <Note className="my-0">조건에 맞는 모자가 없어요.</Note>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {visibleHats.map(h => (
                <SlotCell key={h.id} ariaLabel={`${h.name} 미리보기`}
                          picked={selectedHatId === h.id}
                          onSelect={() => setSelectedHatId(h.id)}
                          className="flex flex-col items-center gap-1 p-2">
                  <PersonSprite look={{ shirt, pants, hat: h.id }} scale={3} headOnly />
                  <span className="text-xs text-center leading-tight">{h.name}</span>
                  <span className="text-2xs text-text-dim">
                    {h.source === 'gold' ? fmtGold(h.price) : (h.zoneName ?? '업적')}
                  </span>
                </SlotCell>
              ))}
            </div>

            <TableBox className="max-h-[420px] p-2">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">미리보기</th>
                    <th className="text-left">이름</th>
                    <th className="text-left">구분</th>
                    <th className="text-left">색상</th>
                    <th className="text-left">가격 · 획득처</th>
                    <th className="text-left">해금 조건</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleHats.map(h => (
                    <tr key={h.id} onClick={() => setSelectedHatId(h.id)} className="cursor-pointer hover:bg-surface-2">
                      <td><PersonSprite look={{ shirt, pants, hat: h.id }} scale={2} headOnly /></td>
                      <td className="whitespace-nowrap font-medium text-text">{h.name}</td>
                      <td className="whitespace-nowrap"><Badge>{h.sourceLabel}</Badge></td>
                      <td className="whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <ColorSwatch color={h.color} />
                          {h.accentColor && <ColorSwatch color={h.accentColor} />}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-xs">
                        {h.source === 'gold'
                          ? <span className="pf-accent text-gold">{fmtGold(h.price)}</span>
                          : (h.achievementName ?? '업적')}
                      </td>
                      <td className="text-xs text-text-dim">
                        {h.source === 'gold' ? '상점 구매' : (h.achievementDesc ?? '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableBox>
          </>
        )}
      </div>
    </div>
  );
}
