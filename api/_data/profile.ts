// 프로필(profiles) 쓰기 소유 모듈 — 첫 액션의 게스트명 보장과 닉네임 변경.
import { sql } from 'drizzle-orm';
import { achievementById } from '../../src/game/content/achievements.js';
import { ARTIFACT_MAX_LEVEL, artifactById, artifactHasLevel } from '../../src/game/content/artifacts.js';
import { isKnownLocation } from '../../src/game/content/places.js';
import type { LocationRef } from '../../src/game/content/places.js';
import { hatById, safeLook } from '../../src/game/content/wardrobe.js';
import type { Look } from '../../src/game/content/wardrobe.js';
import type { Executor } from '../_db/client.js';
import { at } from './json.js';

/**
 * 게스트명 보장 — 후보 이름을 차례로 넣어 본다. 이름이 겹치거나 행이 이미 있으면 다음 후보로 넘어간다.
 * 후보는 호출자가 attempt 번호로 만든다(난수 소비 순서를 호출자가 정한다). 끝내 못 넣으면 false.
 */
export async function ensureProfile(db: Executor, uid: string, candidate: (attempt: number) => string,
  attempts = 20): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    const { rows } = await db.execute(sql`insert into public.profiles (user_id, nickname)
      values (${uid}, ${candidate(i)}) on conflict do nothing returning user_id`);
    if (rows.length > 0) return true;
  }
  return false;
}

export async function profileExists(db: Executor, uid: string): Promise<boolean> {
  const { rows } = await db.execute(sql`select 1 from public.profiles where user_id = ${uid}`);
  return rows.length > 0;
}

/** 다른 사용자가 같은 이름(대소문자 무시)을 쓰는가 */
export async function nicknameTaken(db: Executor, uid: string, nickname: string): Promise<boolean> {
  const { rows } = await db.execute<{ taken: boolean }>(sql`select exists (select 1 from public.profiles
    where user_id <> ${uid} and lower(nickname) = lower(${nickname})) as taken`);
  return rows[0].taken;
}

export async function setNickname(db: Executor, uid: string, nickname: string, nowISO: string): Promise<void> {
  await db.execute(sql`insert into public.profiles (user_id, nickname, updated_at)
    values (${uid}, ${nickname}, ${at(nowISO)})
    on conflict (user_id) do update set nickname = excluded.nickname, updated_at = excluded.updated_at`);
}

/** 계정 정리에서 사용자의 프로필 행을 지운다 */
export async function deleteUserProfile(db: Executor, uid: string): Promise<void> {
  await db.execute(sql`delete from public.profiles where user_id = ${uid}`);
}

/** 실시간 채널에 보일 이름과 배. 프로필이 없으면 이름은 null, 저장 상태가 없으면 배는 0이다 */
export async function liveIdentity(db: Executor, uid: string): Promise<{ nick: string | null; boat: number }> {
  const { rows } = await db.execute<{ nick: string | null; boat: number | null }>(sql`select
      (select nickname from public.profiles where user_id = ${uid}) as nick,
      (select boat from public.saves_current where user_id = ${uid}) as boat`);
  return { nick: rows[0]?.nick ?? null, boat: rows[0]?.boat ?? 0 };
}

/**
 * 다른 사용자에게 보이는 공개 프로필. dexFish는 일반 폼, dexVariant는 돌연변이 폼으로 한 번이라도 낚은 어종 id,
 * artifacts는 가진 유물 id, achievements는 보상 수령 완료(claimed) id만 담는다.
 * 골드·가방·순위·천장·미수령 업적(claimable)·원시 업적 카운터는 주지 않는다.
 */
export interface PublicProfile {
  nickname: string | null;
  boat: number;
  rod: number;
  fame: number;
  dexFish: string[];
  dexVariant: string[];
  artifacts: string[];
  artifactLevels: Record<string, number>;
  hats: string[];
  look: Look | null;
  achievements: string[];
  location: LocationRef | null;
  lastPos: { region: string; x: number; y: number } | null;
  account: boolean;
}

function sanitizeArtifactLevels(raw: unknown, owned: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    const art = artifactById(id);
    if (!art || !artifactHasLevel(art) || !owned.includes(id)) continue;
    if (typeof val !== 'number' || !Number.isInteger(val)) continue;
    const level = Math.min(ARTIFACT_MAX_LEVEL, Math.max(1, val));
    if (level > 1) out[id] = level;
  }
  return out;
}

function sanitizeHats(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const h of raw) {
    if (typeof h === 'string' && !seen.has(h) && hatById(h) !== undefined) {
      seen.add(h);
      out.push(h);
    }
  }
  return out;
}

export function sanitizeClaimedAchievements(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([id, status]) => status === 'claimed' && achievementById(id) !== undefined)
    .map(([id]) => id)
    .sort();
}

function sanitizeLocation(raw: unknown): LocationRef | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const loc = raw as Record<string, unknown>;
  if ((loc.kind === 'base' || loc.kind === 'region') && typeof loc.id === 'string'
      && isKnownLocation({ kind: loc.kind, id: loc.id })) {
    return { kind: loc.kind, id: loc.id } as LocationRef;
  }
  return null;
}

/** 공개 프로필을 읽는다. 사용자가 없으면 null. 프로필이 없으면 이름은 null, 저장 상태가 없으면 배·명성은 0, 낚싯대는 1이다 */
export async function publicProfile(db: Executor, uid: string): Promise<PublicProfile | null> {
  const { rows } = await db.execute<{
    nickname: string | null;
    boat: number | null;
    rod: number | null;
    fame: string | number | null;
    artifacts: unknown;
    artifact_levels: unknown;
    hats: unknown;
    look: unknown;
    achievements: unknown;
    location: unknown;
    dex_fish: string[];
    dex_variant: string[];
    last_region: string | null;
    last_x: string | number | null;
    last_y: string | number | null;
    account: boolean;
  }>(sql`select
      p.nickname, c.boat, c.rod, c.fame,
      c.data->'artifacts' as artifacts,
      c.data->'artifactLevels' as artifact_levels,
      c.data->'hats' as hats,
      c.data->'look' as look,
      c.data->'achievements' as achievements,
      c.data->'location' as location,
      not u.is_anonymous as account,
      array(select r.fish_id from public.records r
        where r.user_id = u.id and r.form = 'normal' and r.count > 0 order by r.fish_id) as dex_fish,
      array(select r.fish_id from public.records r
        where r.user_id = u.id and r.form = 'variant' and r.count > 0 order by r.fish_id) as dex_variant,
      lp.region as last_region, lp.x as last_x, lp.y as last_y
    from auth.users u
    left join public.profiles p on p.user_id = u.id
    left join public.saves_current c on c.user_id = u.id
    left join public.last_positions lp on lp.user_id = u.id
    where u.id = ${uid}`);
  const r = rows[0];
  if (!r) return null;
  const artifacts = Array.isArray(r.artifacts) ? r.artifacts.filter((a): a is string => typeof a === 'string') : [];
  const lastX = r.last_x !== null && r.last_x !== undefined ? Number(r.last_x) : Number.NaN;
  const lastY = r.last_y !== null && r.last_y !== undefined ? Number(r.last_y) : Number.NaN;
  const lastPos = typeof r.last_region === 'string' && Number.isFinite(lastX) && Number.isFinite(lastY)
    ? { region: r.last_region, x: lastX, y: lastY } : null;
  return {
    nickname: r.nickname,
    boat: r.boat ?? 0,
    rod: r.rod ?? 1,
    fame: Number(r.fame ?? 0),
    dexFish: r.dex_fish,
    dexVariant: r.dex_variant,
    artifacts,
    artifactLevels: sanitizeArtifactLevels(r.artifact_levels, artifacts),
    hats: sanitizeHats(r.hats),
    look: r.look === null || r.look === undefined ? null : safeLook(r.look),
    achievements: sanitizeClaimedAchievements(r.achievements),
    location: sanitizeLocation(r.location),
    lastPos,
    account: r.account,
  };
}
