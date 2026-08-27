// 대시보드 순수 유틸 — 날짜 축·포맷·통계 변환. 뷰(Row)를 모른다 — 탭이 계산을 맡기 전
// 한 번 거치는 결정론적 단계라 vitest로 직접 검증한다(src/admin/metrics.test.ts).
// 서버(api/action.ts todayKST)와 같은 KST 하루 기준을 쓴다 — 전원 한국 친구 그룹.

/** 오늘(KST) YYYY-MM-DD — 서버의 todayKST와 같은 공식 */
export const todayKST = (): string =>
  new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

/** KST 오늘로부터 n-1일 전까지의 day 문자열들 (오름차순, 길이 n).
 *  슬라이스 전에 +9h로 미는 것은 todayKST와 같은 공식이다 — 이걸 빼면 KST 자정이
 *  UTC 전날 15시로 내려가 어제 날짜가 채워진다(metrics.test가 잡은 실수). */
export function lastNDays(n: number): string[] {
  const out: string[] = [];
  const shifted = Date.now() + 9 * 3600_000;
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(shifted - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

// ---------- 포맷 ----------

/** 숫자 축약 — 게임 규모(골드 수십억)에 맞춘 한국 단위. 소수 .0은 잘라낸다 */
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${trim1(v / 1e8)}억`;
  if (abs >= 1e4) return `${trim1(v / 1e4)}만`;
  return Math.round(v).toLocaleString('ko-KR');
}
const trim1 = (v: number): string => v.toFixed(1).replace(/\.0$/, '');

export const fmtPct = (v: number | null): string =>
  v === null || !Number.isFinite(v) ? '—' : `${trim1(v)}%`;

/** date-time 표시용 짧은 형태 — 'MM-DD HH:mm' (연도는 대시보드 범위에서 항상 현재) */
export const fmtDT = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const kst = new Date(d.getTime() + 9 * 3600_000);
  return kst.toISOString().slice(5, 16).replace('T', ' ');
};

// ---------- 시계열 정렬 ----------

/** day-keyed 행을 lastNDays 축에 붙인 값 배열 — 없는 날은 0 */
export function fillSeries<T>(rows: readonly T[], days: readonly string[],
                              keyOf: (r: T) => string, valOf: (r: T) => number): number[] {
  const map = new Map<string, number>();
  for (const r of rows) map.set(keyOf(r), valOf(r));
  return days.map(d => map.get(d) ?? 0);
}

// ---------- 통계 ----------

/** 백분위 — 선형 보간 없음(친구 규모 데이터, 경계값 정확도보다 간단함이 낫다). sorted 오름차순 필수 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0,
    Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

/** 시계열의 최근 n일 합계 */
export function sumLast(values: readonly number[], n: number): number {
  return values.slice(-n).reduce((a, b) => a + b, 0);
}

// ---------- 이벤트 해석 ----------
// events.type ↔ payload는 game/actions.ts 리듀서가 쓰는 형태가 유일한 근원이다.
// 여기서는 표시용 한 줄 요약만 만든다 — 값 검증·재구성은 하지 않는다(감사는 원문 payload로).

export const EVENT_LABELS: Record<string, string> = {
  boot: '접속',
  catch: '낚시',
  autoRelease: '자동 방생',
  sell: '판매',
  upgradeRod: '낚싯대 강화',
  buyBoat: '배 구매',
  visit: '지역 첫 도달',
  coupon: '쿠폰',
  claimRelief: '지원 코드',
  letter: '편지',
  buyBait: '미끼 구매',
  setActiveBait: '미끼 활성화',
  adminSet: '관리자 스탯 수정',
  import: '이사 코드 반입',
};

const s = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 이벤트 1행 → 사람용 한 줄. 알 수 없는 타입은 타입명 그대로 보여준다(무음보다 낫다) */
export function eventSummary(type: string, p: Record<string, unknown> | null | undefined): string {
  const pay = p ?? {};
  switch (type) {
    case 'boot': {
      const b = s(pay.buildId);
      return b ? `빌드 ${b.slice(0, 7)}` : '접속';
    }
    case 'catch': {
      const parts = [`${s(pay.fishId)}${pay.form === 'variant' ? '(변이)' : ''}`,
        s(pay.judgment).toUpperCase(),
        pay.size !== undefined ? `${Number(pay.size).toFixed(1)}cm` : '',
        s(pay.spot) ? `@${s(pay.spot)}` : '',
        pay.bait ? `미끼:${s(pay.bait)}` : '',
        pay.isNew === true ? 'NEW' : ''];
      return parts.filter(Boolean).join(' · ');
    }
    case 'sell': {
      const count = Number(pay.count ?? 0);
      return `${count}마리 +${fmtNum(Number(pay.gold ?? 0))}G`;
    }
    case 'upgradeRod': return `Lv${String(pay.toLevel ?? '?')} −${fmtNum(Number(pay.cost ?? 0))}G`;
    case 'buyBoat': return `T${String(pay.tier ?? '?')} −${fmtNum(Number(pay.cost ?? 0))}G`;
    case 'visit': return `첫 도달: ${s(pay.region)}`;
    case 'coupon': return `${s(pay.code)} +${fmtNum(Number(pay.gold ?? 0))}G`;
    case 'claimRelief': return `${s(pay.code)} 지급`;
    case 'letter': return `"${s(pay.text).slice(0, 60)}"`;
    case 'buyBait': return `${s(pay.bait)} ×${String(pay.count ?? '?')} −${fmtNum(Number(pay.cost ?? 0))}G`;
    case 'setActiveBait': return `${s(pay.bait)} 활성`;
    case 'adminSet': return `골드=${fmtNum(Number(pay.gold ?? NaN))} 명성=${fmtNum(Number(pay.fame ?? NaN))}`;
    case 'import': return `골드 ${fmtNum(Number(pay.gold ?? 0))} · 명성 ${fmtNum(Number(pay.fame ?? 0))}`;
    case 'autoRelease': {
      const uids = Array.isArray(pay.uids) ? pay.uids.length : 0;
      return `${uids}마리 놓아줌 (${s(pay.reason)})`;
    }
    default: return Object.keys(pay).length > 0 ? JSON.stringify(pay).slice(0, 60) : '';
  }
}

