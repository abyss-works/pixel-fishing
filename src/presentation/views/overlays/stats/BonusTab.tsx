import { BONUS_CATEGORIES } from '../../../../features/gameplay/model/stats';
import type { BonusCategory, BonusRow } from '../../../../features/gameplay/model/stats';
import Badge from '../../../ui/Badge';
import Frame from '../../../ui/Frame';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PixelIcon from '../../../ui/PixelIcon';
import type { GlyphId } from '../../../ui/PixelIcon';
import Subheading from '../../../ui/Subheading';
import { artifactEffectLine } from '../../../ui/artifactEffects';
import { baitEffectLine } from '../../../ui/baitEffects';

const CATEGORY: Record<BonusCategory, { label: string; glyph: GlyphId }> = {
  move: { label: '이동', glyph: 'boat' },
  fish: { label: '낚시', glyph: 'fish' },
  duel: { label: '결투', glyph: 'star' },
  shop: { label: '상점', glyph: 'coin' },
};

/** 효과 문장 — 유물·미끼는 기존 문장 함수에서 뽑는다. 낚싯대는 낚싯대 표와 같은 이름을 쓴다 */
function effectText(row: BonusRow): string {
  const s = row.source;
  if (s.kind === 'relic') return artifactEffectLine(s.artifact, s.effect) ?? '';
  if (s.kind === 'bait') return baitEffectLine(s.bait);
  if (s.stat === 'manual') return `수동 확률 보정 ×${s.value.toFixed(1)}`;
  return `${s.stat === 'good' ? 'GOOD' : 'PERFECT'} 영역 ${Math.round(s.value)}%`;
}

function sourceText(row: BonusRow): string {
  const s = row.source;
  if (s.kind === 'relic') return s.artifact.name;
  if (s.kind === 'bait') return s.bait.name;
  return `낚싯대 파워 · ${s.spot.name}`;
}

// 보너스 탭 — 지금 받는 효과만 이동·낚시·결투·상점으로 모은다. 줄마다 출처를 꼬리표로 붙인다.
// 받는 효과가 없는 갈래도 자리를 지켜 예시마다 창 모양이 같다.
export default function BonusTab({ rows }: { rows: BonusRow[] }) {
  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      <Inset className="px-3 py-2 flex items-center justify-between text-sm">
        <span className="text-text-dim">지금 받는 보너스</span>
        <span className="pf-accent text-lg text-gold">{rows.length}개</span>
      </Inset>
      <div className="flex-1 min-h-0 overflow-y-auto pf-scroll-panel flex flex-col gap-2">
        {BONUS_CATEGORIES.map(category => {
          const list = rows.filter(row => row.category === category);
          return (
            <section key={category} className="flex flex-col gap-1">
              <Subheading className="flex items-center gap-1.5 mb-0">
                <PixelIcon glyph={CATEGORY[category].glyph} size={12} />{CATEGORY[category].label}
              </Subheading>
              <Frame divided>
                {list.length > 0 ? list.map(row => (
                  <div key={`${sourceText(row)}-${effectText(row)}`} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-accent">{effectText(row)}</span>
                      {row.manualOnly && <span className="text-2xs text-text-dim">직접 낚을 때만</span>}
                    </span>
                    <Badge>{sourceText(row)}</Badge>
                  </div>
                )) : (
                  <div className="px-2 py-1.5 text-sm text-text-dim">받는 보너스가 없어요.</div>
                )}
              </Frame>
            </section>
          );
        })}
      </div>
      <Note size="xs" className="my-0">
        유물은 수배판에서 네임드 토벌 재료로 바꿀 수 있어요. 미끼는 가방에서 켜고 끌 수 있어요. 낚싯대 보너스는 고른 해역 기준이에요.
      </Note>
    </div>
  );
}
