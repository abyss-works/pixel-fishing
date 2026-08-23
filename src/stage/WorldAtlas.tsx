import { useEffect, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { renderAtlas, ATLAS_W, ATLAS_H } from '../pixel';

// 세계지도 — 미니맵 클릭으로 열리는 전체 지구 조망 (R23b).
// 정적 아틀라스라 루프 없이 1회 렌더. jsdom엔 canvas가 없어 null 가드로 건너뛴다.
export default function WorldAtlas({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (ctx) renderAtlas(ctx);
  }, []);
  return (
    <Modal layer="app" title="세계지도" onClose={onClose} className="w-[min(920px,94vw)]">
      <canvas ref={ref} width={ATLAS_W} height={ATLAS_H}
              className="w-full h-auto [image-rendering:pixelated] border border-line rounded-sm"
              aria-label="세계지도" />
      <p className="text-xs text-text-dim leading-[1.7] mt-2">
        서쪽으로 지구 한 바퀴 — 0 고향에서 출항해 1 태평양, 2 동남아&오세아니아, 3 인도양,
        4 대서양을 지나 5 미국 근해. 마지막 항로는 6 북극과 7 남극이다.
        반투명 물은 아직 열리지 않은 바다.
      </p>
      <div className="flex justify-end mt-2">
        <Button onClick={onClose}>닫기</Button>
      </div>
    </Modal>
  );
}
