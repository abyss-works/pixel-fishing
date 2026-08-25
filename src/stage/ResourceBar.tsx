import type { ReactNode } from 'react';
import { BOATS } from '../game/logic';
import type { GameState } from '../game/logic';
import PixelIcon from '../ui/PixelIcon';
import type { GlyphId } from '../ui/PixelIcon';

// 캔버스 위 반투명 자원 오버레이 (Base·Field 공용, 좌상단).
//
// **칸마다 2행 — 위가 이름, 아래가 값.** 바 전체로는 한 줄이고, 칸마다 가운데 정렬이다
// (이름과 값의 길이가 서로 달라 왼쪽 정렬하면 두 줄이 어긋나 보인다).
// 한 줄에 `이름 값`을 나란히 두면 값 길이가 바뀔 때마다 뒤쪽 항목이 통째로 밀려서, 눈이
// 같은 자리를 다시 찾아야 했다. 이름을 위로 올리면 **이름 줄이 자리표**가 되고 값만 아래에서
// 바뀐다. 값은 픽셀 폰트(고정폭)라 자릿수가 늘어도 흔들림이 작다.
//
// **지역 이름은 뺐다** — 지역 탭 상단이 이미 그 지역을 제목으로 달고 있다. 같은 정보를 두
// 곳에 두면 한쪽만 고쳐질 때 갈라진다.
//
// 자원 기호는 이모지 대신 픽셀 아이콘(PixelIcon) — v0.4.1 이모지 폐지.
function Stat({ glyph, label, children }: { glyph: GlyphId; label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center justify-center gap-1 whitespace-nowrap">
      {/* 끝의 공백은 의도적이다 — 두 행이 붙어 textContent가 "골드60G"가 되면 HUD를
          문자열로 읽는 테스트(app.test의 hud())가 값을 못 찾는다. 지우지 말 것. */}
      <span className="flex items-center gap-1 text-xs leading-none text-text-dim">
        <PixelIcon glyph={glyph} size={11} />{label}{' '}
      </span>
      <span className="text-base leading-none text-gold font-pixel tracking-[0.5px]">{children}</span>
    </span>
  );
}

export default function ResourceBar({ game, onOpen }: { game: GameState; onOpen?: () => void }) {
  return (
    <div className="absolute top-3 left-3 z-(--z-overlay) max-w-[calc(100%-24px)]
                    bg-[rgba(10,21,38,0.72)] backdrop-blur-[4px] border-2 border-line pf-notch pf-bevel
                    px-4 py-2 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
      {/* 자원 바 클릭 = 스탯창 (next.md 2). .hud 클래스는 스타일이 아니라 테스트 훅(app.test querySelector) — 유지 */}
      <button type="button" aria-label="스탯창 열기" onClick={onOpen}
              className="hud flex items-stretch gap-4 cursor-pointer transition hover:brightness-125
                         [&>span+span]:border-l [&>span+span]:border-line [&>span+span]:pl-4">
        <Stat glyph="coin" label="골드"><b className="font-bold">{game.gold}</b>G</Stat>
        <Stat glyph="star" label="명성"><b className="font-bold">{game.fame}</b></Stat>
        <Stat glyph="fish" label="가방"><b className="font-bold">{game.bag.length}</b>마리</Stat>
        <Stat glyph="boat" label="배">{game.boat === 0 ? '없음' : BOATS[game.boat - 1].name}</Stat>
        <Stat glyph="rod" label="낚싯대">Lv.<b className="font-bold">{game.rod}</b></Stat>
      </button>
    </div>
  );
}
