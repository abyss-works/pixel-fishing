import Note from '../../../ui/Note';

// 랭킹 조회 상태 안내 — 로컬 모드·불러오는 중·실패·기록 없음. 정상이면 아무것도 그리지 않는다.
export default function RankingStatus({ loading, failed, offline, empty }: {
  loading: boolean; failed: boolean; offline: boolean; empty: boolean;
}) {
  if (offline) return <Note>랭킹은 온라인에서만 볼 수 있어요.</Note>;
  if (loading) return <Loading />;
  if (failed) return <Note tone="warn">랭킹을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</Note>;
  if (empty) return <Note>아직 기록이 없어요.</Note>;
  return null;
}

// 불러오는 중 — 픽셀 사각형 세 개가 차례로 깜빡인다
function Loading() {
  return (
    <span role="status" aria-label="불러오는 중" className="inline-flex gap-1.5 py-2">
      {[0, 150, 300].map(delay => (
        <span key={delay} className="size-2 bg-gold motion-safe:animate-pulse" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}
