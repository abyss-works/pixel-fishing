import { useState } from 'react';
import type {
  BaseCatalogItem,
  SpotCatalogItem,
  ZoneCatalogItem,
} from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import DataTable from '../../../../ui/DataTable';
import Inset from '../../../../ui/Inset';
import LoreParagraph from '../../../../ui/LoreParagraph';
import Note from '../../../../ui/Note';
import PillButton from '../../../../ui/PillButton';
import Subheading from '../../../../ui/Subheading';
import TableBox from '../../../../ui/TableBox';
import { fmtLevel, fmtNum } from '../../../../ui/format';

function ZoneHierarchyCard({ item }: { item: ZoneCatalogItem }) {
  return (
    <Inset className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="pf-accent text-sm text-text">{item.name}</span>
          <Badge>{item.isTopLevel ? '최상위 구역' : `하위 · ${item.parentName}`}</Badge>
          <Badge>{item.groupLabel}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {item.entryBoatName && <Badge>{item.entryBoat}단계 {item.entryBoatName}</Badge>}
          {item.minPowerReq !== null && item.minRodLevel !== null && (
            <Badge>요구 파워 {item.minPowerReq} ({fmtLevel(item.minRodLevel)})</Badge>
          )}
          <Badge>어종 {item.fishCount}종 (밤 {item.nightFishCount})</Badge>
        </div>
      </div>

      <span className="text-xs text-gold">{item.tagline}</span>
      <LoreParagraph className="text-xs leading-relaxed text-text-dim">{item.lore}</LoreParagraph>

      {item.gateMsg && (
        <span className="text-2xs text-accent">진입 안내: {item.gateMsg}</span>
      )}

      {item.isTopLevel && item.tips.length > 0 && (
        <div className="border-t border-line pt-1.5 text-2xs text-text-dim">
          {item.tips.map((tip, idx) => (
            <div key={idx}>• {tip}</div>
          ))}
        </div>
      )}
    </Inset>
  );
}

export default function ZoneCatalogSection({
  zones, spots, bases,
}: {
  zones: readonly ZoneCatalogItem[];
  spots: readonly SpotCatalogItem[];
  bases: readonly BaseCatalogItem[];
}) {
  const [subView, setSubView] = useState<'all' | 'zones' | 'spots' | 'bases'>('all');

  const showZones = subView === 'all' || subView === 'zones';
  const showSpots = subView === 'all' || subView === 'spots';
  const showBases = subView === 'all' || subView === 'bases';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <PillButton type="button" active={subView === 'all'} onClick={() => setSubView('all')}>
          전체 보기
        </PillButton>
        <PillButton type="button" active={subView === 'zones'} onClick={() => setSubView('zones')}>
          구역 계층 ({zones.length})
        </PillButton>
        <PillButton type="button" active={subView === 'spots'} onClick={() => setSubView('spots')}>
          조업 해역 ({spots.length})
        </PillButton>
        <PillButton type="button" active={subView === 'bases'} onClick={() => setSubView('bases')}>
          거점 항구 ({bases.length})
        </PillButton>
      </div>

      {showSpots && (
        <div className="flex flex-col gap-1.5">
          <Subheading>조업 해역 ({spots.length}개)</Subheading>
          {spots.length === 0 ? (
            <Note className="my-0">조건에 맞는 조업 해역이 없어요.</Note>
          ) : (
            <TableBox className="p-2">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">해역명</th>
                    <th className="text-left">최상위 구역</th>
                    <th className="text-left">필요 배</th>
                    <th className="text-right">요구 파워</th>
                    <th className="text-right">요구 낚싯대</th>
                    <th className="text-right">총 어종</th>
                    <th className="text-right">낮 / 밤</th>
                    <th className="text-left">등급 분포 (일/희/영/전)</th>
                    <th className="text-left">가중치</th>
                  </tr>
                </thead>
                <tbody>
                  {spots.map(s => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap font-medium text-text">{s.name}</td>
                      <td className="whitespace-nowrap text-xs text-text-dim">{s.topZoneName}</td>
                      <td className="whitespace-nowrap text-xs">
                        {s.boatTier > 0 ? `${s.boatTier}단계 ${s.boatName}` : s.boatName}
                      </td>
                      <td className="text-right pf-accent whitespace-nowrap">{fmtNum(s.powerReq)}</td>
                      <td className="text-right whitespace-nowrap text-gold">{fmtLevel(s.minRodLevel)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{s.fishCount}종</td>
                      <td className="text-right tabular-nums whitespace-nowrap text-xs text-text-dim">
                        {s.dayFishCount} / {s.nightFishCount}
                      </td>
                      <td className="whitespace-nowrap text-xs tabular-nums">
                        {s.rarityCounts.common} / {s.rarityCounts.rare} / {s.rarityCounts.epic} / {s.rarityCounts.legendary}
                      </td>
                      <td className="whitespace-nowrap">
                        {s.hasRarityOverride ? <Badge>해역 오버라이드</Badge> : <span className="text-xs text-text-dim">프리셋</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableBox>
          )}
        </div>
      )}

      {showZones && (
        <div className="flex flex-col gap-1.5">
          <Subheading>구역 계층 ({zones.length}개)</Subheading>
          {zones.length === 0 ? (
            <Note className="my-0">조건에 맞는 구역이 없어요.</Note>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {zones.map(z => <ZoneHierarchyCard key={z.id} item={z} />)}
            </div>
          )}
        </div>
      )}

      {showBases && (
        <div className="flex flex-col gap-1.5">
          <Subheading>거점 · 항구 ({bases.length}곳)</Subheading>
          <TableBox className="p-2">
            <DataTable>
              <thead>
                <tr>
                  <th className="text-left">거점명</th>
                  <th className="text-left">식별자</th>
                  <th className="text-left">소속 지역</th>
                  <th className="text-left">판매·기운 시설</th>
                  <th className="text-left">수배 담당 구역</th>
                </tr>
              </thead>
              <tbody>
                {bases.map(b => (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap font-medium text-text">{b.name}</td>
                    <td className="font-mono text-xs text-text-dim">{b.id}</td>
                    <td className="whitespace-nowrap"><Badge>{b.regionLabel}</Badge></td>
                    <td className="whitespace-nowrap text-xs">{b.hasSaleFacility ? '있음' : '없음'}</td>
                    <td className="whitespace-nowrap text-xs text-gold">{b.bountyZoneName ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableBox>
        </div>
      )}
    </div>
  );
}
