import { useEffect, useSyncExternalStore } from 'react';
import { APP_VERSION } from '../../../version';
import { PATCH_NOTES } from '../../../game/content/patchnotes';
import type { PatchNote } from '../../../game/content/patchnotes';
import type { GameState } from '../../../game/rules/logic';
import {
  getAnnouncements, markNewsSeen, markPromptsAnswered, setNewsAutoOpen, subscribeAnnouncements,
} from '../../../platform/api/announcements';
import {
  SETTING_PROMPTS, isFreshPlayer, newsFor, pendingPrompts, planWhatsNew,
} from '../model/whatsNew';
import type { SettingPrompt, WhatsNewStep } from '../model/whatsNew';

// 업데이트 소식 창의 세션 상태 — 접속 후 세이브가 준비되면 한 번 계획하고, 닫으면 본 것으로 남긴다.
// 창에 보여줄 질문 목록은 계획 시점에 고정한다(고르는 도중에 목록이 줄어들지 않게).
interface Session {
  evaluated: boolean;
  steps: readonly WhatsNewStep[];
  index: number;
  news: PatchNote | null;
  prompts: readonly SettingPrompt[];
}

const CLOSED: Session = { evaluated: false, steps: [], index: 0, news: null, prompts: [] };
let session: Session = CLOSED;
const listeners = new Set<() => void>();

function update(next: Session) {
  session = next;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getSession = () => session;

/** 세이브가 준비된 뒤 한 번 — 이번 세션에 띄울 단계를 정한다. 처음 시작한 플레이어는 조용히 본 것으로 남긴다 */
function evaluate(game: Pick<GameState, 'fame' | 'dex'>) {
  if (session.evaluated) return;
  const record = getAnnouncements();
  const news = newsFor(PATCH_NOTES, APP_VERSION, record.seenVersion);
  const prompts = pendingPrompts(SETTING_PROMPTS, new Set(record.answered));
  const fresh = isFreshPlayer(game);
  if (fresh) {
    markNewsSeen(APP_VERSION);
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
  }
  const steps = planWhatsNew({ news, prompts, autoOpen: record.autoOpen, fresh });
  update({ evaluated: true, steps, index: 0, news, prompts });
}

/** 창 닫기 — 보여준 소식은 본 것으로, 보여준 질문은 답한 것으로 남긴다(고른 값은 이미 적용돼 있다) */
function close() {
  const shown = session.steps;
  if (shown.includes('news')) markNewsSeen(APP_VERSION);
  if (shown.includes('settings')) markPromptsAnswered(session.prompts.map(p => p.id));
  update({ ...session, steps: [], index: 0 });
}

function go(delta: 1 | -1) {
  const index = session.index + delta;
  if (index < 0) return;
  if (index >= session.steps.length) { close(); return; }
  update({ ...session, index });
}

/** 설정 탭의 "이번 소식 다시 보기" — 본 기록과 무관하게 현재 버전 소식만 연다 */
export function reopenWhatsNew(): boolean {
  const news = PATCH_NOTES.find(n => n.version === APP_VERSION) ?? null;
  if (!news) return false;
  update({ ...session, steps: ['news'], index: 0, news, prompts: [] });
  return true;
}

export function useWhatsNew(game: Pick<GameState, 'fame' | 'dex'>, ready: boolean) {
  const s = useSyncExternalStore(subscribe, getSession, getSession);
  useEffect(() => {
    if (ready) evaluate(game);
  }, [ready, game]);
  return {
    open: s.steps.length > 0,
    step: s.steps[s.index] ?? null,
    steps: s.steps,
    index: s.index,
    news: s.news,
    prompts: s.prompts,
    next: () => go(1),
    back: () => go(-1),
    close,
  };
}

/** 소식 자동 열기 설정 — 소식 창의 체크와 설정 탭이 같은 값을 본다 */
export function useNewsAutoOpen(): [boolean, (on: boolean) => void] {
  const record = useSyncExternalStore(subscribeAnnouncements, getAnnouncements, getAnnouncements);
  return [record.autoOpen, setNewsAutoOpen];
}

/** 테스트 격리용 — 세션을 처음으로 되돌린다 */
export function resetWhatsNewSession(): void {
  update(CLOSED);
}
