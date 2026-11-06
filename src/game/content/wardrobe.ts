// 옷장 콘텐츠 — 옷 색 팔레트, 조합 프리셋, 모자 목록.
// 외형(Look)은 팔레트 번호와 모자 id로만 표현한다. 색 코드는 그림을 그리는 쪽이 이 목록에서 찾는다.
// 상대 import에는 .js 확장자를 쓴다 — Node 순수 ESM 서버가 직접 불러온다.

/** 캐릭터 외형 — 웃옷·바지 팔레트 번호와 쓴 모자 id(없으면 null) */
export interface Look { shirt: number; pants: number; hat: string | null }

export const SHIRT_COLORS: readonly string[] = [
  '#3f6d4e', '#c62828', '#ef6c00', '#f9a825', '#2e7d32', '#00838f',
  '#1565c0', '#4527a0', '#6a1b9a', '#ad1457', '#eceff1', '#37474f',
];

export const PANTS_COLORS: readonly string[] = [
  '#31427a', '#212121', '#5d4037', '#455a64', '#1b5e20', '#0d47a1',
  '#4e342e', '#263238', '#6d4c41', '#3e2723', '#90a4ae', '#283593',
];

/** 기본 외형 — 웃옷 0번, 바지 0번, 모자 없음 */
export const DEFAULT_LOOK: Look = { shirt: 0, pants: 0, hat: null };

/** 웃옷과 바지 조합 프리셋 */
export const LOOK_PRESETS: readonly { name: string; shirt: number; pants: number }[] = [
  { name: '기본', shirt: 0, pants: 0 },
  { name: '어부', shirt: 6, pants: 1 },
  { name: '노을', shirt: 2, pants: 7 },
  { name: '해군', shirt: 10, pants: 5 },
  { name: '숲', shirt: 4, pants: 2 },
  { name: '밤바다', shirt: 7, pants: 3 },
];

export interface Hat { id: string; name: string; color: string; price: number }

/** 골드로 사는 모자 — 모두 같은 모양에 색만 다르다 */
export const HATS: readonly Hat[] = [
  { id: 'cap-red', name: '빨간 모자', color: '#c62828', price: 50_000 },
  { id: 'cap-blue', name: '파란 모자', color: '#1565c0', price: 50_000 },
  { id: 'cap-yellow', name: '노란 모자', color: '#f9a825', price: 100_000 },
  { id: 'cap-green', name: '초록 모자', color: '#2e7d32', price: 200_000 },
  { id: 'cap-black', name: '검은 모자', color: '#212121', price: 500_000 },
];

export function hatById(id: unknown): Hat | undefined {
  return typeof id === 'string' ? HATS.find(h => h.id === id) : undefined;
}

const inPalette = (n: unknown, palette: readonly string[]): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < palette.length;

/** 신뢰할 수 없는 값을 외형으로 읽는다. 하나라도 범위 밖이거나 형식이 틀리면 기본 외형이다. 모자 필드가 없으면 모자 없음이다 */
export function safeLook(raw: unknown): Look {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_LOOK;
  const { shirt, pants, hat = null } = raw as Record<string, unknown>;
  if (!inPalette(shirt, SHIRT_COLORS) || !inPalette(pants, PANTS_COLORS)) return DEFAULT_LOOK;
  if (hat !== null && !hatById(hat)) return DEFAULT_LOOK;
  return { shirt, pants, hat: hat as string | null };
}
