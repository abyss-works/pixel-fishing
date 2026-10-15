// 업데이트 소식 기록 — 기기별 표시 설정(localStorage 1키, JSON). 진행이 아니라 보는 방식이라
// 세이브·서버 권위 대상이 아니다. 저장값이 없거나 깨졌으면 기본(기록 없음)으로 읽는다.
export const ANNOUNCEMENTS_KEY = 'pf-announcements';

export interface AnnouncementsState {
  /** "다시 보지 않기"로 닫은 소식의 앱 버전 — 이 버전 소식은 더 띄우지 않는다 */
  dismissedVersion: string | null;
  /** 답한(또는 창을 닫아 넘긴) 새 설정 질문 id */
  answered: readonly string[];
}

const DEFAULT: AnnouncementsState = { dismissedVersion: null, answered: [] };

export function loadAnnouncements(): AnnouncementsState {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(ANNOUNCEMENTS_KEY) : null;
    if (!raw) return DEFAULT;
    const v = JSON.parse(raw) as Partial<AnnouncementsState>;
    return {
      dismissedVersion: typeof v.dismissedVersion === 'string' ? v.dismissedVersion : null,
      answered: Array.isArray(v.answered) ? v.answered.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return DEFAULT; // 저장소 접근이 막혔거나 값이 깨졌다
  }
}

let state: AnnouncementsState = loadAnnouncements();
const listeners = new Set<() => void>();

function commit(next: AnnouncementsState) {
  state = next;
  try { localStorage.setItem(ANNOUNCEMENTS_KEY, JSON.stringify(next)); } catch { /* 이번 세션에만 적용 */ }
  for (const listener of listeners) listener();
}

export function getAnnouncements(): AnnouncementsState {
  return state;
}

export function subscribeAnnouncements(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** 소식 "다시 보지 않기" — 버전을 남기면 그 버전 소식은 더 뜨지 않고, null이면 해제한다 */
export function setDismissedVersion(version: string | null): void {
  if (state.dismissedVersion === version) return;
  commit({ ...state, dismissedVersion: version });
}

export function markPromptsAnswered(ids: readonly string[]): void {
  const added = ids.filter(id => !state.answered.includes(id));
  if (added.length === 0) return;
  commit({ ...state, answered: [...state.answered, ...added] });
}

/** 테스트 격리용 — 메모리 값을 기본으로 되돌린다(저장소는 건드리지 않는다) */
export function resetAnnouncements(): void {
  if (state === DEFAULT) return;
  state = DEFAULT;
  for (const listener of listeners) listener();
}
