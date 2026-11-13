import { TipList } from './Tip';

// 요리 효과 툴팁 내용 - 요리 이름, 효과 줄(이름 왼쪽, 값 오른쪽), 적용 낚시와 지속 안내.
// 슬롯 칩과 가방 아이템 섹션의 요리 이름이 같은 내용을 쓴다. 문안은 기능 모델이 정한다.
export default function RecipeEffectTip({ label, effects, note }: {
  label: string;
  effects: { label: string; value: string }[];
  note: string;
}) {
  return (
    <span className="flex flex-col gap-1">
      <b>{label}</b>
      <TipList rows={effects} note={note} />
    </span>
  );
}
