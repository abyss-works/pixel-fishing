import { useEffect, useSyncExternalStore } from 'react';
import { APP_VERSION } from '../../../version';
import { PATCH_NOTES } from '../../../game/content/patchnotes';
import type { PatchNote } from '../../../game/content/patchnotes';
import type { GameState } from '../../../game/rules/logic';
import {
  getAnnouncements, markPromptsAnswered, setLastSeenVersion,
} from '../../../platform/api/announcements';
import {
  SETTING_PROMPTS, isFreshPlayer, latestNewsAtOrBelow, pendingPrompts, planWhatsNew, unseenNews,
} from '../model/whatsNew';
import type { SettingPrompt, WhatsNewStep } from '../model/whatsNew';

// 업데이트 소식 창의 세션 상태 — 접속 후 세이브가 준비되면 한 번 계획한다.
// 소식은 창이 보이는 때 보인 가장 높은 버전을 마지막으로 본 버전으로 남기고(닫는 방식과 무관, 다음 접속에는 그 뒤 버전만 뜬다),
// 보여준 질문은 닫을 때 답한 것으로 남긴다.
// 창에 보여줄 질문 목록은 계획 시점에 고정한다(고르는 도중에 목록이 줄어들지 않게).
interface Session {
  evaluated: boolean;
  steps: readonly WhatsNewStep[];
  index: number;
  /** 보일 소식, 최신 순 */
  news: readonly PatchNote[];
  prompts: readonly SettingPrompt[];
}

const CLOSED: Session = { evaluated: false, steps: [], index: 0, news: [], prompts: [] };
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
  const news = unseenNews(PATCH_NOTES, APP_VERSION, record);
  const prompts = pendingPrompts(SETTING_PROMPTS, new Set(record.answered));
  const fresh = isFreshPlayer(game);
  if (fresh) {
    setLastSeenVersion(APP_VERSION);
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
  } else if (news.length > 0) {
    setLastSeenVersion(news[0].version); // 소식 창이 보이는 때 기록한다 — 닫는 방식과 무관하게 한 번만 보인다
  }
  const steps = planWhatsNew({ news, prompts, fresh });
  update({ evaluated: true, steps, index: 0, news, prompts });
}

/** 창 닫기 — 보여준 질문은 답한 것으로 남긴다(고른 값은 이미 적용돼 있다) */
function close() {
  if (session.steps.includes('settings')) markPromptsAnswered(session.prompts.map(p => p.id));
  update({ ...session, steps: [], index: 0 });
}

function go(delta: 1 | -1) {
  const index = session.index + delta;
  if (index < 0) return;
  if (index >= session.steps.length) { close(); return; }
  update({ ...session, index });
}

/**
 * 패치노트 창의 "최근 소식 다시 보기" — 본 기록과 무관하게 항목이 있는 가장 최근 버전의 소식을 연다.
 * 현재 버전 이하의 항목 가운데 가장 높은 버전을 고르며 배열 순서에 기대지 않는다. 항목이 없으면 열지 않는다.
 */
export function reopenWhatsNew(): boolean {
  const news = latestNewsAtOrBelow(PATCH_NOTES, APP_VERSION);
  if (!news) return false;
  update({ ...session, steps: ['news'], index: 0, news: [news], prompts: [] });
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

/** 업데이트 소식 창이 떠 있거나 아직 판정 전인지 — 다른 안내 창이 이 창 뒤로 차례를 미룬다 */
export function useWhatsNewPending(): boolean {
  const s = useSyncExternalStore(subscribe, getSession, getSession);
  return !s.evaluated || s.steps.length > 0;
}

/** 테스트 격리용 — 세션을 처음으로 되돌린다 */
export function resetWhatsNewSession(): void {
  update(CLOSED);
}
