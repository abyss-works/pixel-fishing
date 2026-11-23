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

export type HatSource = 'gold' | 'achievement';

export interface Hat {
  id: string;
  name: string;
  color: string;
  accentColor?: string;
  price: number;
  source: HatSource;
  achievementId?: string;
}

/** 모자 목록 — 골드로 사는 모자 5종 뒤에 업적 보상 모자 41종을 둔다 */
export const HATS: readonly Hat[] = [
  { id: 'cap-red', name: '빨간 모자', color: '#c62828', price: 50_000, source: 'gold' },
  { id: 'cap-blue', name: '파란 모자', color: '#1565c0', price: 50_000, source: 'gold' },
  { id: 'cap-yellow', name: '노란 모자', color: '#f9a825', price: 100_000, source: 'gold' },
  { id: 'cap-green', name: '초록 모자', color: '#2e7d32', price: 200_000, source: 'gold' },
  { id: 'cap-black', name: '검은 모자', color: '#212121', price: 500_000, source: 'gold' },
  { id: 'straw-hat', name: '밀짚모자', color: '#d9b45a', price: 0, source: 'achievement', achievementId: 'variant-village' },
  { id: 'sou-wester', name: '방수모', color: '#4f7a90', price: 0, source: 'achievement', achievementId: 'variant-pacific' },
  { id: 'coral-bandana', name: '산호빛 두건', color: '#e0705a', price: 0, source: 'achievement', achievementId: 'variant-seasia' },
  { id: 'saffron-turban', name: '사프란 터번', color: '#e08a1e', price: 0, source: 'achievement', achievementId: 'variant-indian' },
  { id: 'worn-tricorn', name: '낡은 삼각모', color: '#5e4632', price: 0, source: 'achievement', achievementId: 'variant-madagascar' },
  { id: 'fog-beanie', name: '안개빛 털모자', color: '#98a4aa', price: 0, source: 'achievement', achievementId: 'variant-southatlantic' },
  { id: 'braid-captain-cap', name: '금몰 선장모', color: '#eceff1', accentColor: '#d4af37', price: 0, source: 'achievement', achievementId: 'variant-all' },
  { id: 'anchor-beret', name: '닻핀 베레모', color: '#243b6b', accentColor: '#d4af37', price: 0, source: 'achievement', achievementId: 'grade-legendary' },
  { id: 'watch-sailor-cap', name: '당직 선원모', color: '#23304f', price: 0, source: 'achievement', achievementId: 'night-normal' },
  { id: 'earflap-cap', name: '귀덮개 모자', color: '#1c2430', price: 0, source: 'achievement', achievementId: 'night-variant' },
  { id: 'crescent-hood', name: '초승달 뱃두건', color: '#2a445e', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'night-seasia-normal' },
  { id: 'ink-hood', name: '먹빛 뱃두건', color: '#182230', accentColor: '#4fc3f7', price: 0, source: 'achievement', achievementId: 'night-seasia-variant' },
  { id: 'polar-beret', name: '별빛 몬순 베레모', color: '#2d4a62', accentColor: '#80deea', price: 0, source: 'achievement', achievementId: 'night-indian-normal' },
  { id: 'polar-knit-cap', name: '밤안개 향신료 두건', color: '#1b2938', accentColor: '#b39ddb', price: 0, source: 'achievement', achievementId: 'night-indian-variant' },
  { id: 'strait-night-cap', name: '해협 야간 챙모자', color: '#354856', accentColor: '#cfd8dc', price: 0, source: 'achievement', achievementId: 'night-madagascar-normal' },
  { id: 'inkglass-beanie', name: '먹물 유리 비니', color: '#1a252c', accentColor: '#80cbc4', price: 0, source: 'achievement', achievementId: 'night-madagascar-variant' },
  { id: 'lookout-storm-hat', name: '야간 망루 방풍모', color: '#34424d', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'night-southatlantic-normal' },
  { id: 'pitch-lookout-cap', name: '칠흑 망루 모자', color: '#141c28', accentColor: '#ba68c8', price: 0, source: 'achievement', achievementId: 'night-southatlantic-variant' },
  { id: 'lure-bucket-hat', name: '털바늘 낚시 모자', color: '#6b7a3a', accentColor: '#e0705a', price: 0, source: 'achievement', achievementId: 'big-50' },
  { id: 'gold-hook-hat', name: '금바늘 대어 모자', color: '#3b4d63', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'big-100-hat' },
  { id: 'harpooner-pillbox', name: '작살잡이 가죽 모자', color: '#4e342e', price: 0, source: 'achievement', achievementId: 'named-all' },
  { id: 'shipowner-bowler', name: '선주 중절모', color: '#44403a', accentColor: '#1f1d1a', price: 0, source: 'achievement', achievementId: 'artifact-all' },
  { id: 'salt-fisher-cap', name: '소금 얼룩 어부 모자', color: '#3d5a73', accentColor: '#dfe6ea', price: 0, source: 'achievement', achievementId: 'catch-100000' },
  { id: 'megalodon-work-cap', name: '짙은 물빛 작업모', color: '#3e5060', price: 0, source: 'achievement', achievementId: 'named-megalodon-1' },
  { id: 'megalodon-fin-cap', name: '등지느러미 어부 캡', color: '#5c6f7e', accentColor: '#9fb4c7', price: 0, source: 'achievement', achievementId: 'named-megalodon-5' },
  { id: 'megalodon-silver-visor', name: '은비늘 상어 챙모자', color: '#7a8a99', accentColor: '#dfe6ea', price: 0, source: 'achievement', achievementId: 'named-megalodon-10' },
  { id: 'leviathan-dive-hood', name: '군도 잠수 두건', color: '#33536e', price: 0, source: 'achievement', achievementId: 'named-leviathan-1' },
  { id: 'leviathan-bell-cap', name: '침선 종지기 모자', color: '#4a647a', accentColor: '#d4af37', price: 0, source: 'achievement', achievementId: 'named-leviathan-5' },
  { id: 'leviathan-serpent-hat', name: '청비늘 뱀무늬 모자', color: '#2f4f75', accentColor: '#81d4fa', price: 0, source: 'achievement', achievementId: 'named-leviathan-10' },
  { id: 'ananta-lantern-hood', name: '사원 등잔 두건', color: '#3a4b5c', accentColor: '#ffb74d', price: 0, source: 'achievement', achievementId: 'named-ananta-1' },
  { id: 'ananta-rope-cap', name: '짧은 밧줄 선원모', color: '#4e5d6b', accentColor: '#d7ccc8', price: 0, source: 'achievement', achievementId: 'named-ananta-5' },
  { id: 'ananta-astrolabe-hat', name: '별시계 항해사 모자', color: '#243b6b', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'named-ananta-10' },
  { id: 'dunkleos-trawl-hat', name: '저인망 뱃사람 모자', color: '#48545c', price: 0, source: 'achievement', achievementId: 'named-elder-sixgill-1' },
  { id: 'dunkleos-rivet-leather', name: '무쇠 리벳 가죽 모자', color: '#4e3f37', accentColor: '#b0bec5', price: 0, source: 'achievement', achievementId: 'named-elder-sixgill-5' },
  { id: 'dunkleos-jaw-helm', name: '강철 턱뼈 투구모', color: '#3b4a52', accentColor: '#cfd8dc', price: 0, source: 'achievement', achievementId: 'named-elder-sixgill-10' },
  { id: 'adamastor-pier-cap', name: '찬바람 부두 모자', color: '#47525e', price: 0, source: 'achievement', achievementId: 'named-adamastor-1' },
  { id: 'adamastor-storm-hood', name: '폭풍곶 방풍모', color: '#384452', accentColor: '#90a4ae', price: 0, source: 'achievement', achievementId: 'named-adamastor-5' },
  { id: 'adamastor-lantern-hood', name: '초롱불 돌기 방풍모', color: '#2f3b49', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'named-adamastor-10' },
  { id: 'jasconius-island-cap', name: '화산섬 뱃사람 모자', color: '#4a5568', accentColor: '#ff8a65', price: 0, source: 'achievement', achievementId: 'named-jasconius-1' },
  { id: 'jasconius-ember-visor', name: '모닥불 재 챙모자', color: '#5d5450', accentColor: '#ff7043', price: 0, source: 'achievement', achievementId: 'named-jasconius-5' },
  { id: 'jasconius-rockback-hat', name: '바위등 거대어 모자', color: '#5f7078', accentColor: '#a1887f', price: 0, source: 'achievement', achievementId: 'named-jasconius-10' },
  { id: 'ridge-compass-cap', name: '어긋난 나침반 모자', color: '#2b3d4f', accentColor: '#cfd8dc', price: 0, source: 'achievement', achievementId: 'variant-northatlantic' },
  { id: 'ridge-lantern-cap', name: '해령 등불 선원모', color: '#1f2e3d', accentColor: '#80deea', price: 0, source: 'achievement', achievementId: 'night-northatlantic-normal' },
  { id: 'vanishing-hood', name: '극야의 흑모자', color: '#111824', accentColor: '#ba68c8', price: 0, source: 'achievement', achievementId: 'night-northatlantic-variant' },
  { id: 'gloucester-fog-cap', name: '안개 뱃고동 작업모', color: '#3c545c', price: 0, source: 'achievement', achievementId: 'named-gloucester-serpent-1' },
  { id: 'gloucester-vertebra-visor', name: '소금 등마디 챙모자', color: '#4f6973', accentColor: '#dfe6ea', price: 0, source: 'achievement', achievementId: 'named-gloucester-serpent-5' },
  { id: 'gloucester-crest-hat', name: '바다뱀 혹 비니', color: '#2f454d', accentColor: '#80cbc4', price: 0, source: 'achievement', achievementId: 'named-gloucester-serpent-10' },
  { id: 'guabancex-sargasso-hood', name: '모자반 매듭 두건', color: '#3a4b66', accentColor: '#8fa3bf', price: 0, source: 'achievement', achievementId: 'named-guabancex-1' },
  { id: 'guabancex-eye-hat', name: '폭풍눈 방수모', color: '#2c3a54', accentColor: '#81d4fa', price: 0, source: 'achievement', achievementId: 'named-guabancex-5' },
  { id: 'guabancex-fin-crown', name: '소용돌이 지느러미 모자', color: '#232f47', accentColor: '#ffd54f', price: 0, source: 'achievement', achievementId: 'named-guabancex-10' },
];

export const isAchievementHat = (hat: Hat): boolean => hat.source === 'achievement';

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
