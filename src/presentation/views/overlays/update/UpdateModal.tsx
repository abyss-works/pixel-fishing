import Button from '../../../ui/Button';

export default function UpdateModal() {
  return (
    <div className="fixed inset-0 z-(--z-app-modal) bg-[rgba(4,9,18,0.8)] flex items-center justify-center animate-fade-in">
      <div className="pf-frame p-4 flex flex-col gap-2 w-[min(400px,calc(100%-32px))]">
        <h3 className="pf-accent text-lg text-gold">새 버전이 나왔어요</h3>
        <p className="text-sm leading-[1.7]">
          게임이 업데이트되어 이 화면은 더 진행할 수 없어요.
          지금까지의 진행은 서버에 안전하게 저장되어 있어요 —
          새로고침하면 바로 이어서 플레이할 수 있어요.
          (방금 마지막 행동 하나는 저장되지 않았을 수 있어요)
        </p>
        <Button variant="primary" full onClick={() => window.location.reload()}>새로고침하고 이어하기</Button>
      </div>
    </div>
  );
}
