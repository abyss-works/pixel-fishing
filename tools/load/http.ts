// 모든 요청의 진입점. 리다이렉트를 따라가지 않는다. 대상 서버가 다른 주소(운영 도메인 포함)로 넘겨도 요청이 거기까지 가지 않게 한다.

export function guardedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, redirect: 'error' });
}
