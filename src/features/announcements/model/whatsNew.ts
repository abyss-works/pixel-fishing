// 업데이트 소식 창 — 무엇을 어떤 순서로 보여줄지 정하는 순수 규칙과 새 설정 질문 목록.
// 창은 최대 두 단계다: ① 이번 버전 소식(패치노트) ② 이번에 생긴 설정 고르기.
// 소식은 버전마다 한 번, 질문은 질문마다 한 번이다. 처음 시작한 플레이어에게는 열지 않는다 —
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
    description: '물고기를 어떤 그림으로 볼지 골라 주세요. 나중에 설정 탭의 화면 항목에서 바꿀 수 있어요.',
    options: [
      { value: 'v1', label: 'v1', sub: 'legacy', badge: '기본',
        description: '지금까지 보던 그림이에요.' },
      { value: 'v2', label: 'v2', sub: 'beta', badge: '실험',
        description: '새로 그린 픽셀 그래픽이에요. 헤엄치고 물 위로 튀어오르지만, 일부 물고기는 모양이 실제와 다를 수 있어요.' },
    ],
  },
];

/** 현재 버전 소식 — 그 버전 노트가 있고 이 기기에서 아직 보지 않았을 때만 */
export function newsFor(
  notes: readonly PatchNote[], appVersion: string, lastSeen: string | null,
): PatchNote | null {
  if (lastSeen === appVersion) return null;
  return notes.find(n => n.version === appVersion) ?? null;
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

/** 이번 세션에 보여줄 단계. 자동 열기를 꺼도 새 설정 질문은 한 번 묻는다 — 답하지 않으면 기본값이라 무해하지만,
 *  고를 수 있다는 사실 자체를 알리는 것이 질문의 목적이다 */
export function planWhatsNew({ news, prompts, autoOpen, fresh }: {
  news: PatchNote | null;
  prompts: readonly SettingPrompt[];
  autoOpen: boolean;
  fresh: boolean;
}): WhatsNewStep[] {
  if (fresh) return [];
  const steps: WhatsNewStep[] = [];
  if (news && autoOpen) steps.push('news');
  if (prompts.length > 0) steps.push('settings');
  return steps;
}
