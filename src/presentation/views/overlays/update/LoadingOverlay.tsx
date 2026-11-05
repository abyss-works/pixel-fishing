import { useKeyBlocker } from '../../../ui/hotkeys';

// 불러오는 중 — 세이브를 읽고 이 창을 접속시키기 전까지 게임 화면 전체를 불투명하게 덮는다.
// 그 전의 화면은 서버 세이브가 아닌 기본 상태라 보이지 않게 하고, 입력도 받지 않는다.
export default function LoadingOverlay() {
  useKeyBlocker();
  return (
    <div className="fixed inset-0 z-(--z-app-modal) bg-bg flex items-center justify-center"
         role="status" aria-live="polite">
      <div className="bg-surface border border-line rounded-md shadow-panel px-6 py-4 text-center w-[min(320px,calc(100%-32px))]">
        <p className="text-base font-bold">불러오는 중</p>
        <p className="text-sm text-text-dim mt-1">진행 상황을 불러오고 있어요.</p>
        <div className="flex justify-center gap-1.5 mt-3" aria-hidden="true">
          {[0, 0.4, 0.8].map(delay => (
            <span key={delay} className="size-2 bg-accent animate-pulse" style={{ animationDelay: `${delay}s` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
