// 게스트 잠금 가드 - 게스트에게 닫힌 화면 요소는 공용 잠금 구조(Locked, MenuList와 MenuCard의 lock)와
// 기능 모델의 판정(guestLock, menuLock)만 쓴다. 화면마다 따로 만든 잠금 툴팁과 옛 문구를 막고, 쓰는 곳의 전수 목록을 고정한다.
import { describe, expect, it } from 'vitest';

const sources = Object.entries(import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>)
  .map(([key, src]) => ({ path: key.replace(/^\.\.\//, '').replace(/^\.\//, 'ui/'), src }))
  .filter(f => !/\.test\.tsx?$/.test(f.path));

const featureSources = Object.entries(import.meta.glob('../../features/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>)
  .map(([key, src]) => ({ path: key.replace(/^\.\.\/\.\.\//, ''), src }))
  .filter(f => !/\.test\.tsx?$/.test(f.path) && !f.path.startsWith('features/admin/'));

/** 게스트 판정을 기능 모델에서 받아 잠금으로 그리는 화면의 전수 목록. 새 잠금 화면은 이 목록에 더한다 */
const GUEST_LOCK_SCREENS = [
  'views/game/base-menu/BaseMenu.tsx',     // 집 시설 카드(옷장, 부엌): MenuCard lock
  'views/overlays/account/MyInfoModal.tsx',  // 닉네임 입력
  'views/overlays/letter/LetterModal.tsx',   // 편지 입력 칸
  'views/overlays/live/ChatBar.tsx',         // 채팅 방 버튼과 입력 칸
  'views/overlays/live/PlayerInfo.tsx',      // 친구 요청과 차단
  'views/overlays/menu/GameMenu.tsx',        // 메뉴 줄 의뢰, 길드, 소셜, 우편함: MenuList lock
];

const SHARED_STRUCTURE = /<Locked\b|\block=\{|\block: /;

describe('게스트 잠금 가드', () => {
  it('게스트 판정(guestLock, menuLock)을 쓰는 화면은 전수 목록과 같다', () => {
    const users = sources.filter(f => /^views\//.test(f.path) && /\b(?:guestLock|menuLock)\(/.test(f.src)).map(f => f.path).sort();
    expect(users).toEqual([...GUEST_LOCK_SCREENS].sort());
  });

  it('목록의 화면은 모두 공용 잠금 구조로 그린다', () => {
    for (const path of GUEST_LOCK_SCREENS) {
      const file = sources.find(f => f.path === path);
      expect(file, path).toBeDefined();
      expect(file!.src, path).toMatch(SHARED_STRUCTURE);
    }
  });

  it('잠금 요소와 이를 쓰는 화면에 title 속성이 없다', () => {
    const nativeTitle = /<(?:div|span|button|input|textarea|p|label)\b[^>]*\stitle=/;
    for (const f of sources.filter(s => s.path === 'ui/Locked.tsx' || s.path === 'ui/MenuCard.tsx' || s.path === 'ui/MenuList.tsx'
      || GUEST_LOCK_SCREENS.includes(s.path))) {
      expect(f.src, f.path).not.toMatch(nativeTitle);
    }
  });

  it('공용 잠금 요소는 동작을 받지 않는다(눌러도 실행되는 연결이 없다)', () => {
    const locked = sources.find(f => f.path === 'ui/Locked.tsx')!.src;
    expect(locked).not.toMatch(/\bonClick\b|\bonKeyDown\b|\bonSelect\b/);
  });

  it('화면과 기능 모델에 옛 게스트 잠금 문구(계정을 만든 뒤)가 없다', () => {
    const old = /계정을 만든 뒤|계정을 만든 후|계정이 있어야 들어갈/;
    for (const f of [...sources, ...featureSources]) expect(f.src, f.path).not.toMatch(old);
  });
});
