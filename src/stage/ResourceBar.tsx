import { BOATS } from '../game/logic';
import type { GameState } from '../game/logic';
import PixelIcon from '../ui/PixelIcon';

interface Props { title: string; game: GameState }

// 캔버스 위 반투명 자원 오버레이 — 골드/명성/배/낚싯대/가방 (Home·Field 공용, 좌상단 고정)
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon). 골드만 텍스트 라벨이 없어 sr-only로 보충
// (스크린리더 + 테스트가 '골드 60G'로 읽는다).
export default function ResourceBar({ title, game }: Props) {
  return (
    <div className="absolute top-3 left-3 z-(--z-overlay) flex items-center gap-2 max-w-[calc(100%-24px)]
                    bg-[rgba(10,21,38,0.72)] backdrop-blur-[4px] border-2 border-line pf-notch pf-bevel
                    px-3 py-1 pointer-events-none [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
      <span className="text-gold font-bold text-xs whitespace-nowrap">{title}</span>
      {/* .hud 클래스는 스타일이 아니라 테스트 훅(app.test querySelector) — 유지 */}
      <div className="hud flex items-center gap-3 flex-wrap
                      [&>span]:flex [&>span]:items-center [&>span]:gap-1 [&>span]:text-xs [&>span]:text-text-dim [&>span]:whitespace-nowrap
                      [&_b]:text-gold [&_b]:font-pixel [&_b]:tracking-[0.5px]">
        <span><PixelIcon glyph="coin" /><span className="sr-only">골드 </span><b>{game.gold}</b>G</span>
        <span><PixelIcon glyph="star" />명성 <b>{game.fame}</b></span>
        <span><PixelIcon glyph="boat" /><b>{game.boat === 0 ? '배 없음' : BOATS[game.boat - 1].name}</b></span>
        <span><PixelIcon glyph="rod" />낚싯대 Lv.<b>{game.rod}</b></span>
        <span><PixelIcon glyph="fish" /><b>{game.bag.length}</b>마리</span>
      </div>
    </div>
  );
}
