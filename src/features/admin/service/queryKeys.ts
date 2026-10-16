// 관리자 조회 캐시 키 — 기간을 받는 조회는 키에 기간을 넣어 캐시를 분리한다.
// 같은 대상을 쓰는 탭(유저 명부 등)은 같은 키를 공유해 중복 조회를 합친다.
export const adminKeys = {
  access: ['admin', 'access'] as const,
  users: ['admin', 'users'] as const,
  letters: ['admin', 'letters'] as const,
  antiAbuse: ['admin', 'antiabuse'] as const,
  overview: (days: number) => ['admin', 'overview', days] as const,
  economy: (days: number) => ['admin', 'economy', days] as const,
  bountyFunnel: (days: number) => ['admin', 'bountyFunnel', days] as const,
  metrics: (days: number) => ['admin', 'metrics', days] as const,
  userDetails: (uid: string) => ['admin', 'user', uid] as const,
};
