// 콜드 아카이브 코어 — Postgres → Cloudflare R2(S3 SigV4). 표 읽기·지우기는 표의 소유 저장 모듈이 한다.
// 이식 원본: 운영 절차 (2026-09-10 일회성 실행으로 검증된 로직).
// 삭제는 업로드 검증(HEAD 바이트, 실패 시 GET 해시)을 통과한 뒤에만 수행한다.
// CLI 요소(argv·.env 로더·process.exit)를 제거하고 값을 인자로 받는다 — cron 핸들러가 유일 소비처.
import { createHash, createHmac } from 'node:crypto';
import { createGzip } from 'node:zlib';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { Executor } from './_db/client.js';
import { deleteSavesByIds, savesByIds, savesMetaPage } from './_data/save.js';
import { countEventsBefore, deleteEventsUpTo, eventsBefore } from './_data/telemetry.js';

export interface ColdArchiveEnv {
  db: Executor;
  r2AccountId: string;
  r2Bucket: string;
  r2AccessKeyId: string;
  r2SecretAccessKey: string;
  r2Prefix: string;
  cutoffDays: number;
  tmpDir: string;
}

export interface TableResult { rows: number; r2Key: string | null }
export interface ArchiveSummary { events: TableResult; saves: TableResult; cutoff: string }

const BATCH = 5000;            // 메타 스캔 배치
const DEL_CHUNK = 200;         // saves 삭제 id 청크
const SAVES_FETCH_CHUNK = 50;  // 본문(블롭 ~57KB/행) 조회 청크
const SAVES_KEEP = 1;          // 유저별 최신 K행 보존 (스펙 1절)

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const sha256hex = (buf: Buffer | string) => createHash('sha256').update(buf).digest('hex');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const toJsonl = (rows: unknown[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n';

/** 컷오프 = now − days (ISO) */
export function cutoffIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export interface SaveMetaRow { id: number; user_id: string; updated_at: string }

/** 유저별 최신 keep개 초과 + 컷오프 이전 행의 id. 입력은 (user_id asc, updated_at desc) 순서 계약. */
export function selectSavesVictims(rows: SaveMetaRow[], keep: number, cutoff: string): number[] {
  const seen = new Map<string, number>();
  const victims: number[] = [];
  for (const r of rows) {
    const k = (seen.get(r.user_id) ?? 0) + 1;
    seen.set(r.user_id, k);
    if (k > keep && r.updated_at < cutoff) victims.push(r.id);
  }
  return victims;
}

/** 본문 조회 재시도 — 큰 블롭 묶음의 일시 실패를 흡수한다 */
async function withRetry<T>(run: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await run(); }
    catch (e) { last = e; console.log(`retry ${i + 1}/${tries}`); await sleep(2000 * (i + 1)); }
  }
  throw last;
}

// ---------- R2 (S3 SigV4, 의존성 0) ----------
async function s3req(env: ColdArchiveEnv, method: string, key: string, bodyBuf?: Buffer, contentType?: string) {
  const host = `${env.r2AccountId}.r2.cloudflarestorage.com`;
  const uri = `/${env.r2Bucket}/${key}`;
  const amz = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const day = amz.slice(0, 8);
  const payloadHash = sha256hex(bodyBuf ?? Buffer.alloc(0));
  const headers: Record<string, string> = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz };
  if (contentType) headers['content-type'] = contentType;
  const signed = Object.keys(headers).sort();
  const canonical = [method, uri, '', ...signed.map(k => `${k}:${headers[k]}`), '', signed.join(';'), payloadHash].join('\n');
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256hex(canonical)].join('\n');
  const h = (k: Buffer | string, d: string) => createHmac('sha256', k).update(d).digest();
  const sig = h(h(h(h('AWS4' + env.r2SecretAccessKey, day), 'auto'), 's3'), 'aws4_request');
  const signature = createHmac('sha256', sig).update(toSign).digest('hex');
  return fetch(`https://${host}${uri}`, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.r2AccessKeyId}/${scope}, SignedHeaders=${signed.join(';')}, Signature=${signature}`,
    },
    body: bodyBuf,
  });
}

async function r2get(env: ColdArchiveEnv, key: string): Promise<Buffer> {
  const res = await s3req(env, 'GET', key);
  if (!res.ok) throw new Error(`r2 GET ${key} → ${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

async function r2verify(env: ColdArchiveEnv, key: string, buf: Buffer): Promise<number> {
  for (let i = 0; i < 5; i++) {
    const head = await s3req(env, 'HEAD', key);
    const len = parseInt(head.headers.get('content-length') ?? '-1', 10);
    if (len === buf.length) return len;
    await sleep(500 * (i + 1));
  }
  const got = await r2get(env, key);
  if (sha256hex(got) !== sha256hex(buf)) throw new Error(`r2 verify failed ${key}: hash mismatch`);
  return got.length;
}

async function r2put(env: ColdArchiveEnv, key: string, buf: Buffer, contentType: string): Promise<number> {
  const res = await s3req(env, 'PUT', key, buf, contentType);
  if (!res.ok) throw new Error(`r2 PUT ${key} → ${res.status} ${await res.text()}`);
  return r2verify(env, key, buf);
}

// ---------- gzip 스트리밍 스테이저 (tmpDir 사용 — 메모리 적재 금지) ----------
async function openStager(tmpDir: string, key: string) {
  const file = path.join(tmpDir, key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const gz = createGzip({ level: 9 });
  const out = createWriteStream(file);
  gz.pipe(out);
  let raw = 0;
  return {
    file,
    write(rows: unknown[]) {
      const buf = Buffer.from(toJsonl(rows));
      raw += buf.length;
      gz.write(buf);
    },
    async finish(): Promise<{ raw: number; gz: Buffer }> {
      gz.end();
      await new Promise<void>((resolve, reject) => {
        out.on('finish', () => resolve());
        out.on('error', reject);
      });
      return { raw, gz: await fs.readFile(file) };
    },
  };
}

// ---------- events: 단일 패스(id 오름차순) → 스테이징 → 업로드 검증 → 범위 DELETE ----------
async function archiveEvents(env: ColdArchiveEnv, cutoff: string): Promise<TableResult> {
  const date = cutoff.slice(0, 10);
  const est = await countEventsBefore(env.db, cutoff);
  console.log(`events 대상 약 ${est} rows`);
  const tmpKey = `${env.r2Prefix}/events/created_lt_${date}/_tmp_${stamp()}.jsonl.gz`;
  const st = await openStager(env.tmpDir, tmpKey);
  let lastId = 0, minId: number | null = null, maxId = 0, n = 0;
  for (;;) {
    const data = await eventsBefore(env.db, cutoff, lastId, BATCH);
    if (data.length === 0) break;
    st.write(data);
    minId ??= Number(data[0].id);
    maxId = Number(data[data.length - 1].id);
    lastId = maxId;
    n += data.length;
  }
  if (n === 0) return { rows: 0, r2Key: null };
  const key = `${env.r2Prefix}/events/created_lt_${date}/${stamp()}_ids_${minId}-${maxId}_n${n}.jsonl.gz`;
  const { raw, gz } = await st.finish();
  const finalFile = path.join(env.tmpDir, key);
  await fs.mkdir(path.dirname(finalFile), { recursive: true });
  await fs.rename(st.file, finalFile);
  const manifest = {
    table: 'events', cutoff, rows: n, idMin: minId, idMax: maxId,
    bytesRaw: raw, bytesGzip: gz.length, sha256: sha256hex(gz), r2Key: key, at: new Date().toISOString(),
  };
  await r2put(env, key, gz, 'application/gzip');
  await r2put(env, key + '.manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
  const deleted = await deleteEventsUpTo(env.db, maxId, cutoff);
  if (deleted !== n) {
    console.log(`events delete ${deleted} != archived ${n} — R2에 전량 있으므로 유실 없음`);
  }
  return { rows: n, r2Key: key };
}

// ---------- saves: 메타 스캔 → 순위 선정 → 본문 청크 fetch → 업로드 검증 → id 청크 DELETE ----------
async function archiveSaves(env: ColdArchiveEnv, cutoff: string): Promise<TableResult> {
  const order: SaveMetaRow[] = [];
  let off = 0;
  for (;;) {
    const data = await savesMetaPage(env.db, BATCH, off);
    order.push(...data);
    off += data.length;
    if (data.length < BATCH) break;
  }
  const victims = selectSavesVictims(order, SAVES_KEEP, cutoff);
  console.log(`saves scanned ${order.length}, archive-target ${victims.length}`);
  if (victims.length === 0) return { rows: 0, r2Key: null };
  const key = `${env.r2Prefix}/saves/updated_lt_${cutoff.slice(0, 10)}_keep${SAVES_KEEP}/${stamp()}_n${victims.length}.jsonl.gz`;
  const st = await openStager(env.tmpDir, key);
  for (let i = 0; i < victims.length; i += SAVES_FETCH_CHUNK) {
    st.write(await withRetry(() => savesByIds(env.db, victims.slice(i, i + SAVES_FETCH_CHUNK))));
  }
  const { raw, gz } = await st.finish();
  const manifest = {
    table: 'saves', cutoff, keepPerUser: SAVES_KEEP, rows: victims.length,
    bytesRaw: raw, bytesGzip: gz.length, sha256: sha256hex(gz), r2Key: key, at: new Date().toISOString(),
  };
  await r2put(env, key, gz, 'application/gzip');
  await r2put(env, key + '.manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
  for (let i = 0; i < victims.length; i += DEL_CHUNK) {
    await deleteSavesByIds(env.db, victims.slice(i, i + DEL_CHUNK));
  }
  return { rows: victims.length, r2Key: key };
}

/** cron 진입점 — events → saves 순. 실패는 던진다(핸들러가 500+Sentry). */
export async function runArchive(env: ColdArchiveEnv, now = new Date()): Promise<ArchiveSummary> {
  const cutoff = cutoffIso(env.cutoffDays, now);
  console.log(`== cold archive (cutoff ${cutoff}, prefix ${env.r2Prefix}) ==`);
  const events = await archiveEvents(env, cutoff);
  const saves = await archiveSaves(env, cutoff);
  const summary: ArchiveSummary = { events, saves, cutoff };
  console.log('== summary ==', JSON.stringify(summary));
  return summary;
}
