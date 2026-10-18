// 편지(letters) 쓰기 소유 모듈 — letters는 콜드 아카이브가 지우지 않는 편지 본문의 정본이다.
// 사용자 단위로 지우는 경로는 계정 정리뿐이다.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { GameEvent } from '../../src/game/rules/actions.js';
import { at, textArray } from './json.js';

/** letter 이벤트의 본문을 events와 같은 created_at으로 남긴다(복사 INSERT의 중복 제거가 이 시각으로 성립한다) */
export function letterFragment(guard: SQL, uid: string, events: readonly GameEvent[], createdAtISO: string): SQL | null {
  const texts = events.flatMap(e => {
    if (e.type !== 'letter') return [];
    const text = (e.payload as { text?: unknown }).text;
    return typeof text === 'string' ? [text] : [];
  });
  if (texts.length === 0) return null;
  return sql`insert into public.letters (user_id, text, created_at)
    select ${uid}, t, ${at(createdAtISO)} from unnest(${textArray(texts)}) as t where ${guard}`;
}
