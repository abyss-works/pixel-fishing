// 튜토리얼 — 정해진 순간(트리거)에 한 번씩 뜨는 안내 창. 식별자가 곧 트리거다.
// 본 기록은 계정 단위로 게임 상태(tutorials)에 남아 다른 기기·주소에서 다시 뜨지 않는다.
// 문구는 화면 계층이 소유한다. 여러 트리거가 함께 켜지면 이 목록 순서대로 하나씩 뜬다.
export const TUTORIAL_IDS = ['village', 'sea', 'bounty-quests', 'bounty-named'] as const;
export type TutorialId = typeof TUTORIAL_IDS[number];

export function isTutorialId(v: unknown): v is TutorialId {
  return typeof v === 'string' && (TUTORIAL_IDS as readonly string[]).includes(v);
}
