import type { CookingCatalog, RecipeCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import ColorSwatch from '../../../../ui/ColorSwatch';
import DataTable from '../../../../ui/DataTable';
import Inset from '../../../../ui/Inset';
import ItemSprite from '../../../../ui/ItemSprite';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Note from '../../../../ui/Note';
import Subheading from '../../../../ui/Subheading';
import TableBox from '../../../../ui/TableBox';
import { fmtMinutes } from '../../../../ui/format';

export default function CookingCatalogSection({
  cooking, recipes,
}: {
  cooking: CookingCatalog;
  recipes: readonly RecipeCatalogItem[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <Note size="xs" className="my-0">
        해금 배: {cooking.meta.unlockBoatTier}단계 {cooking.meta.unlockBoatName} ·
        보관함 상한: {cooking.meta.storageCap}개 ·
        자동 기운 추출: {cooking.meta.autoEnergyBoatTier}단계 {cooking.meta.autoEnergyBoatName}
      </Note>

      <div className="flex flex-col gap-1.5">
        <Subheading>생명의 기운 ({cooking.energies.length}종)</Subheading>
        <Inset className="grid grid-cols-1 divide-y divide-line md:grid-cols-4 md:divide-x md:divide-y-0">
          {cooking.energies.map(e => (
            <div key={e.id} className="flex flex-col gap-1 p-3">
              <div className="flex items-center gap-2">
                <ColorSwatch color={e.color} />
                <span data-rarity={e.grade} className="pf-accent text-sm text-(--rarity-color)">
                  {e.displayName}
                </span>
              </div>
              <span className="text-2xs font-mono text-text-dim">{e.id}</span>
              <span className="text-xs text-text-dim">{e.sourceSummary}</span>
            </div>
          ))}
        </Inset>
      </div>

      <div className="flex flex-col gap-1.5">
        <Subheading>요리 레시피 ({recipes.length}종 — 도시락 {cooking.lunchCount} · 미끼 {cooking.baitCount})</Subheading>
        {recipes.length === 0 ? (
          <Note className="my-0">조건에 맞는 요리가 없어요.</Note>
        ) : (
          <TableBox className="p-2">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">그림</th>
                  <th className="text-left">구분</th>
                  <th className="text-left">이름</th>
                  <th className="text-right">조리 시간</th>
                  <th className="text-right">지속 시간</th>
                  <th className="text-left">기운 비용</th>
                  <th className="text-left">효과</th>
                  <th className="text-left">설명</th>
                </tr>
              </thead>
              <tbody>
                {recipes.map(r => (
                  <tr key={r.id}>
                    <td><ItemSprite kind={r.kind} id={r.id} preset="list" ariaLabel={r.name} /></td>
                    <td className="whitespace-nowrap">
                      <Badge>{r.kindLabel}</Badge>
                      {r.nightUnlock && <span className="ml-1"><Badge>밤</Badge></span>}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="font-medium text-text">{r.name}</span>
                      {r.grade && r.gradeLabel && (
                        <span data-rarity={r.grade} className="ml-1 text-xs text-(--rarity-color)">
                          ({r.gradeLabel})
                        </span>
                      )}
                    </td>
                    <td className="text-right whitespace-nowrap text-xs">
                      {r.waitMin > 0 ? fmtMinutes(r.waitMin) : '즉시'}
                    </td>
                    <td className="text-right whitespace-nowrap text-xs">{fmtMinutes(r.slotMin)}</td>
                    <td className="whitespace-nowrap text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {r.costItems.map(c => (
                          <span key={c.grade} data-rarity={c.grade} className="text-(--rarity-color)">
                            {c.gradeName} {c.amount}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs text-gold whitespace-nowrap">
                      {r.effectLines.map(e => `${e.label} ${e.value}`).join(' · ')}
                    </td>
                    <td className="text-xs text-text-dim min-w-[220px]">
                      <LoreParagraph>{r.description}</LoreParagraph>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableBox>
        )}
      </div>
    </div>
  );
}
