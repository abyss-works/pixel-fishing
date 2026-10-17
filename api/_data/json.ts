// 저장 모듈 공용 보조 — raw SQL에 값을 넣는 형식과 JSON 집계 결과를 읽는 형식.
import { sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

/** 행 목록을 JSON 매개변수 하나로 넘긴다. SQL에서는 json_to_recordset으로 펼친다 */
export const jsonParam = (rows: readonly unknown[]): SQL => sql`${JSON.stringify(rows)}::json`;

/** raw SQL의 text 배열 값. sql 템플릿은 JS 배열을 매개변수 목록으로 펼치므로 배열 생성자로 묶는다 */
export function textArray(values: readonly string[]): SQL {
  return values.length === 0
    ? sql`array[]::text[]`
    : sql`array[${sql.join(values.map(value => sql`${value}`), sql`, `)}]::text[]`;
}

/** uuid 배열 값 */
export const uuidArray = (values: readonly string[]): SQL => sql`${textArray(values)}::uuid[]`;

/** 시각 값. ISO 문자열을 timestamptz로 보낸다(드라이버의 Date 직렬화와 프로세스 시간대에 기대지 않는다) */
export const at = (iso: string): SQL => sql`${iso}::timestamptz`;
