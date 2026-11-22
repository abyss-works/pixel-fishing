import { useState } from 'react';
import type { BountyCatalogItem } from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import DataTable from '../../../../ui/DataTable';
import KpiTile from '../../../../ui/KpiTile';
import Note from '../../../../ui/Note';
import PillButton from '../../../../ui/PillButton';
import TableBox from '../../../../ui/TableBox';
import { fmtGold, fmtNum } from '../../../../ui/format';
import { KpiRow } from '../../layout';

export default function BountyCatalogSection({ items }: { items: readonly BountyCatalogItem[] }) {
  const [kindFilter, setKindFilter] = useState<'all' | 'general' | 'named'>('all');

  const generalCount = items.filter(q => q.kind === 'general').length;
  const namedCount = items.filter(q => q.kind === 'named').length;
  const visible = kindFilter === 'all' ? items : items.filter(q => q.kind === kindFilter);

  return (
    <div className="flex flex-col gap-3">
      <KpiRow>
        <KpiTile label="표시 의뢰" value={fmtNum(items.length)} hint="전체 정본" />
        <KpiTile label="일반 의뢰" value={fmtNum(generalCount)} hint="쉬움 · 보통 · 어려움" />
        <KpiTile label="네임드 토벌" value={fmtNum(namedCount)} hint="구역별 보스 토벌" />
      </KpiRow>

      <div className="flex flex-wrap items-center gap-1.5">
        <PillButton type="button" active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>
          전체 ({items.length})
        </PillButton>
        <PillButton type="button" active={kindFilter === 'general'} onClick={() => setKindFilter('general')}>
          일반 의뢰 ({generalCount})
        </PillButton>
        <PillButton type="button" active={kindFilter === 'named'} onClick={() => setKindFilter('named')}>
          네임드 토벌 ({namedCount})
        </PillButton>
      </div>

      {visible.length === 0 ? (
        <Note className="my-0">조건에 맞는 현상금 의뢰가 없어요.</Note>
      ) : (
        <TableBox className="max-h-[600px] p-2">
          <DataTable>
            <thead>
              <tr>
                <th className="text-left">구역</th>
                <th className="text-left">수주 항구</th>
                <th className="text-left">난이도</th>
                <th className="text-left">요구 대상</th>
                <th className="text-right">요구 수량</th>
                <th className="text-right">보상 골드</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(q => (
                <tr key={q.id}>
                  <td className="whitespace-nowrap font-medium text-text">{q.zoneName}</td>
                  <td className="whitespace-nowrap text-xs text-text-dim">{q.portName ?? '—'}</td>
                  <td className="whitespace-nowrap"><Badge>{q.difficultyLabel}</Badge></td>
                  <td className="whitespace-nowrap">
                    {q.grade ? (
                      <span data-rarity={q.grade} className="text-(--rarity-color)">
                        {q.targetLabel}
                      </span>
                    ) : (
                      <span className="text-gold">{q.targetLabel}</span>
                    )}
                  </td>
                  <td className="text-right tabular-nums whitespace-nowrap">{fmtNum(q.count)}</td>
                  <td className="text-right pf-accent text-gold whitespace-nowrap">{fmtGold(q.rewardGold)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableBox>
      )}
    </div>
  );
}
