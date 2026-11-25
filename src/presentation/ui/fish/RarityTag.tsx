import type { ReactNode } from 'react';
import { DISPLAY_GRADE, RARITY } from '../../../game/content/rarity';
import type { DisplayGradeId, RarityId } from '../../../game/content/rarity';

const RARITY_WORD_GRADE: Readonly<Record<string, DisplayGradeId>> = {
  일반: 'common',
  '(일반)': 'common',
  희귀: 'rare',
  '(희귀)': 'rare',
  영웅: 'epic',
  '(영웅)': 'epic',
  전설: 'legendary',
  '(전설)': 'legendary',
  특수: 'special',
  '(특수)': 'special',
};

const RARITY_TEXT_RE = /(\((?:일반|희귀|영웅|전설|특수)\)|전설|영웅|희귀|특수|돌연변이|네임드|일반(?=\s*(?:등급|어종|생명의 기운)|과(?:\s|$|[,.])|,\s*(?:희귀|영웅|전설|특수|돌연변이|네임드)))/g;

/** 문장·구절 안의 등급 낱말(전설·영웅·희귀·특수 및 등급 맥락의 일반), (등급), 돌연변이·네임드를 공용 색으로 강조한다 */
export function HighlightRarityText({ text }: { text: string }) {
  const matches = [...text.matchAll(RARITY_TEXT_RE)];
  if (matches.length === 0) return <>{text}</>;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const m of matches) {
    const idx = m.index ?? 0;
    const word = m[0];
    if (idx > cursor) nodes.push(text.slice(cursor, idx));
    const grade = RARITY_WORD_GRADE[word];
    nodes.push(
      grade
        ? <span key={idx} data-rarity={grade} className="text-(--rarity-color)">{word}</span>
        : <span key={idx} className="text-epic">{word}</span>,
    );
    cursor = idx + word.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return <>{nodes}</>;
}

const GRADE_LABEL_RE = /^(.+)\((일반|희귀|영웅|전설|특수)\)$/;

/** `이름(등급)` 문자열을 GradeName으로, 그 밖의 문자열은 HighlightRarityText로 바꾼다 */
export function FormatGradeLabel({ text }: { text: string }) {
  const m = GRADE_LABEL_RE.exec(text);
  if (!m) return <HighlightRarityText text={text} />;
  return <GradeName name={m[1]} grade={RARITY_WORD_GRADE[m[2]]} />;
}

// 등급 텍스트 — data-rarity 속성으로 색 지정 (전역 스타일 [data-rarity] → --rarity-color)
export function RarityText({ rarity }: { rarity: RarityId }) {
  return <span data-rarity={rarity} className="text-(--rarity-color)">{RARITY[rarity].name}</span>;
}

/** 이름과 등급의 기본 꼴 `이름(등급)` — 이름은 본문색, 괄호와 그 안의 등급 낱말만 등급색, 굵기는 보통이다.
 *  등급이 없는 대상(grade가 null)은 이름만 쓴다. emphasized는 고른 대상의 강조(굵은 골드)이며 이름에만 걸리고 괄호의 등급색은 그대로다 */
export function GradeName({ name, grade, emphasized = false }: { name: string; grade: DisplayGradeId | null; emphasized?: boolean }) {
  const nameEl = <span className={emphasized ? 'font-bold text-gold' : undefined}>{name}</span>;
  if (grade === null) return nameEl;
  return (
    <span>
      {nameEl}<span data-rarity={grade} className="font-normal text-(--rarity-color)">({DISPLAY_GRADE[grade].name})</span>
    </span>
  );
}

// 미획득 도감 카드용 등급 점 — 네모 점
export function RarityDot({ rarity }: { rarity: RarityId }) {
  return (
    <span
      data-rarity={rarity}
      className="inline-block size-1.5 mr-1 align-middle bg-(--rarity-color)"
    />
  );
}

/** 등급 테두리 카드 — 도감 격자·가방 카드뷰·지역 탭 수역 카드가 공유한다.
    같은 문자열을 복붙하면 한쪽만 고쳐지며 갈라진다.
    테두리가 등급의 유일한 표시라 선명해야 한다: 1px + 알파 70%.
    **크기(패딩·글자)는 여기 없다** — 화면마다 카드가 커야 할 이유가 달라 쓰는 쪽이 정한다.
    쓰는 쪽이 `data-rarity`를 걸어야 --rarity-color가 잡힌다. */
export const RARITY_CARD =
  'pf-notch bg-(--inset-base) border text-center leading-normal'
  + ' shadow-[inset_1px_1px_0_var(--bevel-hi),inset_-1px_-1px_0_var(--bevel-lo)]'
  + ' border-[color-mix(in_srgb,var(--rarity-color)_70%,transparent)]'
  + ' transition-[translate,background-color] duration-[120ms] ease-out'
  + ' hover:-translate-y-0.5 hover:bg-surface-2';

/** 미획득·미보유 카드 어두운 바닥 — 등급 카드와 짝이라 같은 모듈에 둔다. 네 화면이 같은 값을 쓴다 */
export const DIM_CARD = 'bg-bg border-[color-mix(in_srgb,var(--rarity-color)_45%,var(--c-line))] text-text-dim';
