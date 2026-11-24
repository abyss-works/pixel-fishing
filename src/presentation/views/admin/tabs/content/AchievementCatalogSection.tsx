import { useState } from 'react';
import type {
  AchievementCatalogItem,
  BonusSeriesCatalogItem,
} from '../../../../../features/admin/model/contentCatalog';
import Badge from '../../../../ui/Badge';
import DataTable from '../../../../ui/DataTable';
import KpiTile from '../../../../ui/KpiTile';
import Note from '../../../../ui/Note';
import PillButton from '../../../../ui/PillButton';
import Subheading from '../../../../ui/Subheading';
import TableBox from '../../../../ui/TableBox';
import { fmtGold, fmtNum } from '../../../../ui/format';
import { KpiRow } from '../../layout';

type AchievementSubTab = 'all' | 'progress' | 'cosmetic' | 'bonus';

export default function AchievementCatalogSection({
  achievements, bonusSeries, cumulativeBonusCount,
}: {
  achievements: readonly AchievementCatalogItem[];
  bonusSeries: readonly BonusSeriesCatalogItem[];
  cumulativeBonusCount: number;
}) {
  const [subTab, setSubTab] = useState<AchievementSubTab>('all');

  const progressRows = achievements.filter(a => a.tab === 'progress');
  const cosmeticRows = achievements.filter(a => a.tab === 'cosmetic');
  const visibleAchievements = subTab === 'progress'
    ? progressRows
    : subTab === 'cosmetic'
      ? cosmeticRows
      : achievements;

  const showAchievements = subTab !== 'bonus';
  const showBonus = subTab === 'all' || subTab === 'bonus';

  return (
    <div className="flex flex-col gap-3">
      <KpiRow>
        <KpiTile label="수령형 업적" value={fmtNum(achievements.length)} hint="진행 + 치장" />
        <KpiTile label="진행 업적" value={fmtNum(progressRows.length)} hint="해역 기초·숙련 골드 보상" />
        <KpiTile label="치장 업적" value={fmtNum(cosmeticRows.length)} hint={`모자 보상 ${cosmeticRows.length}종`} />
        <KpiTile label="누적 보너스" value={`${bonusSeries.length}계열`}
                 hint={`정본 합계 ${cumulativeBonusCount}종 (단계별 패시브)`} />
      </KpiRow>

      <div className="flex flex-wrap items-center gap-1.5">
        <PillButton type="button" active={subTab === 'all'} onClick={() => setSubTab('all')}>
          전체
        </PillButton>
        <PillButton type="button" active={subTab === 'progress'} onClick={() => setSubTab('progress')}>
          진행 ({progressRows.length})
        </PillButton>
        <PillButton type="button" active={subTab === 'cosmetic'} onClick={() => setSubTab('cosmetic')}>
          치장 ({cosmeticRows.length})
        </PillButton>
        <PillButton type="button" active={subTab === 'bonus'} onClick={() => setSubTab('bonus')}>
          누적 보너스 ({bonusSeries.length}계열)
        </PillButton>
      </div>

      {showAchievements && (
        <div className="flex flex-col gap-1.5">
          <Subheading>수령형 업적 ({visibleAchievements.length}종)</Subheading>
          {visibleAchievements.length === 0 ? (
            <Note className="my-0">조건에 맞는 수령형 업적이 없어요.</Note>
          ) : (
            <TableBox className="max-h-[540px] p-2">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">분류</th>
                    <th className="text-left">이름</th>
                    <th className="text-left">조건 · 설명</th>
                    <th className="text-left">구역 · 해역</th>
                    <th className="text-right">목표</th>
                    <th className="text-left">보상</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAchievements.map(row => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">
                        <Badge>{row.cosmeticKindLabel ? `${row.tabLabel}·${row.cosmeticKindLabel}` : row.tabLabel}</Badge>
                      </td>
                      <td className="whitespace-nowrap font-medium text-text">{row.name}</td>
                      <td className="text-xs text-text-dim">{row.conditionSummary}</td>
                      <td className="whitespace-nowrap text-xs text-text-dim">
                        {row.spotName ? `${row.zoneName ?? ''} · ${row.spotName}` : (row.zoneName ?? '전역')}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">{fmtNum(row.target)}</td>
                      <td className="whitespace-nowrap">
                        {row.rewardGold !== null
                          ? <span className="pf-accent text-gold">{fmtGold(row.rewardGold)}</span>
                          : <span className="text-accent">{row.rewardLabel}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableBox>
          )}
        </div>
      )}

      {showBonus && (
        <div className="flex flex-col gap-1.5">
          <Subheading>누적 보너스 ({bonusSeries.length}계열 · 총 {cumulativeBonusCount}종)</Subheading>
          {bonusSeries.length === 0 ? (
            <Note className="my-0">조건에 맞는 누적 보너스 계열이 없어요.</Note>
          ) : (
            <TableBox className="max-h-[540px] p-2">
              <DataTable>
                <thead>
                  <tr>
                    <th className="text-left">범위</th>
                    <th className="text-left">계열명</th>
                    <th className="text-left">보너스 종류</th>
                    <th className="text-left">집계 기준</th>
                    <th className="text-left">단계별 목표 · 수치</th>
                    <th className="text-right">최대 합계</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusSeries.map(s => (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap">
                        <Badge>{s.scope === 'global' ? '전역' : (s.zoneName ?? '구역')}</Badge>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="font-medium text-text">{s.name}</div>
                        <div className="text-2xs text-text-dim">{s.desc}</div>
                      </td>
                      <td className="whitespace-nowrap text-xs">{s.bonusKindLabel}</td>
                      <td className="text-2xs font-mono text-text-dim whitespace-nowrap">{s.metricSummary}</td>
                      <td className="text-xs text-text-dim">
                        {s.steps.map(st => `${st.label} (${st.deltaLabel})`).join(' → ')}
                      </td>
                      <td className="text-right pf-accent text-gold whitespace-nowrap">{s.maxBonusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableBox>
          )}
        </div>
      )}
    </div>
  );
}
