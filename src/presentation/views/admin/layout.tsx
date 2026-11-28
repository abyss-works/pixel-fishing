// 대시보드 화면 골격 — 모든 탭이 같은 머리·지표 줄·칸 격자를 쓴다.
// 도감 상세와 같은 언어다. 머리(제목) 아래에 제목 달린 칸을 격자로 놓고, 칸은 패널을 겹치지 않고
// 표면을 파낸 오목한 칸(Inset)으로 나눈다. 데이터 해석은 탭의 몫이고 여기서는 배치만 한다.
import { Children } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAdminSubnavHost } from './viewMode';
import { cx } from '../../ui/cx';
import Inset from '../../ui/Inset';
import Note from '../../ui/Note';
import PillButton from '../../ui/PillButton';
import SectionTitle from '../../ui/SectionTitle';
import TitledCell from '../../ui/TitledCell';

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

/* ============================================================
   개편 관리자 대시보드 전용 프리미티브 (.pf-admin-*)
   ============================================================ */

const KPI_VAL_TONE: Record<'default' | 'accent' | 'gold' | 'warn' | 'danger' | 'ok' | 'dim', string> = {
  default: 'text-text',
  accent: 'text-accent',
  gold: 'text-gold',
  warn: 'text-orange',
  danger: 'text-danger',
  ok: 'text-special',
  dim: 'text-text-dim',
};

export function AdminKpiGrid({ cols = 4, className, children }: {
  cols?: 4 | 8;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx(cols === 8 ? 'pf-admin-kpi-grid-8' : 'pf-admin-kpi-grid-4', className)}>
      {children}
    </div>
  );
}

export function AdminKpiCard({ label, value, sub, badge, tone = 'default', className }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  badge?: ReactNode;
  tone?: keyof typeof KPI_VAL_TONE;
  className?: string;
}) {
  return (
    <div className={cx('pf-admin-kpi-card', className)}>
      <div className="pf-admin-kpi-label">
        <span>{label}</span>
        {badge}
      </div>
      <div className={cx('pf-admin-kpi-val', KPI_VAL_TONE[tone])}>{value}</div>
      {sub && <div className="pf-admin-kpi-sub">{sub}</div>}
    </div>
  );
}

export function AdminCard({ title, badge, actions, className, children }: {
  title?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('pf-admin-card', className)}>
      {(title || badge || actions) && (
        <div className="pf-admin-card-title">
          {title && <SectionTitle className="my-0">{title}</SectionTitle>}
          {(badge || actions) && (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              {badge}
              {actions}
            </span>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

const SPLIT_CLASS: Record<'2' | '60-40' | '3', string> = {
  '2': 'pf-admin-split-2',
  '60-40': 'pf-admin-split-60-40',
  '3': 'pf-admin-split-3',
};

export function AdminSplit({ variant = '2', className, children }: {
  variant?: keyof typeof SPLIT_CLASS;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx(SPLIT_CLASS[variant], className)}>{children}</div>;
}

export function AdminQueueItem({ tone = 'default', className, children }: {
  tone?: 'default' | 'urgent' | 'warn';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx('pf-admin-queue-item', tone === 'urgent' && 'is-urgent', tone === 'warn' && 'is-warn', className)}>
      {children}
    </div>
  );
}

export function AdminTableWrap({ scroll, className, children }: {
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx('pf-admin-table-wrap', scroll && 'is-scroll', className)}>{children}</div>;
}

export function AdminSubnavExtra({ children }: { children: ReactNode }) {
  const host = useAdminSubnavHost();
  if (host) return createPortal(children, host);
  return <div className="flex flex-wrap items-center justify-end gap-2">{children}</div>;
}
