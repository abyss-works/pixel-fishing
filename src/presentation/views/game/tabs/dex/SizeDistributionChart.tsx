import { useId } from 'react';
import type { SizeDistribution } from '../../../../../features/dex/model/sizeDistribution';
import { fmtSize } from '../../../../ui/format';

// 어종 크기 분포 그래프 — 고정 정규분포 곡선 위에 내 최대 기록을 세로선으로 긋고 상위 백분율을 적는다.
// 곡선은 어종마다 고정이고, 바뀌는 것은 내 위치뿐이다.
// 음영: 곡선 아래는 위에서 아래로 옅어지는 보조색, 내 기록보다 큰 꼬리(=상위 n%)는 골드로 칠해
// 그 면적이 곧 백분율로 읽히게 한다.
const W = 320, H = 116, TOP = 22, BASE = 92;

export default function SizeDistributionChart({ data }: { data: SizeDistribution }) {
  const id = useId().replace(/:/g, '');
  const x = (size: number) => ((size - data.min) / (data.max - data.min)) * W;
  const y = (v: number) => BASE - v * (BASE - TOP);
  const pts = data.points.map(p => [x(p.x), y(p.y)] as const);
  const line = pts.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L');
  const me = data.me;
  const meX = me ? me.t * W : 0;
  // 내 기록 오른쪽 꼬리 — 곡선을 그 지점에서 잘라 바닥까지 닫는다
  const tail = me
    ? [[meX, BASE], ...pts.filter(([px]) => px >= meX), [W, BASE]]
        .map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' L')
    : '';
  const label = me ? `상위 ${me.topPercent}%` : '';
  const right = meX > W * 0.62; // 라벨을 선 왼쪽으로 붙일지
  const meanX = x(data.mean);

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto overflow-visible" role="img"
           aria-label={me ? `크기 분포에서 내 최대 기록 ${fmtSize(me.size)}, ${label}` : '크기 분포'}>
        <defs>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c-text-dim)" stopOpacity="0.32" />
            <stop offset="1" stopColor="var(--c-text-dim)" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id={`${id}-tail`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--c-gold)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--c-gold)" stopOpacity="0.06" />
          </linearGradient>
        </defs>

        {/* 눈금 — 평균과 양 끝, 바닥선 */}
        {[0, meanX, W].map(tx => (
          <line key={tx} x1={tx} x2={tx} y1={BASE} y2={BASE + 4} strokeWidth={1} className="stroke-line" />
        ))}
        <line x1={meanX} x2={meanX} y1={TOP - 6} y2={BASE} strokeWidth={1} strokeDasharray="2 3"
              className="stroke-line" />

        <path d={`M0,${BASE} L${line} L${W},${BASE} Z`} fill={`url(#${id}-body)`} />
        {me && <path d={`M${tail} Z`} fill={`url(#${id}-tail)`} />}
        <path d={`M${line}`} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-text-dim" />
        <line x1={0} x2={W} y1={BASE} y2={BASE} strokeWidth={1} className="stroke-line" />

        {me && (
          <g>
            <line x1={meX} x2={meX} y1={6} y2={BASE} strokeWidth={2} className="stroke-gold" />
            <rect x={meX - 3} y={3} width={6} height={6} className="fill-gold" />
            <text x={right ? meX - 7 : meX + 7} y={10} textAnchor={right ? 'end' : 'start'}
                  className="fill-gold pf-accent text-[11px]"
                  style={{ paintOrder: 'stroke', stroke: 'var(--c-bg)', strokeWidth: 3 }}>
              {label}
            </text>
          </g>
        )}

        <text x={0} y={H - 4} className="fill-text-dim text-[10px]">{fmtSize(data.min)}</text>
        <text x={meanX} y={H - 4} textAnchor="middle" className="fill-text-dim text-[10px]">평균 {fmtSize(data.mean)}</text>
        <text x={W} y={H - 4} textAnchor="end" className="fill-text-dim text-[10px]">{fmtSize(data.max)}</text>
      </svg>
      {me ? (
        <figcaption className="mt-1 text-xs text-text-dim">
          내 최대 기록 <span className="pf-accent text-gold">{fmtSize(me.size)}</span> · 골드 영역이 나보다 큰 개체의 비율이에요.
        </figcaption>
      ) : (
        <figcaption className="mt-1 text-xs text-text-dim">이 어종을 낚으면 내 위치가 표시돼요.</figcaption>
      )}
    </figure>
  );
}
