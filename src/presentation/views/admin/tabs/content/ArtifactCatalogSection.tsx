import type { ArtifactCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import DataTable from '../../../../ui/DataTable';
import Inset from '../../../../ui/Inset';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Note from '../../../../ui/Note';
import TableBox from '../../../../ui/TableBox';
import TitledCell from '../../../../ui/TitledCell';
import { fmtLevel } from '../../../../ui/format';

function ArtifactCatalogCard({ item }: { item: ArtifactCatalogItem }) {
  return (
    <TitledCell
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {item.name}{' '}
            <span data-rarity={item.grade} className="text-xs text-(--rarity-color)">
              ({item.gradeLabel})
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge>{item.zoneName}</Badge>
            <Badge>네임드: {item.namedName}</Badge>
            <Badge>재료: {item.materialName}</Badge>
          </span>
        </span>
      }
    >
      <Inset className="flex flex-col gap-3 p-3">
        <LoreParagraph className="text-xs leading-relaxed text-text-dim">{item.lore}</LoreParagraph>

        {!item.hasLevels && (
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge>전설 고정 효과 (강화 없음)</Badge>
            {item.systemBonusLine && <span className="text-gold">{item.systemBonusLine}</span>}
            {item.systemPenaltyLine && <span className="text-danger">{item.systemPenaltyLine}</span>}
          </div>
        )}

        <TableBox className="p-2">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">단계</th>
                <th className="text-right">계수</th>
                <th className="text-right">재료 수량</th>
                <th className="text-left">효과 수치</th>
              </tr>
            </thead>
            <tbody>
              {item.levels.map(row => (
                <tr key={row.level}>
                  <td className="pf-accent whitespace-nowrap">{fmtLevel(row.level)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">×{row.coef}</td>
                  <td className="text-right whitespace-nowrap text-text-dim">
                    {row.level === 1
                      ? `교환 ${item.exchangeCost}개`
                      : row.upgradeMaterialCost !== null
                        ? `강화 ${row.upgradeMaterialCost}개`
                        : '고정'}
                  </td>
                  <td className="text-gold">{row.summary}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableBox>
      </Inset>
    </TitledCell>
  );
}

export default function ArtifactCatalogSection({ items }: { items: readonly ArtifactCatalogItem[] }) {
  if (items.length === 0) return <Note className="my-0">조건에 맞는 유물이 없어요.</Note>;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {items.map(item => (
        <ArtifactCatalogCard key={item.id} item={item} />
      ))}
    </div>
  );
}
