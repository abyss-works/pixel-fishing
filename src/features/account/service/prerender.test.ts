import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDocumentPrerendering, waitUntilActivated } from './prerender';

class FakeDocument extends EventTarget {
  prerendering?: boolean;
  addCalls = 0;
  removeCalls = 0;

  constructor(prerendering?: boolean) {
    super();
    this.prerendering = prerendering;
  }

  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.addCalls++;
    super.addEventListener(type, listener, options);
  }

  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void {
    this.removeCalls++;
    super.removeEventListener(type, listener, options);
  }
}

describe('프리렌더 판정 및 활성화 대기', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('document가 없는 SSR 환경에서도 안전하게 false를 반환하고 즉시 resolve한다', async () => {
    vi.stubGlobal('document', undefined);
    expect(isDocumentPrerendering()).toBe(false);
    await expect(waitUntilActivated()).resolves.toBeUndefined();
  });

  it('일반 문서 상태에서는 false를 반환하고 리스너 등록 없이 즉시 resolve한다', async () => {
    const doc = new FakeDocument(false);
    vi.stubGlobal('document', doc);

    expect(isDocumentPrerendering()).toBe(false);
    await expect(waitUntilActivated()).resolves.toBeUndefined();
    expect(doc.addCalls).toBe(0);
  });

  it('프리렌더 중에는 prerenderingchange 발화 전까지 대기하고, 발화 시 1회 resolve하며 signal 리스너를 정리한다', async () => {
    const doc = new FakeDocument(true);
    vi.stubGlobal('document', doc);
    const controller = new AbortController();
    const removeSignalSpy = vi.spyOn(controller.signal, 'removeEventListener');

    expect(isDocumentPrerendering()).toBe(true);

    let resolved = false;
    const waiting = waitUntilActivated(controller.signal).then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(doc.addCalls).toBe(1);

    doc.prerendering = false;
    doc.dispatchEvent(new Event('prerenderingchange'));
    await waiting;

    expect(resolved).toBe(true);
    expect(removeSignalSpy).toHaveBeenCalledTimes(1);
  });

  it('이미 중단된 signal이 주어지면 프리렌더 중이어도 리스너를 붙이지 않고 즉시 resolve한다', async () => {
    const doc = new FakeDocument(true);
    vi.stubGlobal('document', doc);
    const controller = new AbortController();
    controller.abort();

    await expect(waitUntilActivated(controller.signal)).resolves.toBeUndefined();
    expect(doc.addCalls).toBe(0);
  });

  it('대기 중 signal이 abort되면 즉시 resolve하고 prerenderingchange 리스너를 제거한다', async () => {
    const doc = new FakeDocument(true);
    vi.stubGlobal('document', doc);
    const controller = new AbortController();

    let resolved = false;
    const waiting = waitUntilActivated(controller.signal).then(() => { resolved = true; });
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(doc.addCalls).toBe(1);

    controller.abort();
    await waiting;

    expect(resolved).toBe(true);
    expect(doc.removeCalls).toBe(1);

    doc.prerendering = false;
    doc.dispatchEvent(new Event('prerenderingchange'));
  });
});
