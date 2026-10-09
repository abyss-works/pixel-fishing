// 유물 카드 — 수배판 유물 탭의 교환 카드. 일반 카드와 같은 디자인 언어
// (프레임·마스트헤드·룰선·중앙정렬)를 쓴다. 효과 수치는 data에서 뽑아 적는다 —
// 손으로 적으면 밸런스를 바꾸는 순간 옛 숫자로 남는다(HelpPanel 선례).
import type { Artifact } from '../data/artifacts.js';
import Button from '../ui/Button';
import { RarityText } from '../ui/RarityTag';

/** 효과 행 — data 수치에서 문장을 뽑는다. 없는 효과는 행을 내지 않는다 */
function effectLines(a: Artifact): string[] {
  const out: string[] = [];
  if ((a.effects.sail ?? 0) > 0) out.push(`항해 속도 +${Math.round(a.effects.sail! * 100)}%`);
  if ((a.effects.walk ?? 0) > 0) out.push(`도보 속도 +${Math.round(a.effects.walk! * 100)}%`);
  if (a.effects.nightImmune) out.push('밤 이동 감속 제거');
  if ((a.effects.baitDiscount ?? 0) > 0) {
    out.push(`미끼값 −${Math.round(a.effects.baitDiscount! * 100)}%`);
  }
  return out;
}

export default function RelicCard({ artifact, owned, materialCount, busy, onExchange }: {
  artifact: Artifact;
  owned: boolean;
  materialCount: number;
  busy: boolean;
  onExchange: () => void;
}) {
  return (
    <div className="border border-gold rounded-sm p-4 text-center flex flex-col gap-2 text-sm bg-surface min-h-96 h-full">
      <b className="pf-accent text-gold text-lg">{artifact.name}</b>
      <div className="border-b border-line" />
      <span className="flex-1 content-center flex flex-col gap-1">
        <span><RarityText rarity={artifact.grade} /> 등급 유물</span>
        <span className="text-text-dim italic text-xs">{artifact.lore}</span>
        {effectLines(artifact).map(line => (
          <span key={line} className="text-accent text-xs">{line}</span>
        ))}
        <span className="text-text-dim text-xs">
          {artifact.materialName} 보유 {materialCount}/1
        </span>
      </span>
      <div className="border-b border-line" />
      <span className="flex justify-center mt-auto">
        {owned
          ? <Button size="sm" disabled>보유 중</Button>
          : <Button variant="primary" disabled={materialCount < 1 || busy} onClick={onExchange}>교환하기</Button>}
      </span>
    </div>
  );
}
