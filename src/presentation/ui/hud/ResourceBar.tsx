import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { boatNameOf } from '../../../game/rules/logic';
import type { GameState } from '../../../game/rules/logic';
import { useBounty } from '../../../features/bounty/service/useBounty';
import { acceptsLeft } from '../../../features/bounty/model/panel';
import Divider from '../Divider';
import { fmtCompact } from '../format';
import PixelIcon from '../PixelIcon';
import type { GlyphId } from '../PixelIcon';

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
//
// **골드·명성은 네 자리 줄임 표기(fmtCompact)** — 값이 커져도 칸 폭이 거의 그대로다.
// **칸은 처음부터 모두 그린다** — 서버 값(수주/토벌)이 아직 없으면 자리만 두고 "–"를 보인다.
// 늦게 도착한 칸이 끼어들며 바 전체가 늘어나지 않게 하려는 것이다.
function Stat({ glyph, label, children }: { glyph: GlyphId; label: string; children: ReactNode }) {
  return (
    <span className="flex flex-col items-center justify-center gap-1 whitespace-nowrap">
      {/* 끝의 공백은 의도적이다 — 두 행이 붙어 textContent가 "골드60G"가 되면 HUD를
          문자열로 읽는 테스트(app.test의 hud())가 값을 못 찾는다. 지우지 말 것. */}
      <span className="flex items-center gap-1 text-xs leading-none text-text-dim">
        <PixelIcon glyph={glyph} size={11} />{label}{' '}
      </span>
      <span className="text-base leading-none text-gold pf-accent">{children}</span>
    </span>
  );
}

const UNKNOWN = '–';

export default function ResourceBar({ game, onOpen }: { game: GameState; onOpen?: () => void }) {
  // 남은 수주(일반)·토벌(네임드) — 서버(DB)가 진실이다. 불러오는 중이거나 오프라인이면
  // 숫자 대신 "–"를 둔다 (0으로 보이면 거짓말이다).
  const { snap } = useBounty();
  const left = acceptsLeft(snap);
  const stats = [
    <Stat key="gold" glyph="coin" label="골드"><b className="font-bold">{fmtCompact(game.gold)}</b>G</Stat>,
    <Stat key="fame" glyph="star" label="명성"><b className="font-bold">{fmtCompact(game.fame)}</b></Stat>,
    <Stat key="bag" glyph="fish" label="가방"><b className="font-bold">{game.bag.length}</b>마리</Stat>,
    <Stat key="boat" glyph="boat" label="배">{boatNameOf(game.boat)}</Stat>,
    <Stat key="rod" glyph="rod" label="낚싯대">Lv.<b className="font-bold">{game.rod}</b></Stat>,
    <Stat key="bounty" glyph="ticket" label="수주/토벌">
      <span className="inline-flex items-center gap-1.5">
        <b className="font-bold">{left?.general ?? UNKNOWN}</b>
        <Divider vertical />
        <b className="font-bold">{left?.named ?? UNKNOWN}</b>
      </span>
    </Stat>,
  ];
  return (
    <div className="absolute top-3 left-3 z-(--z-overlay) max-w-[calc(100%-24px)]
                    pf-glass border-2 border-line pf-notch pf-bevel px-4 py-2">
      {/* 자원 바 클릭 = 스탯창. .hud 클래스는 스타일이 아니라 querySelector 테스트 훅이므로 유지 */}
      <button type="button" aria-label="스탯창 열기" onClick={onOpen}
              className="hud flex items-stretch gap-4 cursor-pointer transition hover:brightness-125">
        {stats.map((stat, i) => (
          <Fragment key={stat.key}>
            {i > 0 && <Divider vertical />}
            {stat}
          </Fragment>
        ))}
      </button>
    </div>
  );
}
