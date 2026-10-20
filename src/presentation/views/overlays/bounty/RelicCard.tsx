// 유물 카드 — 수배판 유물 탭의 교환 카드. 일반 카드와 같은 디자인 언어
// (프레임·마스트헤드·룰선·중앙정렬)를 쓴다. 효과 문장은 artifactEffectLines가 data에서 뽑는다.
import type { Artifact } from '../../../../game/content/artifacts.js';
import Button from '../../../ui/Button';
import { RarityText } from '../../../ui/fish/RarityTag';
import { artifactEffectLines } from '../../../ui/artifactEffects';

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
        {artifactEffectLines(artifact).map(line => (
          <span key={line} className="text-accent text-xs">{line}</span>
        ))}
        <span className="text-text-dim text-xs">
          {artifact.materialName} 보유 {materialCount}/1
        </span>
        {!owned && materialCount < 1 && (
          <span className="text-text-dim text-xs">교환 재료는 네임드 토벌 보상으로 받아요.</span>
        )}
      </span>
      <div className="border-b border-line" />
      <span className="flex justify-center mt-auto">
        {owned
          ? <Button size="sm" disabled>보유 중</Button>
          : <Button variant="primary" full disabled={materialCount < 1 || busy} onClick={onExchange}>교환</Button>}
      </span>
    </div>
  );
}
