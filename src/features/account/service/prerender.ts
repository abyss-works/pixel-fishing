type PrerenderingDocument = Document & { prerendering?: boolean };

/** 문서가 브라우저 프리렌더 상태인지 SSR 안전하게 판별한다 */
export function isDocumentPrerendering(): boolean {
  return typeof document !== 'undefined' && Boolean((document as PrerenderingDocument).prerendering);
}

/** 프리렌더 중이면 페이지 활성화(prerenderingchange)까지 대기하고, 일반 상태나 중단 신호에는 즉시 resolve한다 */
export function waitUntilActivated(signal?: AbortSignal): Promise<void> {
  if (!isDocumentPrerendering() || signal?.aborted) return Promise.resolve();
  const doc = document;
  return new Promise<void>(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      doc.removeEventListener('prerenderingchange', onChange);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const onChange = () => { finish(); };
    const onAbort = () => { finish(); };
    doc.addEventListener('prerenderingchange', onChange, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
