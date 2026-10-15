import type { GameState } from '../../../../../game/rules/logic';
import type { ZoneId } from '../../../../../game/content/zones';
import DexGrid from './DexGrid';

// 도감 돌연변이 화면 — 변이형 발견 기준 격자
export default function DexVariantView({ game, sub, onSub }: {
  game: GameState;
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  return <DexGrid game={game} view="variant" sub={sub} onSub={onSub} />;
}
