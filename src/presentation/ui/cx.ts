// 조건부 클래스 결합 — clsx 의존성 대신 이거 하나 (falsy를 걸러 공백으로 잇는다)
export const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ');
