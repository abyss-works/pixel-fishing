import type { GameState } from '../../../../../game/rules/logic';
import type { ZoneId } from '../../../../../game/content/zones';
import DexGrid from './DexGrid';

// 도감 일반 화면 — 기본형 발견 기준 격자
export default function DexBaseView({ game, sub, onSub }: {
  game: GameState;
  sub: ZoneId;
  onSub: (z: ZoneId) => void;
}) {
  return <DexGrid game={game} view="base" sub={sub} onSub={onSub} />;
}
