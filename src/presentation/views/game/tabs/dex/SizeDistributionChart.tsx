import type { SizeDistribution } from '../../../../../features/dex/model/sizeDistribution';
import { fmtSize } from '../../../../ui/format';

// 어종 크기 분포 그래프 — 고정 정규분포 곡선 위에 내 최대 기록을 세로선으로 긋고 상위 백분율을 적는다.
// 곡선은 어종마다 고정이고, 바뀌는 것은 내 위치뿐이다.
const W = 300, H = 96, TOP = 18, BASE = 80;

export default function SizeDistributionChart({ data }: { data: SizeDistribution }) {
  const x = (size: number) => ((size - data.min) / (data.max - data.min)) * W;
  const y = (v: number) => BASE - v * (BASE - TOP);
  const curve = data.points.map(p => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' L');
  const me = data.me;
  const meX = me ? me.t * W : 0;
  const label = me ? `상위 ${me.topPercent}%` : '';
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto" role="img"
           aria-label={me ? `크기 분포에서 내 최대 기록 ${fmtSize(me.size)}, ${label}` : '크기 분포'}>
        <path d={`M0,${BASE} L${curve} L${W},${BASE} Z`} className="fill-text-dim/15" />
        <path d={`M${curve}`} fill="none" strokeWidth={2} className="stroke-text-dim" />
        <line x1={0} x2={W} y1={BASE} y2={BASE} strokeWidth={1} className="stroke-line" />
        <line x1={x(data.mean)} x2={x(data.mean)} y1={TOP} y2={BASE} strokeWidth={1} strokeDasharray="3 3"
              className="stroke-line" />
        {me && (
          <>
            <line x1={meX} x2={meX} y1={4} y2={BASE} strokeWidth={2} className="stroke-gold" />
            <text x={meX < W / 2 ? meX + 4 : meX - 4} y={12} textAnchor={meX < W / 2 ? 'start' : 'end'}
                  className="fill-gold pf-accent text-[10px]">{label}</text>
          </>
        )}
        <text x={0} y={H - 2} className="fill-text-dim text-[9px]">{fmtSize(data.min)}</text>
        <text x={x(data.mean)} y={H - 2} textAnchor="middle" className="fill-text-dim text-[9px]">평균 {fmtSize(data.mean)}</text>
        <text x={W} y={H - 2} textAnchor="end" className="fill-text-dim text-[9px]">{fmtSize(data.max)}</text>
      </svg>
      {!me && <figcaption className="text-xs text-text-dim mt-1">이 어종을 낚으면 내 위치가 표시돼요.</figcaption>}
    </figure>
  );
}
