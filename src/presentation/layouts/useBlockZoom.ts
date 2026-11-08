import { useEffect } from 'react';
import { useMobileLayout } from './useMobileLayout';

// 모바일 레이아웃에서 두 손가락 확대를 막는다. iOS Safari는 뷰포트의 maximum-scale을 무시하므로
// 확대 제스처(gesturestart)와 두 손가락 터치 이동을 직접 취소한다. 두 번 눌러 확대는 스타일(touch-action)이 막는다.
export function useBlockZoom(): void {
  const mobile = useMobileLayout();
  useEffect(() => {
    if (!mobile) return;
    const cancel = (e: Event) => e.preventDefault();
    const cancelMulti = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('gesturestart', cancel);
    document.addEventListener('touchmove', cancelMulti, { passive: false });
    return () => {
      document.removeEventListener('gesturestart', cancel);
      document.removeEventListener('touchmove', cancelMulti);
    };
  }, [mobile]);
}
