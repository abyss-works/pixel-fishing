// 대시보드 시각 프리미티브 — 차트 라이브러리 없이(SVG/div) 구현한다(MiniBar와 같은 판단:
// 런타임 의존성 최소 원칙). 필요한 종류는 스파크라인·세로 바·코호트 셀·KPI 카드 네 가지뿐.
// 데이터 해석은 탭의 몫 — 여기선 값 배열을 그릴 뿐 도메인을 모른다.
import type { ReactNode } from 'react';
import { cx } from '../ui/cx';
import { fmtNum } from './metrics';

// ---------- 레이아웃 체계 ----------
// 대시보드 전체가 같은 시각 언어를 쓰게 하는 두 프리미티브. 탭마다 제목/컨트롤/본문을
// 따로 조립하던 것(초기 구현)을 한 곳으로 — "적당한 레이아웃"의 단일 근원.

/**
 * Frame — 섹션 하나 = 테두리 패널 + 헤더 행(제목 좌 / 컨트롤 우).
 * Overview·지표·경제·진행·이상탐지가 전부 이 껍데기를 공유한다.
 */
export function Frame({ title, aside, children, className }: {
  title: string;
  /** 헤더 우측 보조 컨트롤 — 범위 스위치 등 (선택) */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('pf-frame p-3 flex flex-col gap-2 min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm text-accent pf-accent whitespace-nowrap">{title}</h4>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** KPI 격자 — 모든 탭이 같은 반응형 열 수를 쓴다(2 → md 3 → lg 5) */
export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">{children}</div>;
}

/** KPI 카드 — 한 눈 숫자. hint는 보조 문구(전일 대비 등) */
export function KpiCard({ label, value, hint }: {
  label: string; value: string; hint?: string;
}) {
  return (
    <div className="pf-frame px-3 py-2 flex flex-col gap-0.5 min-w-0">
      <span className="text-2xs text-text-dim">{label}</span>
      <span className="text-xl text-gold pf-accent truncate" title={value}>{value}</span>
      {hint && <span className="text-2xs text-text-dim truncate">{hint}</span>}
    </div>
  );
}

/**
 * 세로 바 차트 — div 폭 스케일(라이브러리 무용지물 규모). 값 라벨은 마우스올림 title로.
 * values 대비 max 비율 높이. labelOf(i)는 x축 눈금 라벨(모든 바가 아니라 일부만).
 */
export function BarsChart({ values, labels, height = 88, className, barClass = 'bg-gold/80' }: {
  values: readonly number[];
  /** 각 바 아래 눈금 라벨 — undefined면 표시 안 함 */
  labels?: readonly (string | null)[];
  height?: number;
  className?: string;
  barClass?: string;
}) {
  const max = Math.max(1, ...values.map(v => Number.isFinite(v) ? v : 0));
  return (
    <div className={cx('flex items-end gap-px', className)} style={{ height }}>
      {values.map((v, i) => {
        const h = Math.max(values[i] > 0 ? 4 : 1,
          Math.round((Number.isFinite(v) ? Math.max(0, v) : 0) / max * height));
        return (
          <div key={i} className="flex-1 min-w-0 h-full flex flex-col justify-end"
               title={`${labels?.[i] ?? i}: ${fmtNum(v)}`}>
            <div className={cx('rounded-t-[1px]', v > 0 ? barClass : 'bg-line')} style={{ height: h }} />
          </div>
        );
      })}
    </div>
  );
}

/** 이중 축 — 두 수열을 위아래 겹쳐 같은 날 축으로 비교(DAU vs WAU 등) */
export function StackedBarsPair({ a, b, labels }: {
  a: readonly number[]; b: readonly number[]; labels?: readonly (string | null)[];
}) {
  const max = Math.max(1, ...[...a, ...b].map(v => Number.isFinite(v) ? v : 0));
  return (
    <div className="flex flex-col gap-2">
      {[{ name: 'WAU', data: b, cls: 'bg-surface-2 border border-line' },
        { name: 'DAU', data: a, cls: 'bg-gold/80' }].map(row => (
        <div key={row.name} className="flex items-center gap-2">
          <span className="text-2xs text-text-dim w-8 shrink-0 text-right">{row.name}</span>
          <BarsChart values={row.data.map(v => Math.round((v / max) * 100))} labels={labels}
                     height={44} className="flex-1"
                     barClass={row.cls} />
        </div>
      ))}
    </div>
  );
}

/** 코호트 셀 — % 강도를 골드 알파로. null은 미관측(아직 미래 날짜) */
export function RetentionCell({ pct, hint }: { pct: number | null; hint: string }) {
  const alpha = pct === null ? 0 : Math.min(0.85, pct / 100 + 0.08);
  return (
    <td className="px-1 py-0.5 text-center text-2xs"
        style={{ background: `rgba(212,170,66,${alpha.toFixed(2)})` }}
        title={`${hint}: ${pct === null ? '—' : `${pct}%`}`}>
      <span className={pct !== null && alpha > 0.5 ? 'text-bg' : 'text-text'}>{pct === null ? '' : pct}</span>
    </td>
  );
}

/** 로딩·에러·빈값 상태 박스 — 모든 탭이 같은 모양으로 상태를 말한다 */
export function TabState({ loading, error, empty, emptyText, onRetry }: {
  loading?: boolean; error?: string | null; empty?: boolean; emptyText?: string;
  onRetry?: () => void;
}) {
  if (loading) return <NoteBox>불러오는 중…</NoteBox>;
  if (error) {
    return (
      <div className="border border-danger/40 bg-surface rounded-sm p-3 my-2">
        <p className="text-sm text-danger">{error}</p>
        {onRetry &&
          <button type="button" onClick={onRetry}
                  className="pf-btn ghost mt-2 !py-1 !px-2 text-xs">다시 시도</button>}
      </div>
    );
  }
  if (empty) return <NoteBox>{emptyText ?? '데이터가 아직 없다.'}</NoteBox>;
  return null;
}

function NoteBox({ children }: { children: ReactNode }) {
  return <p className="text-xs text-text-dim my-3">{children}</p>;
}
