import { useEffect, useSyncExternalStore } from 'react';
import { APP_VERSION } from '../../../version';
import { PATCH_NOTES } from '../../../game/content/patchnotes';
import type { PatchNote } from '../../../game/content/patchnotes';
import type { GameState } from '../../../game/rules/logic';
import {
  getAnnouncements, markPromptsAnswered, setDismissedVersion,
} from '../../../platform/api/announcements';
import {
  SETTING_PROMPTS, isFreshPlayer, newsFor, pendingPrompts, planWhatsNew,
} from '../model/whatsNew';
import type { SettingPrompt, WhatsNewStep } from '../model/whatsNew';

// 업데이트 소식 창의 세션 상태 — 접속 후 세이브가 준비되면 한 번 계획한다.
// 닫을 때 소식은 "다시 보지 않기" 체크대로 남기고(체크 안 하면 다음 접속에 다시 뜬다), 보여준 질문은 답한 것으로 남긴다.
// 창에 보여줄 질문 목록은 계획 시점에 고정한다(고르는 도중에 목록이 줄어들지 않게).
interface Session {
  evaluated: boolean;
  steps: readonly WhatsNewStep[];
  index: number;
  news: PatchNote | null;
  prompts: readonly SettingPrompt[];
  /** "이번 소식 다시 보지 않기" 체크 — 이미 다시 보지 않기로 한 소식을 다시 열면 체크된 채로 시작한다 */
  dismiss: boolean;
}

const CLOSED: Session = { evaluated: false, steps: [], index: 0, news: null, prompts: [], dismiss: false };
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

/** 세이브가 준비된 뒤 한 번 — 이번 세션에 띄울 단계를 정한다. 처음 시작한 플레이어는 조용히 넘긴다 */
function evaluate(game: Pick<GameState, 'fame' | 'dex'>) {
  if (session.evaluated) return;
  const record = getAnnouncements();
  const news = newsFor(PATCH_NOTES, APP_VERSION, record.dismissedVersion);
  const prompts = pendingPrompts(SETTING_PROMPTS, new Set(record.answered));
  const fresh = isFreshPlayer(game);
  if (fresh) {
    setDismissedVersion(APP_VERSION);
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
  }
  const steps = planWhatsNew({ news, prompts, fresh });
  update({ evaluated: true, steps, index: 0, news, prompts, dismiss: false });
}

/** 창 닫기 — 소식은 체크대로 남기고, 보여준 질문은 답한 것으로 남긴다(고른 값은 이미 적용돼 있다) */
function close() {
  const shown = session.steps;
  if (shown.includes('news')) setDismissedVersion(session.dismiss ? APP_VERSION : null);
  if (shown.includes('settings')) markPromptsAnswered(session.prompts.map(p => p.id));
  update({ ...session, steps: [], index: 0 });
}

function setDismiss(dismiss: boolean) {
  update({ ...session, dismiss });
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
  const dismiss = getAnnouncements().dismissedVersion === APP_VERSION;
  update({ ...session, steps: ['news'], index: 0, news, prompts: [], dismiss });
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
    dismiss: s.dismiss,
    setDismiss,
    next: () => go(1),
    back: () => go(-1),
    close,
  };
}

/** 테스트 격리용 — 세션을 처음으로 되돌린다 */
export function resetWhatsNewSession(): void {
  update(CLOSED);
}
