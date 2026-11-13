// 등급 괄호 표기 — 등급이 있는 대상(아이템, 유물, 생명의 기운)의 화면 이름은 이름 뒤에 등급을 괄호로 붙인다.
// 물고기는 이 표기를 쓰지 않는다. 기능과 표현이 같은 조립을 쓰도록 이 한 곳에서만 만든다.

/** 이름 뒤에 등급 이름을 괄호로 붙인 꼴 */
export const gradeName = (name: string, gradeLabel: string): string => `${name}(${gradeLabel})`;
