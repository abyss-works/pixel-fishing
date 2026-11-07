// 헤더 스토리 - 보통 값, 가장 긴 값, 가방 네 자리, 거점 시계 칩, 펼친 메뉴. 레이아웃(PC, 모바일)은 스토리가 뜬 뷰포트 폭이 정한다.
// 확인 크기: 모바일 360x780, PC 1280x720, 1920x1080.
import type { Meta, StoryObj } from '@storybook/react';
import { newState } from '../../../game/rules/logic';
import type { FishInstance } from '../../../game/rules/logic';
import HudMenuButton from '../../ui/hud/HudMenuButton';
import TimeBadge from '../../ui/hud/TimeBadge';
import MenuList from '../../ui/MenuList';
import PixelIcon from '../../ui/PixelIcon';
import GameStageLayout from '../game-stage/GameStageLayout';
import HudHeader from './HudHeader';

const fish = (i: number): FishInstance => ({ uid: `u${i}`, fishId: 'carp', form: 'normal', size: 10,
  caughtAt: null, spot: null, judgment: null, locked: false });

const typical = { ...newState(), boat: 3, gold: 12_400, fame: 3_200, bag: Array.from({ length: 84 }, (_, i) => fish(i)) };
const longest = { ...newState(), boat: 3, gold: 999_900, fame: 999_900, bag: Array.from({ length: 472 }, (_, i) => fish(i)) };

const fourDigitBag = { ...longest, bag: Array.from({ length: 2990 }, (_, i) => fish(i)) };

const meta: Meta<typeof HudHeader> = {
  title: 'Layouts/HudHeader',
  component: HudHeader,
  parameters: { layout: 'fullscreen' },
  decorators: [Story => (
    <div className="fixed inset-0 flex flex-col bg-bg">
      <GameStageLayout>
        <div className="absolute inset-0 bg-[#0e2c4b]" />
        <Story />
      </GameStageLayout>
    </div>
  )],
  args: {
    onOpenStats: () => {},
    onOpenQuests: () => {},
    menu: <HudMenuButton alert aria-label="메뉴 열기, 새 알림 있음" />,
  },
};
export default meta;
type Story = StoryObj<typeof HudHeader>;

export const Typical: Story = { args: { game: typical, clears: { left: { general: 1, named: 1 }, caps: { general: 1, named: 1 } } } };
/** 골드와 명성 999.9K, 가방 472 (15%), 일반 10, 네임드 3 */
export const Longest: Story = { args: { game: longest, bagBonus: 5, clears: { left: { general: 10, named: 3 }, caps: { general: 1, named: 1 } } } };
export const Loading: Story = { args: { game: typical, clears: { left: null, caps: { general: 1, named: 1 } } } };
/** 가방 2990 (99%), 골드와 명성 999.9K, 일반 10, 네임드 3. 스테이지 폭 440px 미만(360, 390)에서 비율은 생략되고 개수는 남는다. 가장 긴 값이 한 줄에 들어가는지 본다 */
export const FourDigitBag: Story = { args: { game: fourDigitBag, bagBonus: 5, clears: { left: { general: 10, named: 3 }, caps: { general: 1, named: 1 } } } };

/** 줄임 표기가 가장 길어지는 조합: 골드 99.9K, 명성 1.99M(각 5글자), 가방 2990, 일반 10, 네임드 3. 360 폭에서 한 줄에 들어가는지 본다 */
export const FiveCharValues: Story = {
  args: { game: { ...fourDigitBag, gold: 99_999, fame: 1_999_999 }, bagBonus: 5, clears: { left: { general: 10, named: 3 }, caps: { general: 10, named: 3 } } },
};

/** 거점의 시계 칩. 1280x720에서 의뢰 현황, 메뉴 버튼과 겹치지 않아야 한다. 위치는 실제 앱과 같은 besideMenu 값이다 */
export const BaseWithClock: Story = {
  args: { game: longest, bagBonus: 5, clears: { left: { general: 10, named: 3 }, caps: { general: 1, named: 1 } } },
  decorators: [Story => (
    <>
      <Story />
      <TimeBadge besideMenu />
    </>
  )],
};

/** 펼친 메뉴 줄이 오른쪽 아래 카드 묶음(같은 overlay 층, 터치를 받는다)보다 위에 놓여야 한다 */
export const MenuOpenOverCards: Story = {
  args: {
    game: typical,
    clears: { left: { general: 1, named: 1 }, caps: { general: 1, named: 1 } },
    menu: (
      <div className="relative flex flex-col items-end gap-1">
        <HudMenuButton open aria-label="메뉴 닫기" />
        <MenuList className="min-w-[150px] p-1 mobile:absolute mobile:right-0 mobile:top-full mobile:mt-1" items={['길드', '소셜', '우편함'].map(label => ({
          key: label, label, onSelect: () => {},
          content: (
            <span className="grid w-full grid-cols-[1fr_20px] items-center gap-2.5 h-9 px-2 text-sm">
              <span>{label}</span><PixelIcon glyph="flag" size={16} className="text-text-dim" />
            </span>
          ),
        }))} />
      </div>
    ),
  },
  decorators: [Story => (
    <>
      <div className="absolute right-3 top-20 z-(--z-overlay) w-40 h-40 pointer-events-auto border-2 border-gold bg-surface p-2 text-sm">
        카드 묶음 자리
      </div>
      <Story />
    </>
  )],
};
