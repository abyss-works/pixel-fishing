export type MaybePromise<T> = T | Promise<T>;

/** 동기 값과 비동기 결과에 같은 후처리를 적용한다. */
export function when<T, R>(value: MaybePromise<T>, fn: (value: T) => R): MaybePromise<R> {
  return value instanceof Promise ? value.then(fn) : fn(value);
}
