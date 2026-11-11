// 업데이트 소식 창 — 무엇을 어떤 순서로 보여줄지 정하는 순수 규칙과 새 설정 질문 목록.
// 창은 최대 두 단계다: ① 아직 보지 않은 버전 소식(패치노트) ② 이번에 생긴 설정 고르기.
// 소식은 마지막으로 본 버전 뒤의 버전을 모두 한 창에 한 번 보이고, 질문은 질문마다 한 번이다.
// 처음 시작한 플레이어에게는 열지 않는다 —
// 바뀐 점이 없는 사람에게 "바뀐 점"을 보여줄 이유가 없고, 설정은 기본값으로 시작한다.
import type { PatchNote } from '../../../game/content/patchnotes';
import type { GameState } from '../../../game/rules/logic';

export type WhatsNewStep = 'news' | 'settings';

export interface SettingOption {
  value: string;
  /** 짧은 이름 — 선택 카드의 제목(픽셀 액센트) */
  label: string;
  /** 이름 옆 보조 표기 */
  sub?: string;
  /** 기본값·실험 표시. 질문마다 기본은 정확히 하나다 */
  badge?: '기본' | '실험';
  description: string;
}

/** 새 설정 질문 — 한 번 묻고, 답(또는 창 닫기)하면 다시 묻지 않는다. 설정 탭에서 언제든 바꿀 수 있다 */
export interface SettingPrompt {
  id: 'fish-art';
  title: string;
  description: string;
  options: readonly SettingOption[];
}

export const SETTING_PROMPTS: readonly SettingPrompt[] = [
  {
    id: 'fish-art',
    title: '물고기 그래픽',
    description: '물고기를 어떤 그림으로 볼지 골라 주세요.\n나중에 설정 탭의 화면 항목에서 바꿀 수 있어요.',
    options: [
      { value: 'v1', label: 'v1', sub: 'legacy', badge: '기본',
        description: '지금까지 보던 그림이에요.' },
      { value: 'v2', label: 'v2', sub: 'beta', badge: '실험',
        description: '새로 그린 픽셀 그래픽이에요.\n헤엄치고 물 위로 튀어오르지만, 일부 물고기는 모양이 실제와 다를 수 있어요.' },
    ],
  },
];

const versionParts = (version: string) => version.split('.').map(Number);

/** 점으로 나눈 숫자 비교 — 앞이 크면 양수, 같으면 0 */
function compareVersions(a: string, b: string): number {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * 접속 때 띄울 소식, 최신 순: 마지막으로 본 버전 뒤부터 현재 버전까지 노트가 있는 버전 전부. 노트 배열의 순서에 기대지 않는다.
 * 마지막으로 본 버전 기록이 없는 기존 저장값은 이전 형식의 다시 보지 않기 버전을 본 버전으로 쓴다.
 * 둘 다 없으면 현재 버전 노트 하나만 본다.
 */
export function unseenNews(
  notes: readonly PatchNote[], appVersion: string,
  record: { lastSeenVersion: string | null; dismissedVersion: string | null },
): PatchNote[] {
  const seen = record.lastSeenVersion ?? record.dismissedVersion;
  return notes
    .filter(n => compareVersions(n.version, appVersion) <= 0
      && (seen === null ? n.version === appVersion : compareVersions(n.version, seen) > 0))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** 다시 보기로 열 소식: 현재 버전 이하에서 가장 높은 버전. 노트 배열의 순서에 기대지 않는다 */
export function latestNewsAtOrBelow(notes: readonly PatchNote[], appVersion: string): PatchNote | null {
  let latest: PatchNote | null = null;
  for (const n of notes) {
    if (compareVersions(n.version, appVersion) > 0) continue;
    if (!latest || compareVersions(n.version, latest.version) > 0) latest = n;
  }
  return latest;
}

export function pendingPrompts(
  prompts: readonly SettingPrompt[], answered: ReadonlySet<string>,
): SettingPrompt[] {
  return prompts.filter(p => !answered.has(p.id));
}

/** 처음 시작한 플레이어 — 명성도 도감 기록도 없다 */
export function isFreshPlayer(game: Pick<GameState, 'fame' | 'dex'>): boolean {
  return game.fame === 0 && Object.keys(game.dex).length === 0;
}

/** 이번 세션에 보여줄 단계 */
export function planWhatsNew({ news, prompts, fresh }: {
  news: readonly PatchNote[];
  prompts: readonly SettingPrompt[];
  fresh: boolean;
}): WhatsNewStep[] {
  if (fresh) return [];
  const steps: WhatsNewStep[] = [];
  if (news.length > 0) steps.push('news');
  if (prompts.length > 0) steps.push('settings');
  return steps;
}
