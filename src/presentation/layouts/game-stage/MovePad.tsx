import { PAD_KNOB_PX, PAD_RING_PX } from '../../../game/runtime/movePad';
import type { Pad } from '../../../game/runtime/movePad';

// 모바일 이동용 원 패드 — 누른 자리에 고리가 서고 손잡이가 손가락을 따라간다.
// 지도 틀과 툴팁 버블처럼 기능 요소에 둥근 모양을 쓰는 예외다. 눌림은 아래 캔버스가 받는다.
export default function MovePad({ pad }: { pad: Pad }) {
  const ringLeft = pad.origin.x - PAD_RING_PX / 2;
  const ringTop = pad.origin.y - PAD_RING_PX / 2;
  return (
    <div aria-hidden="true" className="absolute z-(--z-overlay) pointer-events-none rounded-full border-2 border-line
                                       bg-[color-mix(in_oklab,var(--c-bg)_45%,transparent)]"
         style={{ left: ringLeft, top: ringTop, width: PAD_RING_PX, height: PAD_RING_PX }}>
      <div className="absolute rounded-full border-2 border-gold-dark bg-[color-mix(in_oklab,var(--c-gold)_70%,transparent)]"
           style={{
             width: PAD_KNOB_PX, height: PAD_KNOB_PX,
             left: (PAD_RING_PX - PAD_KNOB_PX) / 2 + pad.knob.x - 2,
             top: (PAD_RING_PX - PAD_KNOB_PX) / 2 + pad.knob.y - 2,
           }} />
    </div>
  );
}
