// 유물 카드 — 수배판 유물 탭의 교환 카드. 네임드 토벌 카드와 같은 모양으로 머리에 유물 이름(전승은 툴팁),
// 보유한 레벨 유물은 이름 옆에 보유 레벨(Lv.N)을 보이고, 전설 유물은 레벨 대신 효과 줄에 보너스와 페널티를 보인다.
// 본문은 등급, 효과, 교환 재료의 줄 목록, 맨 아래에 교환 버튼이다. 효과 문장은 artifactEffectLines가 data에서 뽑는다.
import { REJECT_TEXT } from '../../../../game/rules/logic.js';
import { artifactHasLevel } from '../../../../game/content/artifacts.js';
import type { Artifact } from '../../../../game/content/artifacts.js';
import { levelText } from '../../../../features/inventory/model/artifactLevel';
import Button from '../../../ui/Button';
import Frame from '../../../ui/Frame';
import Tip from '../../../ui/Tip';
import { RarityText } from '../../../ui/fish/RarityTag';
import { artifactEffectLines, artifactSystemLines } from '../../../ui/artifactEffects';
import { BoardRows } from './boardParts';

export default function RelicCard({ artifact, owned, level, materialCount, busy, onExchange }: {
  artifact: Artifact;
  owned: boolean;
  /** 효과 문장에 쓸 레벨 - 갖지 않았으면 1 */
  level: number;
  materialCount: number;
  busy: boolean;
  onExchange: () => void;
}) {
  const { bonus, penalty } = artifactSystemLines(artifact);
  const effects = [
    ...artifactEffectLines(artifact, level).map(line => ({ line, tone: 'text-accent' })),
    ...(bonus ? [{ line: bonus, tone: 'text-accent' }] : []),
    ...(penalty ? [{ line: penalty, tone: 'text-danger' }] : []),
  ];
  const exchange = <Button variant="primary" full disabled={materialCount < 1 || busy} onClick={onExchange}>교환</Button>;
  return (
    <Frame className="bg-surface-2 p-3 flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-baseline gap-2 h-6">
        <b className="text-base text-gold truncate"><Tip text={artifact.lore}>{artifact.name}</Tip></b>
        {owned && artifactHasLevel(artifact) && <span className="text-xs text-text-dim shrink-0">{levelText(level)}</span>}
      </div>
      <BoardRows rows={[
        { key: 'grade', label: '등급', value: <><RarityText rarity={artifact.grade} /> 유물</> },
        ...effects.map(({ line, tone }, i) => ({
          key: `effect-${i}`, label: i === 0 ? '효과' : '', value: <span className={tone}>{line}</span>,
        })),
        { key: 'material', label: <Tip text="교환 재료는 네임드 토벌 보상으로 받아요.">교환 재료</Tip>,
          value: <>{artifact.materialName} <span className="pf-accent">{materialCount}/1</span></> },
      ]} />
      <div className="mt-auto">
        {owned
          ? <Button full disabled>보유 중</Button>
          : materialCount < 1
            ? <Tip wraps text={REJECT_TEXT['material-missing']} className="block">{exchange}</Tip>
            : exchange}
      </div>
    </Frame>
  );
}
