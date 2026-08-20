import { BOATS } from './logic';
import type { GameState } from './logic';

interface Props { title: string; game: GameState }

// 캔버스 위 반투명 자원 오버레이 — 골드/명성/배/낚싯대/가방 (Home·Field 공용, 좌상단 고정)
export default function ResourceBar({ title, game }: Props) {
  return (
    <div className="hud-overlay">
      <span className="hud-title">{title}</span>
      <div className="hud">
        <span>💰 <b>{game.gold}</b>G</span>
        <span>⭐ 명성 <b>{game.fame}</b></span>
        <span>⛵ <b>{game.boat === 0 ? '배 없음' : BOATS[game.boat - 1].name}</b></span>
        <span>🎣 낚싯대 Lv.<b>{game.rod}</b></span>
        <span>🐟 <b>{game.bag.length}</b>마리</span>
      </div>
    </div>
  );
}
