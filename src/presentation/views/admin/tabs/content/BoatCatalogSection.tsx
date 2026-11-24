import type { BoatCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import BoatSprite from '../../../../ui/BoatSprite';
import DataTable from '../../../../ui/DataTable';
import Note from '../../../../ui/Note';
import TableBox from '../../../../ui/TableBox';
import { fmtFishCount, fmtGold, fmtNum } from '../../../../ui/format';

export default function BoatCatalogSection({
  items, walkBagCap,
}: {
  items: readonly BoatCatalogItem[];
  walkBagCap: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Note size="xs" className="my-0">
        도보 기본 가방 상한: {fmtFishCount(walkBagCap)} (배 0단계) · 9단계 가공 플랜트선은 가방 초과 시 대상 어종을 기운으로 자동 추출해요.
      </Note>

      {items.length === 0 ? (
        <Note className="my-0">조건에 맞는 배가 없어요.</Note>
      ) : (
        <TableBox className="p-2">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">그림</th>
                <th className="text-right">단계</th>
                <th className="text-left">이름</th>
                <th className="text-right">가격</th>
                <th className="text-right">명성 하한</th>
                <th className="text-right">항해 속도</th>
                <th className="text-right">가방 상한</th>
                <th className="text-left">자동 기운 추출</th>
                <th className="text-left">진입 구역</th>
              </tr>
            </thead>
            <tbody>
              {items.map(b => (
                <tr key={b.tier}>
                  <td><BoatSprite tier={b.tier} preset="row" ariaLabel={b.name} /></td>
                  <td className="text-right pf-accent whitespace-nowrap">{b.tier}단계</td>
                  <td className="whitespace-nowrap font-medium text-text">{b.name}</td>
                  <td className="text-right pf-accent text-gold whitespace-nowrap">{fmtGold(b.price)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{fmtNum(b.fameReq)}</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{b.speed} px/s</td>
                  <td className="text-right tabular-nums whitespace-nowrap">{fmtFishCount(b.bagCap)}</td>
                  <td className="whitespace-nowrap">
                    {b.autoEnergy ? <Badge>자동 추출</Badge> : <span className="text-text-dim">—</span>}
                  </td>
                  <td className="text-xs text-text-dim">
                    {b.unlockZones.length > 0 ? b.unlockZones.join(', ') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableBox>
      )}
    </div>
  );
}
