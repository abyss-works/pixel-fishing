import { setCanvasCover, useCanvasCover } from '../canvasCover';
import { cx } from '../../ui/cx';
import SectionTitle from '../../ui/SectionTitle';

// 도구 탭 — 운영·개발 유틸. 첫 항목은 캔버스 덮개(겉보기 위장).
export default function ToolsTab() {
  const canvasCover = useCanvasCover();

  return (
    <div className="flex flex-col gap-4 max-w-[560px]">
      <SectionTitle>표면 위장 — 캔버스 덮개</SectionTitle>
      <div className="flex items-center justify-between gap-2 border border-line rounded-sm px-2 py-1.5">
        <span className="text-xs text-text-dim">
          게임 화면의 캔버스 요소만 내려 표시를 숨긴다 — 컴포넌트는 살아 있고 게임도 계속 돈다.
          UI 세부 조정 등 눈치 볼 필요가 있을 때만. 설정은 브라우저에 유지된다.
        </span>
        <button type="button"
                aria-pressed={canvasCover}
                aria-label="게임 화면 덮개"
                onClick={() => setCanvasCover(!canvasCover)}
                className={cx('border rounded-sm px-2 py-1 text-xs cursor-pointer transition shrink-0',
                              canvasCover ? 'border-gold text-gold bg-surface-2'
                                          : 'border-line text-text-dim hover:text-gold hover:border-gold')}>
          {canvasCover ? '덮음' : '열림'}
        </button>
      </div>
    </div>
  );
}
