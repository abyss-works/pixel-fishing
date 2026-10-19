// 대시보드 화면 골격 — 모든 탭이 같은 머리·지표 줄·칸 격자를 쓴다.
// 도감 상세와 같은 언어다. 머리(제목) 아래에 제목 달린 칸을 격자로 놓고, 칸은 패널을 겹치지 않고
// 표면을 파낸 오목한 칸(Inset)으로 나눈다. 데이터 해석은 탭의 몫이고 여기서는 배치만 한다.
import { Children } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../../ui/cx';
import Inset from '../../ui/Inset';
import Note from '../../ui/Note';
import PageTitle from '../../ui/PageTitle';
import PillButton from '../../ui/PillButton';
import TitledCell from '../../ui/TitledCell';

/** 탭 한 쪽 — 머리(제목·한 줄 설명·오른쪽 조작) 아래에 본문을 세로로 쌓는다 */
export function TabPage({ title, context, aside, children }: {
  title: string;
  /** 제목 아래 한 줄 설명 — 안내의 목소리(해요체) */
  context: string;
  /** 머리 오른쪽 조작(기간 전환 등) */
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-line pb-2">
        <div className="min-w-0">
          <PageTitle>{title}</PageTitle>
          <Note size="xs" className="my-0">{context}</Note>
        </div>
        {aside}
      </header>
      {children}
    </div>
  );
}

/** 칸 격자 — 좁으면 한 줄, xl부터 두 칸이다. side는 왼쪽을 넓게 두고 오른쪽을 고정 폭(320px) 보조 칸으로 둔다 */
export function CellGrid({ side, children }: { side?: boolean; children: ReactNode }) {
  return (
    <div className={cx('grid grid-cols-1 gap-x-5 gap-y-4',
                       side ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : 'xl:grid-cols-2')}>
      {children}
    </div>
  );
}

/** 칸 — 제목 아래 오목한 칸 하나. className은 격자 항목(칸)에 주고, 내용은 오목한 칸 안에서 세로로 쌓는다 */
export function Cell({ title, className, flush, divided, children }: {
  title: ReactNode;
  className?: string;
  /** 오목한 칸의 안쪽 여백을 없앤다 — 구분선 목록이나 가장자리까지 차는 내용일 때 */
  flush?: boolean;
  /** 안쪽 행 사이에 구분선을 긋는다 */
  divided?: boolean;
  children: ReactNode;
}) {
  return (
    <TitledCell title={title} className={className}>
      <Inset divided={divided} className={cx('flex flex-1 flex-col', !divided && 'gap-2', !flush && 'p-3')}>
        {children}
      </Inset>
    </TitledCell>
  );
}

// 지표 줄의 열 수 — 타일 수에 맞춰 한 줄을 채운다(2~5장). Tailwind가 클래스를 찾을 수 있도록 문자열을 그대로 둔다
const KPI_COLS: Record<number, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-2 md:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
};

/** 지표 줄 — KpiTile 2~5장을 한 줄로 놓고, 좁으면 두 장씩 접는다 */
export function KpiRow({ children }: { children: ReactNode }) {
  const count = Math.min(5, Math.max(2, Children.count(children)));
  return <div className={cx('grid gap-2', KPI_COLS[count])}>{children}</div>;
}

/** 로딩·오류·빈값 상태 — 모든 탭이 같은 모양으로 상태를 말한다 */
export function TabState({ loading, error, empty, emptyText, onRetry }: {
  loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string;
  onRetry?: () => void;
}) {
  if (loading) return <Note size="xs" className="my-0">불러오는 중…</Note>;
  if (error) {
    return (
      <Inset tone="deep" className="flex flex-col items-start gap-2 p-3">
        <Note tone="warn" className="my-0">{error}</Note>
        {onRetry && <PillButton type="button" onClick={onRetry}>다시 시도</PillButton>}
      </Inset>
    );
  }
  if (empty) return <Note size="xs" className="my-0">{emptyText ?? '데이터가 아직 없어요.'}</Note>;
  return null;
}
