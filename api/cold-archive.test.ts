// 콜드 아카이브 코어 — 순수 선정 로직, 컷오프 계산, 스테이징 스트림과 임시 파일 정리.
// DB·R2를 포함한 전체 흐름은 실제 Postgres 특성 테스트(크론 핸들러)가 맡는다.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Executor } from './_db/client.js';

const dbMocks = vi.hoisted(() => ({
  countEventsBefore: vi.fn(async () => 0),
  eventsBefore: vi.fn(async (): Promise<{ id: number; counted: boolean }[]> => []),
  deleteEventsUpTo: vi.fn(async () => 0),
  savesMetaPage: vi.fn(async (): Promise<{ id: number; user_id: string; updated_at: string }[]> => []),
  savesByIds: vi.fn(async (): Promise<unknown[]> => []),
  deleteSavesByIds: vi.fn(async () => {}),
}));

vi.mock('./_data/telemetry.js', () => ({
  countEventsBefore: dbMocks.countEventsBefore,
  eventsBefore: dbMocks.eventsBefore,
  deleteEventsUpTo: dbMocks.deleteEventsUpTo,
}));

vi.mock('./_data/save.js', () => ({
  savesMetaPage: dbMocks.savesMetaPage,
  savesByIds: dbMocks.savesByIds,
  deleteSavesByIds: dbMocks.deleteSavesByIds,
}));

import { cutoffIso, runArchive, selectSavesVictims } from './cold-archive.js';
import type { ColdArchiveEnv } from './cold-archive.js';

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

describe('selectSavesVictims — 유저별 최신 keep개 초과 + 컷오프 이전만', () => {
  // 스캔 계약 순서: user_id asc, updated_at desc
  const rows = [
    { id: 10, user_id: 'a', updated_at: '2026-10-06T00:00:00Z' },
    { id: 9, user_id: 'a', updated_at: '2026-10-01T00:00:00Z' },
    { id: 8, user_id: 'a', updated_at: '2026-09-01T00:00:00Z' },
    { id: 7, user_id: 'b', updated_at: '2026-09-01T00:00:00Z' }, // b의 유일 행 — keep 1로 보존
  ];
  it('keep=1: 최신 1행은 날짜 무관 보존, 나머지는 컷오프 이전만', () => {
    expect(selectSavesVictims(rows, 1, '2026-10-04T00:00:00Z')).toEqual([9, 8]);
  });
  it('keep=2면 2번째 행까지 보존', () => {
    expect(selectSavesVictims(rows, 2, '2026-10-04T00:00:00Z')).toEqual([8]);
  });
});

describe('cutoffIso', () => {
  it('now − days', () => {
    expect(cutoffIso(7, new Date('2026-10-07T12:00:00Z'))).toBe('2026-09-30T12:00:00.000Z');
  });
});

describe('runArchive 임시 파일·스트림 정리', () => {
  let tmpDir: string | null = null;
  const origFetch = globalThis.fetch;

  const makeEnv = (dir: string): ColdArchiveEnv => ({
    db: {} as Executor,
    r2AccountId: 'acct',
    r2Bucket: 'bucket',
    r2AccessKeyId: 'ak',
    r2SecretAccessKey: 'sk',
    r2Prefix: 'test',
    cutoffDays: 7,
    tmpDir: dir,
  });

  const mockR2Ok = () => {
    const sizes = new Map<string, number>();
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === 'PUT') {
        const buf = init.body as Buffer;
        sizes.set(u, buf.length);
        return new Response('', { status: 200 });
      }
      if (init?.method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-length': String(sizes.get(u) ?? -1) } });
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;
  };

  afterEach(async () => {
    globalThis.fetch = origFetch;
    vi.clearAllMocks();
    dbMocks.countEventsBefore.mockResolvedValue(0);
    dbMocks.eventsBefore.mockResolvedValue([]);
    dbMocks.deleteEventsUpTo.mockResolvedValue(0);
    dbMocks.savesMetaPage.mockResolvedValue([]);
    dbMocks.savesByIds.mockResolvedValue([]);
    dbMocks.deleteSavesByIds.mockResolvedValue(undefined);
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it('events 0건 경로에서 연 스트림을 닫고 tmpDir에 임시 파일을 남기지 않는다', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-cold-0-'));
    const res = await runArchive(makeEnv(tmpDir), new Date('2026-10-07T00:00:00Z'));
    expect(res.events).toEqual({ rows: 0, r2Key: null });
    expect(await listFiles(tmpDir)).toEqual([]);
  });

  it('성공 경로에서 events와 saves의 임시·최종 스테이징 파일을 모두 삭제하고 events JSONL에 counted를 보존한다', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-cold-ok-'));
    const putObjects = new Map<string, Buffer>();
    mockR2Ok();
    const r2Fetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'PUT') putObjects.set(String(url), Buffer.from(init.body as Uint8Array));
      return r2Fetch(url, init);
    }) as typeof fetch;
    dbMocks.countEventsBefore.mockResolvedValue(1);
    dbMocks.eventsBefore
      .mockResolvedValueOnce([{ id: 101, counted: true }])
      .mockResolvedValueOnce([]);
    dbMocks.deleteEventsUpTo.mockResolvedValue(1);
    dbMocks.savesMetaPage.mockResolvedValueOnce([
      { id: 2, user_id: 'u1', updated_at: '2026-10-06T00:00:00Z' },
      { id: 1, user_id: 'u1', updated_at: '2026-09-01T00:00:00Z' },
    ]);
    dbMocks.savesByIds.mockResolvedValueOnce([{ id: 1, user_id: 'u1', state: {} }]);

    const res = await runArchive(makeEnv(tmpDir), new Date('2026-10-07T00:00:00Z'));
    expect(res.events.rows).toBe(1);
    expect(res.saves.rows).toBe(1);
    expect(await listFiles(tmpDir)).toEqual([]);
    const eventGz = putObjects.get(`https://acct.r2.cloudflarestorage.com/bucket/${res.events.r2Key}`)!;
    const lines = gunzipSync(eventGz).toString('utf8').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>);
    expect(lines).toEqual([{ id: 101, counted: true }]);
  });

  it('업로드 실패 경로에서도 스테이징 파일을 남기지 않는다', async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-cold-fail-'));
    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch;
    dbMocks.countEventsBefore.mockResolvedValue(1);
    dbMocks.eventsBefore
      .mockResolvedValueOnce([{ id: 5, counted: false }])
      .mockResolvedValueOnce([]);

    await expect(runArchive(makeEnv(tmpDir), new Date('2026-10-07T00:00:00Z'))).rejects.toThrow();
    expect(await listFiles(tmpDir)).toEqual([]);
  });
});
