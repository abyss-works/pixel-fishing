import { RARITY } from '../../game/content/rarity';
import type { RarityId } from '../../game/content/rarity';

/** 등급이 있는 대상(아이템, 유물, 생명의 기운)의 화면 이름 — 이름 뒤에 등급을 괄호로 붙인다. 물고기는 이 표기를 쓰지 않는다 */
export const gradeName = (name: string, grade: RarityId): string => `${name}(${RARITY[grade].name})`;
