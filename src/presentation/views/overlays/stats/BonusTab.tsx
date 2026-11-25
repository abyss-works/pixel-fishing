import { Fragment } from 'react';
import { BONUS_CATEGORIES } from '../../../../features/gameplay/model/stats';
import type { BonusCategory, BonusRow } from '../../../../features/gameplay/model/stats';
import { cx } from '../../../ui/cx';
import { useMobileLayout } from '../../../layouts/useMobileLayout';
import ItemSprite from '../../../ui/ItemSprite';
import TableBox from '../../../ui/TableBox';
import DataTable from '../../../ui/DataTable';
import Tip, { TipCard, TipList } from '../../../ui/Tip';
import { artifactEffectLine, artifactEffectValue } from '../../../ui/artifactEffects';
import { fmtDecimal2 } from '../../../ui/format';
import { bonusEffectText, bonusEffectValue } from '../../../../features/guild/model/guild';
import { SLOT_SCOPE } from '../../../../features/kitchen/model/recipes';
import {
  FORTUNE_SOURCE_HELP,
  FORTUNE_SOURCE_LABEL,
  FORTUNE_TARGET_BONUS_LABEL,
  POTION_SOURCE_HELP,
  fortuneBonusText,
  fortuneBonusTip,
} from '../../../../features/fortune/model/fortune';

const CATEGORY_LABEL: Record<BonusCategory, string> = { move: '이동', fish: '낚시', duel: '결투', shop: '상점' };
const SOURCE_HELP = [
  '유물은 수배판에서 네임드 토벌 재료로 바꿀 수 있어요.',
  '길드 보너스는 길드 창에서 기부와 개인 자유 강화로 올려요.',
  '업적 누적 보너스는 업적 조건 단계에 닿으면 자동으로 적용돼요.',
  FORTUNE_SOURCE_HELP,
  POTION_SOURCE_HELP,
];
const HEAD = 'h-[30px] font-normal border-b border-line';

/** 효과 문장 — 유물과 길드 보너스의 기존 문장 함수와 슬롯·업적 누적·운세·물약 효과 줄에서 뽑는다 */
function effectText(row: BonusRow): string {
  switch (row.source.kind) {
    case 'relic': return artifactEffectLine(row.source.artifact, row.source.effect, row.source.level, row.source.scale) ?? '';
    case 'guild': return bonusEffectText(row.source.bonus, row.source.value);
    case 'slot': return `${row.source.effect.label} ${row.source.effect.value}`;
    case 'achievement': return `${row.source.label} ${row.source.value}`;
    case 'fortune': return fortuneBonusText(row.source.fortune);
    case 'potion': {
      const pct = Math.round(row.source.bonus * 1000) / 10;
      return `${FORTUNE_TARGET_BONUS_LABEL[row.source.target]} +${pct}%p`;
    }
  }
}

/** 유물 배율이 적용된 행의 내역 툴팁 — 기본 효과·보유 유물 효과·적용 효과를 목록으로 보인다 */
function relicTipRows(row: BonusRow): { label: string; value: string }[] | null {
  if (row.source.kind !== 'relic' || row.source.scale <= 1) return null;
  const { artifact, effect, level, scale } = row.source;
  const base = artifactEffectValue(artifact, effect, level);
  const applied = artifactEffectValue(artifact, effect, level, scale);
  if (base === null || applied === null) return null;
  const boostPct = fmtDecimal2(Math.round((scale - 1) * 1e9) / 1e7);
  return [
    { label: `유물 기본(Lv.${level})`, value: base },
    { label: '보유 유물 효과', value: `+${boostPct}%` },
    { label: '적용 효과', value: applied },
  ];
}

/** 개인 자유 강화가 적용된 길드 보너스의 내역 툴팁 — 기본 단계·개인 자유 강화·합계를 목록으로 보인다 */
function guildTipRows(row: BonusRow): { label: string; value: string }[] | null {
  if (row.source.kind !== 'guild' || !row.source.enhanceRank || row.source.enhanceRank <= 0) return null;
  const { bonus, baseRank = 0, enhanceRank, baseValue = 0, enhanceValue = 0, value } = row.source;
  return [
    { label: `기본 ${baseRank}단계`, value: bonusEffectValue(bonus, baseValue) },
    { label: `개인 자유 강화 ${enhanceRank}단계`, value: bonusEffectValue(bonus, enhanceValue) },
    { label: `합계 ${baseRank + enhanceRank}단계`, value: bonusEffectValue(bonus, value) },
  ];
}
function sourceText(row: BonusRow): string {
  switch (row.source.kind) {
    case 'relic': return row.source.artifact.name;
    case 'guild': return `길드 Lv.${row.source.level}`;
    case 'slot': return row.source.label;
    case 'achievement': return '업적 누적';
    case 'fortune': return FORTUNE_SOURCE_LABEL;
    case 'potion': return row.source.potion.name;
  }
}

// 보너스 탭: 지금 받는 효과를 이동, 낚시, 결투, 상점 갈래로 묶은 표(받는 효과, 출처)다.
// 받는 효과가 없는 갈래도 자리를 지켜 예시마다 표 모양이 같다. 출처를 얻는 방법은 출처 열 머리의 툴팁이다.
// 모바일 레이아웃에서는 출처 열을 칸 폭의 비율로 두고 표의 최소 폭을 풀어 가로 스크롤 없이 들어가게 하며, 효과와 출처는 말줄임 대신 줄을 바꾼다.
export default function BonusTab({ rows }: { rows: BonusRow[] }) {
  const mobile = useMobileLayout();
  const cell = mobile ? 'break-keep' : 'truncate';
  return (
    <TableBox className="flex-1 min-h-0 px-3 pb-2">
      <DataTable cols={mobile ? [null, '35%'] : [null, '150px']} nameMin={mobile ? '0px' : '10rem'} className={mobile ? 'min-w-0!' : undefined}>
        <thead>
          <tr className="sticky top-0 z-1 bg-[color-mix(in_oklab,var(--c-bg)_45%,var(--c-surface))] text-2xs text-text-dim">
            <th className={cx(HEAD, 'text-left')}>받는 효과</th>
            <th className={cx(HEAD, 'text-right')}>
              <Tip text={(
                <TipCard
                  title="보너스 출처"
                  description={<span className="flex flex-col gap-1">{SOURCE_HELP.map(line => <span key={line}>{line}</span>)}</span>}
                />
              )}>출처</Tip>
            </th>
          </tr>
        </thead>
        <tbody>
          {BONUS_CATEGORIES.map((category, ci) => {
            const list = rows.filter(row => row.category === category);
            return (
              <Fragment key={category}>
                <tr>
                  <th colSpan={2} scope="colgroup"
                      className={cx('h-[26px] text-left text-2xs font-normal text-text-dim', ci > 0 && 'border-t border-line')}>
                    {CATEGORY_LABEL[category]}
                  </th>
                </tr>
                {list.length > 0 ? list.map(row => {
                  const text = effectText(row);
                  const tipRows = relicTipRows(row) ?? guildTipRows(row);
                  const tipContent = tipRows
                    ? <TipList rows={tipRows} />
                    : row.source.kind === 'fortune'
                      ? fortuneBonusTip(row.source.fortune)
                      : row.source.kind === 'potion'
                        ? row.source.potion.description
                        : null;
                  return (
                    <tr key={`${sourceText(row)}-${text}`}>
                      <td className={cx('h-[34px] border-t border-line/60', cell)}>
                        <span className="text-accent">
                          {tipContent ? <Tip text={tipContent}>{text}</Tip> : text}
                        </span>
                        {row.manualOnly && <span className="ml-2 text-2xs text-text-dim">{SLOT_SCOPE.bait}</span>}
                        {row.autoOnly && <span className="ml-2 text-2xs text-text-dim">{SLOT_SCOPE.lunch}</span>}
                      </td>
                      <td className={cx('h-[34px] border-t border-line/60 text-right text-xs', cell)}>
                        {row.source.kind === 'potion' ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <ItemSprite kind="potion" id={row.source.potion.id} preset="row" className="shrink-0" />
                            <span>{row.source.potion.name}</span>
                          </span>
                        ) : sourceText(row)}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={2} className="h-[34px] border-t border-line/60 text-xs text-text-dim">받는 보너스가 없어요.</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
    </TableBox>
  );
}
