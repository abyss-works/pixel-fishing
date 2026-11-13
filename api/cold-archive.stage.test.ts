// 콜드 아카이브가 실패할 때 실패한 단계가 오류에 표시되는지 검사한다. 저장 모듈과 R2 요청은 모킹한다.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./_data/save.js', () => ({ deleteSavesByIds: vi.fn(), savesByIds: vi.fn(), savesMetaPage: vi.fn() }));
vi.mock('./_data/telemetry.js', () => ({ countEventsBefore: vi.fn(), deleteEventsUpTo: vi.fn(), eventsBefore: vi.fn() }));
import { runArchive } from './cold-archive.js';
import type { ColdArchiveEnv } from './cold-archive.js';
import { failureStage } from './cronFailure.js';
import { deleteSavesByIds, savesByIds, savesMetaPage } from './_data/save.js';
import { countEventsBefore, deleteEventsUpTo, eventsBefore } from './_data/telemetry.js';

const NOW = new Date('2030-01-31T00:00:00.000Z');
let tmpDir: string;

const envOf = (): ColdArchiveEnv => ({
  db: {} as never, r2AccountId: 'acct', r2Bucket: 'bucket', r2AccessKeyId: 'id', r2SecretAccessKey: 'secret',
  r2Prefix: 'p', cutoffDays: 7, tmpDir,
});

/** 오래된 저장 행 하나가 아카이브 대상이 되고 events는 비어 있는 상태 */
function saveVictim() {
  vi.mocked(countEventsBefore).mockResolvedValue(0);
  vi.mocked(eventsBefore).mockResolvedValue([]);
  vi.mocked(savesMetaPage).mockResolvedValue([
    { id: 1, user_id: 'u', updated_at: '2030-01-01T00:00:00.000Z' },
    { id: 2, user_id: 'u', updated_at: '2029-12-01T00:00:00.000Z' },
  ]);
  vi.mocked(savesByIds).mockResolvedValue([{ id: 2 }] as never);
}

function r2Responds(status: number) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(status === 200 ? '' : 'denied', { status, headers: { 'content-length': '999' } })));
}

async function stageOf(run: () => Promise<unknown>): Promise<string | undefined> {
  const error = await run().then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  return failureStage(error);
}

describe('runArchive 실패 단계 표시', () => {
  beforeEach(() => { tmpDir = mkdtempSync(path.join(tmpdir(), 'archive-stage-')); });
  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.mocked(savesMetaPage).mockReset(); vi.mocked(savesByIds).mockReset(); vi.mocked(deleteSavesByIds).mockReset();
    vi.mocked(countEventsBefore).mockReset(); vi.mocked(eventsBefore).mockReset(); vi.mocked(deleteEventsUpTo).mockReset();
    await new Promise(resolve => setTimeout(resolve, 50));   // 임시 파일 열기가 끝난 뒤에 지운다
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('events 조회가 실패하면 events-scan이다', async () => {
    vi.mocked(countEventsBefore).mockRejectedValue(new Error('db down'));
    expect(await stageOf(() => runArchive(envOf(), NOW))).toBe('events-scan');
  });

  it('events 업로드가 실패하면 events-upload이고 지우지 않는다', async () => {
    vi.mocked(countEventsBefore).mockResolvedValue(1);
    vi.mocked(eventsBefore).mockResolvedValueOnce([{ id: 1 }] as never).mockResolvedValue([]);
    r2Responds(403);
    expect(await stageOf(() => runArchive(envOf(), NOW))).toBe('events-upload');
    expect(deleteEventsUpTo).not.toHaveBeenCalled();
  });

  it('saves 메타 조회가 실패하면 saves-scan이다', async () => {
    saveVictim();
    vi.mocked(savesMetaPage).mockRejectedValue(new Error('db down'));
    expect(await stageOf(() => runArchive(envOf(), NOW))).toBe('saves-scan');
  });

  it('saves 본문 조회가 끝내 실패하면 saves-fetch이다', async () => {
    saveVictim();
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    vi.mocked(savesByIds).mockRejectedValue(new Error('timeout'));
    let finished = false;
    const outcome = stageOf(() => runArchive(envOf(), NOW)).finally(() => { finished = true; });
    while (!finished) {   // 재시도 대기가 실제 파일 작업 뒤에 예약되므로 끝날 때까지 시간을 나눠 흘린다
      await vi.advanceTimersByTimeAsync(10_000);
      await new Promise(resolve => setImmediate(resolve));
    }
    expect(await outcome).toBe('saves-fetch');
  });

  it('saves 업로드가 실패하면 saves-upload이고 지우지 않는다', async () => {
    saveVictim();
    r2Responds(403);
    expect(await stageOf(() => runArchive(envOf(), NOW))).toBe('saves-upload');
    expect(deleteSavesByIds).not.toHaveBeenCalled();
  });

  it('saves 삭제가 실패하면 saves-delete이다', async () => {
    saveVictim();
    vi.mocked(deleteSavesByIds).mockRejectedValue(new Error('delete failed'));
    // R2를 흉내 낸다. 올린 본문의 길이를 HEAD로, 본문을 GET으로 그대로 돌려준다
    const putBodies: Buffer[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { method: string; body?: Buffer }) => {
      if (init.method === 'PUT') { putBodies.push(init.body as Buffer); return new Response('', { status: 200 }); }
      const body = putBodies[putBodies.length - 1];
      return new Response(init.method === 'GET' ? new Uint8Array(body) : null, { status: 200, headers: { 'content-length': String(body.length) } });
    }));
    expect(await stageOf(() => runArchive(envOf(), NOW))).toBe('saves-delete');
  });

  it('임시 파일을 쓸 수 없으면 events-stage-file이다(events가 먼저 실행된다)', async () => {
    saveVictim();
    expect(await stageOf(() => runArchive({ ...envOf(), tmpDir: path.join(tmpDir, 'blocked', '\0bad') }, NOW))).toBe('events-stage-file');
  });
});
