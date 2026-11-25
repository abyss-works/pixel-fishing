import type { ReactNode } from 'react';
import { HighlightRarityText } from './fish/RarityTag';
import { TipCard } from './Tip';

// 요리 효과 툴팁 내용 - 요리 이름, 효과 줄(이름 왼쪽, 값 오른쪽), 적용 낚시와 지속 안내.
// 슬롯 칩과 가방 아이템 섹션의 요리 이름이 같은 내용을 쓴다. 문안은 기능 모델이 정한다.
export default function RecipeEffectTip({ label, effects, note }: {
  label: ReactNode;
  effects: readonly { label: ReactNode; value: ReactNode }[];
  note: ReactNode;
}) {
  const rows = effects.map(e => ({
    label: typeof e.label === 'string' ? <HighlightRarityText text={e.label} /> : e.label,
    value: typeof e.value === 'string' ? <HighlightRarityText text={e.value} /> : e.value,
  }));
  return <TipCard title={label} rows={rows} note={note} />;
}
