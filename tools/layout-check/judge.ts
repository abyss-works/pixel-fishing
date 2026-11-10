// 레이아웃 폭 검사의 판정 로직 - 브라우저와 분리한 순수 함수. 페이지에서 잰 값(Measure)을 받아 항목별 통과/위반을 낸다.

export interface Rect { x: number; y: number; width: number; height: number }

export type TierId = 'default' | 'tight' | 'two-row';
export const TIER_LABEL: Record<TierId, string> = { default: '기본', tight: '간격 축소', 'two-row': '두 행' };

/** 단계 경계 - 스테이지 폭이 wide 이상이면 기본, tight 이상 wide 미만이면 간격 축소, tight 미만이면 두 행 */
export interface TierBounds { tight: number; wide: number }
export interface TierClassInfo extends TierBounds { baseGap: number }

/** 제품의 단계 클래스 문자열에서 경계(`@max-[Npx]`)와 기본 단계의 칸 사이 간격(`--hdr-gap`의 첫 값)을 읽는다 */
export function parseTierClass(cls: string): TierClassInfo {
  const bounds = [...new Set([...cls.matchAll(/@max-\[(\d+)px\]/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
  const gap = /\[--hdr-gap:(\d+)px\]/.exec(cls);
  if (bounds.length !== 2 || !gap) {
    throw new Error('헤더 단계 클래스에서 경계 두 개와 기본 칸 간격을 읽지 못했습니다. 단계 정의의 형식이 바뀌었는지 확인하세요.');
  }
  return { tight: bounds[0], wide: bounds[1], baseGap: Number(gap[1]) };
}

export const expectedTier = (stageWidth: number, b: TierBounds): TierId =>
  stageWidth >= b.wide ? 'default' : stageWidth >= b.tight ? 'tight' : 'two-row';

/** 헤더의 계산된 변수로 실제 단계를 판별한다. rows는 두 행 본문이 켜졌는가, gap은 칸 사이 간격(px) */
export const observedTier = (v: { rows: boolean; gap: number }, baseGap: number): TierId =>
  v.rows ? 'two-row' : v.gap === baseGap ? 'default' : 'tight';

export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export interface Clickable { label: string; rect: Rect }
export interface Overlap { a: string; b: string; width: number; height: number }

/** 누를 수 있는 요소끼리 겹친 쌍과 겹친 크기 */
export function findOverlaps(items: readonly Clickable[]): Overlap[] {
  const out: Overlap[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i].rect;
      const b = items[j].rect;
      if (!rectsOverlap(a, b)) continue;
      out.push({
        a: items[i].label, b: items[j].label,
        width: round(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
        height: round(Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
      });
    }
  }
  return out;
}

export interface ClippedText { text: string; scrollWidth: number; clientWidth: number }

/** 페이지에서 잰 값 */
export interface Measure {
  viewportWidth: number;
  /** 뷰포트 폭에서 사이드바 폭을 뺀 값 */
  stageWidth: number;
  scrollWidth: number;
  clientWidth: number;
  tier: { rows: boolean; gap: number };
  /** 헤더 행의 바깥 여백(px) */
  inset: number;
  stage: Rect;
  bar: Rect | null;
  menu: Rect | null;
  clipped: ClippedText[];
  clickables: Clickable[];
}

export const CHECKS = [
  ['overflow', '가로 넘침'], ['overlap', '겹침'], ['inStage', '스테이지 안'], ['gap', '간격'],
  ['center', '세로 중심'], ['clip', '글자 잘림'], ['tier', '단계'],
] as const;
export type CheckId = typeof CHECKS[number][0];
export interface Check { ok: boolean; detail: string }

export interface CaseResult {
  stageWidth: number;
  tier: TierId;
  expectedTier: TierId;
  checks: Record<CheckId, Check>;
  observations: Overlap[];
}

/** 간격과 위치에 허용하는 오차(px) */
const GAP_TOLERANCE = 1;
const CENTER_TOLERANCE = 2;
/** 스테이지 경계 비교의 부동소수 오차(px) */
const EDGE_EPS = 0.5;

const round = (n: number) => Math.round(n * 10) / 10;
const pass: Check = { ok: true, detail: '' };
const fail = (detail: string): Check => ({ ok: false, detail });
const missing = fail('자원 바 또는 메뉴 버튼을 찾지 못했습니다');
const fmtRect = (r: Rect) => `x${round(r.x)}~${round(r.x + r.width)} y${round(r.y)}~${round(r.y + r.height)}`;

export function judgeCase(m: Measure, ctx: { bounds: TierBounds; baseGap: number }): CaseResult {
  const { bar, menu } = m;
  const both = bar && menu ? { bar, menu } : null;
  const gap = both ? both.menu.x - (both.bar.x + both.bar.width) : 0;
  const tier = observedTier(m.tier, ctx.baseGap);
  const want = expectedTier(m.stageWidth, ctx.bounds);
  const inside = (r: Rect) => r.x >= m.stage.x - EDGE_EPS && r.x + r.width <= m.stage.x + m.stage.width + EDGE_EPS
    && r.y >= m.stage.y - EDGE_EPS && r.y + r.height <= m.stage.y + m.stage.height + EDGE_EPS;
  const checks: Record<CheckId, Check> = {
    overflow: m.scrollWidth <= m.clientWidth ? pass : fail(`scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`),
    overlap: !both ? missing : rectsOverlap(both.bar, both.menu)
      ? fail(`자원 바 ${fmtRect(both.bar)}와 메뉴 버튼 ${fmtRect(both.menu)}가 겹칩니다`) : pass,
    inStage: !both ? missing : inside(both.bar) && inside(both.menu) ? pass
      : fail(`스테이지 ${fmtRect(m.stage)} 밖: 자원 바 ${fmtRect(both.bar)}, 메뉴 버튼 ${fmtRect(both.menu)}`),
    gap: !both ? missing : gap >= m.inset - GAP_TOLERANCE ? pass
      : fail(`간격 ${round(gap)}px < 바깥 여백 ${m.inset}px`),
    center: !both ? missing : Math.abs(both.menu.y + both.menu.height / 2 - (both.bar.y + both.bar.height / 2)) <= CENTER_TOLERANCE ? pass
      : fail(`세로 중심 차 ${round(Math.abs(both.menu.y + both.menu.height / 2 - (both.bar.y + both.bar.height / 2)))}px`),
    clip: m.clipped.length === 0 ? pass
      : fail(m.clipped.map(c => `"${c.text}" ${c.scrollWidth} > ${c.clientWidth}`).join(', ')),
    tier: tier === want ? pass : fail(`스테이지 ${m.stageWidth}px의 기대 단계는 ${TIER_LABEL[want]}, 실제는 ${TIER_LABEL[tier]}`),
  };
  return { stageWidth: m.stageWidth, tier, expectedTier: want, checks, observations: findOverlaps(m.clickables) };
}

export interface Row { width: number; state: string; result: CaseResult }

export function summarize(rows: readonly Row[]): { violations: number; observations: number } {
  return {
    violations: rows.reduce((n, r) => n + Object.values(r.result.checks).filter(c => !c.ok).length, 0),
    observations: rows.reduce((n, r) => n + r.result.observations.length, 0),
  };
}

/** 한글처럼 넓은 글자를 2칸으로 센 표시 폭 */
const cellWidth = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0);
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - cellWidth(s)));

/** 폭 × 상태 표와 위반 상세, 관측 목록 */
export function formatReport(rows: readonly Row[]): string {
  const head = ['폭', '상태', '스테이지', '단계', ...CHECKS.map(([, label]) => label), '관측'];
  const body = rows.map(r => [
    String(r.width), r.state, String(r.result.stageWidth), TIER_LABEL[r.result.tier],
    ...CHECKS.map(([id]) => (r.result.checks[id].ok ? '통과' : '위반')), String(r.result.observations.length),
  ]);
  const widths = head.map((h, i) => Math.max(...[h, ...body.map(b => b[i])].map(cellWidth)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join('  ').trimEnd();
  const out = [line(head), ...body.map(line)];
  const sum = summarize(rows);
  const violations = rows.flatMap(r => CHECKS.filter(([id]) => !r.result.checks[id].ok)
    .map(([id, label]) => `- 폭 ${r.width} / ${r.state} / ${label}: ${r.result.checks[id].detail}`));
  out.push('', `위반 ${sum.violations}건, 관측 ${sum.observations}건`);
  if (violations.length > 0) out.push('', '위반 상세', ...violations);
  const obs = rows.flatMap(r => r.result.observations.map(o => `- 폭 ${r.width} / ${r.state}: ${o.a} / ${o.b} (${o.width}x${o.height}px)`));
  if (obs.length > 0) out.push('', '관측(스테이지 안 누를 수 있는 요소끼리의 겹침, 실패로 치지 않음)', ...obs);
  return out.join('\n');
}
