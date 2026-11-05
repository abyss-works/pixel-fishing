import { ARTIFACTS } from '../../../game/content/artifacts';
import type { Artifact } from '../../../game/content/artifacts';
import { boatNameOf } from '../../../game/content/boats';
import { FISH } from '../../../game/content/fish';
import { ZONE_IDS, topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { MAX_BOAT } from '../../../game/rules/logic';
import { powerOfLevel } from '../../../game/rules/stats';
import type { PublicProfile } from '../../../platform/api';

// 플레이어 정보 화면 데이터 — 공개 프로필을 스탯창 요약처럼 보일 값으로 바꾼다.
// 도감은 일반 폼 기준이고, 콘텐츠에 없는 어종·유물 id(삭제된 콘텐츠)는 세지 않는다.

export interface ProfileDexZone { zone: ZoneId; name: string; found: number; total: number; complete: boolean }
/** 유물 칸 — 가지지 않은 유물은 이름과 등급을 밝히지 않고 나오는 해역만 보인다 */
export interface ProfileArtifactSlot {
  id: string; zone: string; owned: boolean; name: string | null; grade: Artifact['grade'] | null;
}

export interface ProfileView {
  fame: number;
  dex: { found: number; total: number; zones: ProfileDexZone[] };
  boat: { tier: number; name: string; max: number };
  rod: { level: number; power: number };
  artifacts: { owned: number; slots: ProfileArtifactSlot[] };
}

export function selectProfileView(profile: PublicProfile): ProfileView {
  const caught = new Set(profile.dexFish);
  const owned = new Set(profile.artifacts);
  const zones = ZONE_IDS.map(zone => {
    const fish = FISH.filter(f => topZoneOfSpot(f.spot) === zone);
    const found = fish.filter(f => caught.has(f.id)).length;
    return { zone, name: zoneById(zone)?.shortName ?? zone, found, total: fish.length, complete: found === fish.length };
  }).filter(row => row.total > 0);
  const slots = ARTIFACTS.map(a => {
    const has = owned.has(a.id);
    return { id: a.id, zone: zoneById(a.zone)?.shortName ?? a.zone, owned: has, name: has ? a.name : null, grade: has ? a.grade : null };
  });
  return {
    fame: profile.fame,
    dex: { found: zones.reduce((n, z) => n + z.found, 0), total: FISH.length, zones },
    boat: { tier: profile.boat, name: boatNameOf(profile.boat), max: MAX_BOAT },
    rod: { level: profile.rod, power: powerOfLevel(profile.rod) },
    artifacts: { owned: slots.filter(s => s.owned).length, slots },
  };
}
