import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// 호버 도움말 — 요소 옆에 붙는 작은 물음표 (사용자 지정 2026-08-24).
// 네이티브 title 툴팁이 아니라 **게임 스타일 버블**을 띄운다(브라우저 기본 툴팁은
// 게임 톤과 어긋난다는 피드백). 문장은 호출자가 아니라 서비스/데이터가 갖는다
// (stats.powerHelpText처럼) — UI에서 규칙 서술을 재작성하지 않는다.
//
// 구현: mouseenter/focus 시 rect를 재고 document.body에 portal로 fixed 버블을 띄운다.
// overflow-y-auto 모달 안에서도 안 잘리고, z-index가 모달 위로 온다.
// 터치(호버 없음) 대비 onClick 토글도 받는다.

interface Props {
  text: string;
}

export default function HelpHint({ text }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    // jsdom 등 rect를 못 주는 환경(0×0)에선 원점 기준으로라도 렌더한다 — 테스트가 본문을 봐야 하므로.
    // 배치는 표준형: 앵커의 좌상단에 포인터, 버블은 우하단(중앙 정렬로 끌어오지 않는다 — 사용자 지정).
    setPos(r && (r.width || r.height) ? { x: r.left, y: r.bottom + 6 } : { x: 0, y: 0 });
  };
  const hide = () => setPos(null);

  return (
    <>
      <span ref={ref} role="button" aria-label="도움말"
            onMouseEnter={show} onMouseLeave={hide}
            onFocus={show} onBlur={hide}
            onClick={() => (pos ? hide() : show())}
            className="inline-flex items-center justify-center w-[15px] h-[15px] ml-1 align-middle
                       rounded-full border border-line bg-[color:var(--c-surface-2)]
                       text-text-dim text-[10px] leading-none cursor-help select-none">
        ?
      </span>
      {pos && createPortal(
        <div role="tooltip"
             className="fixed z-20 w-max max-w-[280px] px-2 py-1.5 rounded-sm
                        border border-line bg-bg shadow-panel
                        text-xs leading-[1.6] text-text-dim pointer-events-none animate-fade-in"
             style={{ left: pos.x, top: pos.y }}>
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
