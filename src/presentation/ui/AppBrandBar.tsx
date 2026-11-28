import PixelIcon from './PixelIcon';

// 전면 차단 모달 상단 바깥에 두는 좌측 정렬 브랜드 표식.
export default function AppBrandBar() {
  return (
    <div className="inline-flex items-center gap-2 pl-0.5 select-none" aria-hidden="true">
      <PixelIcon glyph="fish" size={16} className="text-gold" />
      <span className="pf-accent text-xs tracking-wider text-text-dim">PIXEL FISHING</span>
    </div>
  );
}
