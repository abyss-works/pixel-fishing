import type { ReactNode } from 'react';
import ScrollRow from './ScrollRow';

// 가로 카드 줄 — 한 화면에 `perView`장이 들어가고, 넘치면 좌우로 밀어 본다(ScrollRow).
const GAP_REM = 0.25; // gap-1

export default function CardCarousel({ perView, children }: { perView: number; children: ReactNode }) {
  return (
    // 한 화면에서 한 장 남기고 민다 — 통째로 넘기면 어디까지 봤는지 감각이 끊긴다
    <ScrollRow step={(perView - 1) / perView}
               innerClassName="snap-x snap-mandatory [&>*]:snap-start"
               // 카드 폭을 부모에서 파생한다 — 자식은 `basis-(--card-w)`만 쓰면 된다.
               // 사이드바 폭이 바뀌어도 한 화면에 perView장이 유지된다.
               style={{ ['--card-w' as string]:
                 `calc((100% - ${(perView - 1) * GAP_REM}rem) / ${perView})` }}>
      {children}
    </ScrollRow>
  );
}
