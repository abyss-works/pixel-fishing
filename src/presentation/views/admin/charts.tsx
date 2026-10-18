// 대시보드 시각 프리미티브 — 차트 라이브러리 없이(div) 구현한다(필요한 종류가 막대와 코호트 셀뿐이라
// 로컬로 충분하다). 막대는 도감 크기 분포 그래프와 같은 언어로 그린다. 격자와 축은 점선·가는 선으로
// 뒤로 물리고, 계열은 보조색 윗선과 옅어지는 면으로 그리며, 강조 하나(금일·최댓값)만 골드로 세운다.
// 데이터 해석은 탭의 몫이다. 여기서는 값 배열을 그릴 뿐 도메인을 모른다.
import { cx } from '../../ui/cx';
import { fmtNum } from '../../../features/admin/model/metrics';

// ---------- 막대 차트 ----------

// 막대 면 — 보조색(기본)과 골드(강조)의 위에서 아래로 옅어지는 그라디언트. 윗선은 막대의 테두리가 맡는다
const BODY = 'linear-gradient(180deg, color-mix(in oklab, var(--c-text-dim) 50%, transparent), '
  + 'color-mix(in oklab, var(--c-text-dim) 8%, transparent))';
const BODY_HI = 'linear-gradient(180deg, color-mix(in oklab, var(--c-gold) 65%, transparent), '
  + 'color-mix(in oklab, var(--c-gold) 10%, transparent))';

const finite = (v: number): number => (Number.isFinite(v) ? v : 0);

/** 눈금을 붙일 막대 번호 — 막대가 적으면 전부, 많으면 일정 간격으로 고른다 */
function tickIndices(count: number, maxTicks = 6): number[] {
  const step = Math.max(1, Math.ceil(count / maxTicks));
  const out: number[] = [];
  for (let i = 0; i < count; i += step) out.push(i);
  return out;
}

/** 가장 큰 값의 막대 번호 — 양수가 하나도 없으면 -1 */
function peakIndex(values: readonly number[]): number {
  let best = -1;
  values.forEach((v, i) => { if (v > 0 && (best < 0 || v > values[best])) best = i; });
  return best;
}

/** 막대 판 — 격자(위·가운데 점선, 바닥 실선)와 막대. 높이는 max 대비 비율이다 */
function BarPlot({ values, labels, height, max, mark, valueText }: {
  values: readonly number[];
  labels?: readonly string[];
  height: number;
  max: number;
  /** 골드로 세울 막대 번호(없으면 -1) */
  mark: number;
  valueText: (value: number, index: number) => string;
}) {
  return (
    <div className="relative" style={{ height }}>
      <div aria-hidden="true" className="absolute inset-x-0 top-0 border-t border-dashed border-line/60" />
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 border-t border-dashed border-line/40" />
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-px bg-line" />
      <div className="absolute inset-0 flex items-end gap-px">
        {values.map((v, i) => {
          const h = Math.max(v > 0 ? 4 : 1,
            Math.round((Number.isFinite(v) ? Math.max(0, v) : 0) / max * height));
          const hi = i === mark;
          return (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end"
                 title={`${labels?.[i] ?? i}: ${valueText(v, i)}`}>
              <div className={cx('rounded-t-[1px]',
                                 v > 0 ? cx('border-t-2', hi ? 'border-gold' : 'border-text-dim') : 'bg-line')}
                   style={{ height: h, backgroundImage: v > 0 ? (hi ? BODY_HI : BODY) : undefined }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** 막대 아래 눈금 글자 — 처음은 왼쪽, 끝은 오른쪽에 붙이고 나머지는 막대 가운데에 맞춘다 */
function BarTicks({ count, labels }: { count: number; labels: readonly string[] }) {
  return (
    <div aria-hidden="true" className="relative mt-1 h-3.5 text-2xs leading-none text-text-dim">
      {tickIndices(count).map(i => (
        <span key={i} className="absolute top-0 whitespace-nowrap"
              style={i === 0 ? { left: 0 }
                : i === count - 1 ? { right: 0 }
                : { left: `${((i + 0.5) / count) * 100}%`, transform: 'translateX(-50%)' }}>
          {labels[i]}
        </span>
      ))}
    </div>
  );
}

/**
 * 막대 차트 — 값 배열의 높이를 max 대비 비율로 그린다(양수는 최소 4px, 0은 1px 선).
 * 윗줄은 눈금 상한(왼쪽)과 강조한 막대의 값(오른쪽), 아랫줄은 눈금 글자다. 값은 마우스를 올리면 title로도 본다.
 */
export function BarsChart({ values, labels, height = 88, max, highlight, highlightName, scaleLabel,
                            valueText = v => fmtNum(v), ariaLabel, className }: {
  values: readonly number[];
  /** 막대마다의 이름 — 마우스를 올렸을 때와 눈금에 쓴다. 눈금은 일정 간격으로 골라 보인다 */
  labels?: readonly string[];
  height?: number;
  /** 눈금 상한 — 생략하면 값의 최댓값이다(1보다 작으면 1) */
  max?: number;
  /** 골드로 세울 막대 — last = 맨 오른쪽(금일), peak = 가장 큰 값 */
  highlight?: 'last' | 'peak';
  /** 강조한 막대 값 앞에 붙는 이름 — 생략하면 그 막대의 labels */
  highlightName?: string;
  /** 윗줄 왼쪽 문구 — 생략하면 "최대 N" */
  scaleLabel?: string;
  valueText?: (value: number, index: number) => string;
  /** 차트가 말하는 바 — 스크린 리더는 이 문장 하나로 읽는다 */
  ariaLabel: string;
  className?: string;
}) {
  const domain = Math.max(1, max ?? Math.max(1, ...values.map(finite)));
  const mark = highlight === 'last' ? values.length - 1 : highlight === 'peak' ? peakIndex(values) : -1;
  const hasMark = mark >= 0 && mark < values.length;
  return (
    <figure role="img" aria-label={ariaLabel} className={cx('m-0 flex flex-col gap-1', className)}>
      <div className="flex items-baseline justify-between gap-2 text-2xs text-text-dim">
        <span>
          {scaleLabel ?? <>최대 <span className="pf-accent">{fmtNum(values.some(v => v > 0) ? domain : 0)}</span></>}
        </span>
        {hasMark && (
          <span>
            {highlightName ?? labels?.[mark]}{' '}
            <span className="pf-accent text-gold">{valueText(values[mark], mark)}</span>
          </span>
        )}
      </div>
      <BarPlot values={values} labels={labels} height={height} max={domain} mark={mark} valueText={valueText} />
      {labels && <BarTicks count={values.length} labels={labels} />}
    </figure>
  );
}

/**
 * 이중 막대 — 두 수열을 위아래로 놓고 같은 날 축·같은 눈금 상한으로 비교한다(DAU vs WAU).
 * 두 줄이 한 상한을 쓰므로 높이를 그대로 견줄 수 있다. 맨 오른쪽(금일)을 골드로 세운다.
 */
export function StackedBarsPair({ a, b, labels, ariaLabel }: {
  a: readonly number[]; b: readonly number[]; labels?: readonly string[];
  ariaLabel: string;
}) {
  const max = Math.max(1, ...[...a, ...b].map(finite));
  const lastOf = (xs: readonly number[]) => (xs.length > 0 ? fmtNum(xs[xs.length - 1]) : '—');
  return (
    <figure role="img" aria-label={ariaLabel} className="m-0 flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 pl-10 text-2xs text-text-dim">
        <span>최대 <span className="pf-accent">{fmtNum(max)}</span></span>
        <span>
          금일 DAU <span className="pf-accent text-gold">{lastOf(a)}</span>
          {' · '}WAU <span className="pf-accent text-gold">{lastOf(b)}</span>
        </span>
      </div>
      {[{ name: 'WAU', data: b }, { name: 'DAU', data: a }].map(row => (
        <div key={row.name} className="flex items-end gap-2">
          <span className="w-8 shrink-0 pb-px text-right text-2xs text-text-dim">{row.name}</span>
          <div className="min-w-0 flex-1">
            <BarPlot values={row.data} labels={labels} height={44} max={max}
                     mark={row.data.length - 1} valueText={v => fmtNum(v)} />
          </div>
        </div>
      ))}
      {labels && (
        <div className="flex gap-2">
          <span className="w-8 shrink-0" />
          <div className="min-w-0 flex-1"><BarTicks count={a.length} labels={labels} /></div>
        </div>
      )}
    </figure>
  );
}

/** 코호트 셀 — % 강도를 골드 알파로. null은 미관측(아직 미래 날짜) */
export function RetentionCell({ pct, hint }: { pct: number | null; hint: string }) {
  const alpha = pct === null ? 0 : Math.min(0.85, pct / 100 + 0.08);
  return (
    <td className="px-1 py-0.5 text-center text-2xs"
        style={{ background: `rgba(255,213,79,${alpha.toFixed(2)})` }}
        title={`${hint}: ${pct === null ? '—' : `${pct}%`}`}>
      <span className={pct !== null && alpha > 0.5 ? 'text-bg' : 'text-text'}>{pct === null ? '' : pct}</span>
    </td>
  );
}
