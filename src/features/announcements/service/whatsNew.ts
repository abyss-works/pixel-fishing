import { useEffect, useSyncExternalStore } from 'react';
import { APP_VERSION } from '../../../version';
import { PATCH_NOTES } from '../../../game/content/patchnotes';
import type { PatchNote } from '../../../game/content/patchnotes';
import type { GameState } from '../../../game/rules/logic';
import {
  getAnnouncements, markPromptsAnswered, setDismissedVersion, setLastSeenVersion,
} from '../../../platform/api/announcements';
import {
  SETTING_PROMPTS, compareVersions, isFreshPlayer, latestNewsAtOrBelow, pendingPrompts, planWhatsNew, unseenNews,
} from '../model/whatsNew';
import type { SettingPrompt, WhatsNewStep } from '../model/whatsNew';

// 업데이트 소식 창의 세션 상태 — 접속 후 세이브가 준비되면 한 번 계획한다.
// 닫을 때 소식은 "다시 보지 않기" 체크대로 남기고(체크 안 하면 다음 접속에 다시 뜬다), 보여준 질문은 답한 것으로 남긴다.
// 창에 보여줄 질문 목록은 계획 시점에 고정한다(고르는 도중에 목록이 줄어들지 않게).
interface Session {
  evaluated: boolean;
  steps: readonly WhatsNewStep[];
  index: number;
  /** 보일 소식, 최신 순 */
  news: readonly PatchNote[];
  prompts: readonly SettingPrompt[];
  /** "다시 보지 않기" 체크 — 이미 다시 보지 않기로 한 소식을 다시 열면 체크된 채로 시작한다 */
  dismiss: boolean;
}

const CLOSED: Session = { evaluated: false, steps: [], index: 0, news: [], prompts: [], dismiss: false };
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
    setDismissedVersion(APP_VERSION);
    setLastSeenVersion(APP_VERSION);
    markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
  }
  const steps = planWhatsNew({ news, prompts, fresh });
  update({ evaluated: true, steps, index: 0, news, prompts, dismiss: false });
}

/**
 * 소식을 닫을 때의 본 버전 기록. 닫는 방식과 무관하게 보인 가장 높은 버전을 마지막으로 본 버전으로 남기되 낮추지 않는다.
 * "다시 보지 않기"를 체크하면 그 버전까지 다시 뜨지 않게 남기고, 체크하지 않으면 그대로 둬서 다음 접속에 같은 소식이 다시 뜬다.
 * 이미 다시 보지 않기로 한 소식을 다시 보기로 열어 체크를 풀었다면 그 기록을 비워 그 소식이 다시 뜨게 한다.
 */
function settleNews() {
  const shown = session.news;
  if (shown.length === 0) return;
  const top = shown[0].version;
  const { lastSeenVersion } = getAnnouncements();
  if (lastSeenVersion === null || compareVersions(top, lastSeenVersion) > 0) setLastSeenVersion(top);
  if (session.dismiss) { setDismissedVersion(top); return; }
  const oldest = shown[shown.length - 1].version;
  if (getAnnouncements().dismissedVersion === oldest) setDismissedVersion(null);
}

/** 창 닫기 — 소식은 체크대로 남기고, 보여준 질문은 답한 것으로 남긴다(고른 값은 이미 적용돼 있다) */
function close() {
  const shown = session.steps;
  if (shown.includes('news')) settleNews();
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

/**
 * 패치노트 창의 "최근 소식 다시 보기" — 본 기록과 무관하게 항목이 있는 가장 최근 버전의 소식을 연다.
 * 현재 버전 이하의 항목 가운데 가장 높은 버전을 고르며 배열 순서에 기대지 않는다. 항목이 없으면 열지 않는다.
 * 다시 보지 않기 기록은 열린 소식의 버전을 기준으로 남아, 현재 버전 항목이 없을 때도 접속 팝업과 어긋나지 않는다.
 */
export function reopenWhatsNew(): boolean {
  const news = latestNewsAtOrBelow(PATCH_NOTES, APP_VERSION);
  if (!news) return false;
  const dismiss = getAnnouncements().dismissedVersion === news.version;
  update({ ...session, steps: ['news'], index: 0, news: [news], prompts: [], dismiss });
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

/** 업데이트 소식 창이 떠 있거나 아직 판정 전인지 — 다른 안내 창이 이 창 뒤로 차례를 미룬다 */
export function useWhatsNewPending(): boolean {
  const s = useSyncExternalStore(subscribe, getSession, getSession);
  return !s.evaluated || s.steps.length > 0;
}

/** 테스트 격리용 — 세션을 처음으로 되돌린다 */
export function resetWhatsNewSession(): void {
  update(CLOSED);
}
