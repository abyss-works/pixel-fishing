// 최초 구글 연결 선물 표시 선택자 — 게임 계약과 요리/비약 메타데이터를 조합해 화면에 건넬 순수 표시 모델을 만든다.
import { COOK_KIND_RULES, recipeById } from '../../../game/content/cooking';
import type { Recipe } from '../../../game/content/cooking';
import { FIRST_LINK_REWARD_ITEMS } from '../../../game/content/firstLinkReward';
import { potionById } from '../../../game/content/potions';
import { RARITY, RARITY_ORDER } from '../../../game/content/rarity';
import type { DisplayGradeId } from '../../../game/content/rarity';
import { fmtEffectDuration } from '../../../shared/lib/effectDuration';
import { potionEffectLines } from '../../kitchen/model/bagItems';
import { recipeEffectLines, recipeEffectText } from '../../kitchen/model/recipes';

const MIN_MS = 60_000;

export interface FirstLinkRewardViewItem {
  id: string;
  spriteKind: 'potion' | 'lunch' | 'bait';
  name: string;
  grade: DisplayGradeId;
  qty: number;
  summaryLine: string;
  durationLabel: string;
  effectLabel: string;
}

const SUMMARY_LINES: Readonly<Record<string, string>> = {
  'luck-small': '하루 동안 희귀 이상, 판매가, 네임드 조우가 조금 올라요.',
  'cook-lunch-bundle': '방치 낚시 중 입질 대기가 줄고 희귀 이상 출현이 늘어요.',
  'cook-bait-legendary': '수동 낚시에서 전설 어종이 훨씬 잘 낚여요.',
};

const pct = (x: number): string => String(Number((x * 100).toFixed(2)));

function summarizeRecipeEffect(recipe: Recipe): string {
  const e = recipe.effects;
  const parts: string[] = [];
  if (e.biteWaitCut !== undefined) parts.push(`입질 대기 −${pct(e.biteWaitCut)}%`);
  if (e.rarityWeight !== undefined) {
    const { grades, bonus } = e.rarityWeight;
    const topRarity = RARITY_ORDER[RARITY_ORDER.length - 1];
    if (grades.length > 1 && grades[grades.length - 1] === topRarity) {
      parts.push(`${RARITY[grades[0]].name} 이상 +${pct(bonus)}%`);
    } else {
      for (const g of grades) {
        parts.push(`${RARITY[g].name} 어종 출현 비중 +${pct(bonus)}%`);
      }
    }
  }
  if (parts.length > 0) return parts.join(', ');
  return recipeEffectLines(recipe).map(recipeEffectText).join(', ');
}

/** 출항 연결 창과 설정 계정 관리 창에서 보이는 최초 구글 연결 선물 목록 */
export function selectFirstLinkRewardItems(): FirstLinkRewardViewItem[] {
  return FIRST_LINK_REWARD_ITEMS.map(({ id, qty }) => {
    const summaryLine = SUMMARY_LINES[id] ?? '';
    const potion = potionById(id);
    if (potion) {
      return {
        id: potion.id,
        spriteKind: 'potion',
        name: potion.name,
        grade: potion.grade,
        qty,
        summaryLine,
        durationLabel: '하루 동안',
        effectLabel: potionEffectLines(potion).map(recipeEffectText).join(', '),
      };
    }
    const recipe = recipeById(id);
    if (!recipe) {
      throw new Error(`알 수 없는 최초 연결 선물 품목: ${id}`);
    }
    return {
      id: recipe.id,
      spriteKind: recipe.kind,
      name: recipe.name,
      grade: recipe.grade,
      qty,
      summaryLine,
      durationLabel: fmtEffectDuration(COOK_KIND_RULES[recipe.kind].slotMs / MIN_MS),
      effectLabel: summarizeRecipeEffect(recipe),
    };
  });
}
