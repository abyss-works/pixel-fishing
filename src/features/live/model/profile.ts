import { ACHIEVEMENTS, achievementById } from '../../../game/content/achievements';
import type { AchievementTab } from '../../../game/content/achievements';
import { ARTIFACT_MAX_LEVEL, ARTIFACTS, artifactHasLevel } from '../../../game/content/artifacts';
import type { Artifact } from '../../../game/content/artifacts';
import { boatNameOf } from '../../../game/content/boats';
import { FISH } from '../../../game/content/fish';
import type { BaseId } from '../../../game/content/places';
import { DEFAULT_LOOK, HATS } from '../../../game/content/wardrobe';
import type { HatSource, Look } from '../../../game/content/wardrobe';
import { ZONE_IDS, topZoneOfSpot, zoneById } from '../../../game/content/zones';
import type { ZoneId } from '../../../game/content/zones';
import { MAX_BOAT } from '../../../game/rules/logic';
import { powerOfLevel } from '../../../game/rules/stats';
import { zoneOf } from '../../../game/world/engine';
import { WORLD } from '../../../game/world/regions/world';
import type { PublicProfile } from '../../../platform/api';

// 플레이어 정보 화면 데이터 — 공개 프로필을 위치, 요약, 업적, 수집품, 해역별 도감 비교 값으로 바꾼다.
// 콘텐츠에 없는 어종·유물·모자·업적 id(삭제된 콘텐츠)는 세지 않는다.

const BASE_NAMES: Record<BaseId, string> = {
  home: '집',
  harbor: '부산항',
  manila: '마닐라항',
  colombo: '콜롬보항',
  toamasina: '투아마시나항',
  walvisbay: '월비스베이항',
  lisbon: '리스본항',
};

const ACHIEVEMENT_TABS: readonly { tab: AchievementTab; label: string }[] = [
  { tab: 'progress', label: '진행' },
  { tab: 'cosmetic', label: '치장' },
];

export interface ProfileDexZone {
  zone: ZoneId;
  name: string;
  found: number;
  variantFound: number;
  total: number;
  complete: boolean;
  variantComplete: boolean;
}

/** 유물 칸 — 가지지 않은 유물은 이름·등급·레벨을 밝히지 않고 나오는 해역만 보인다 */
export interface ProfileArtifactSlot {
  id: string;
  zone: string;
  owned: boolean;
  name: string | null;
  grade: Artifact['grade'] | null;
  level: number | null;
}

export interface ProfileAchievementTab {
  tab: AchievementTab;
  label: string;
  claimed: number;
  total: number;
}

export interface ProfileAchievementItem {
  id: string;
  tab: Exclude<AchievementTab, 'bonus'>;
  tabLabel: string;
  name: string;
  desc: string;
  rewardText: string;
  claimed: boolean;
}

export interface ProfileHatSlot {
  id: string;
  name: string;
  source: HatSource;
  owned: boolean;
  look: Look;
  conditionText: string;
}

export interface ProfileView {
  online: boolean;
  placeLabel: string | null;
  fame: number;
  look: Look | null;
  boat: { tier: number; name: string; max: number };
  rod: { level: number; power: number };
  dex: { found: number; variantFound: number; total: number; zones: ProfileDexZone[] };
  achievements: { claimed: number; total: number; tabs: ProfileAchievementTab[]; items: ProfileAchievementItem[] };
  collectibles: {
    hats: {
      owned: number;
      total: number;
      goldOwned: number;
      goldTotal: number;
      achievementOwned: number;
      achievementTotal: number;
      eventOwned: number;
      eventTotal: number;
      slots: ProfileHatSlot[];
    };
    artifacts: { owned: number; total: number; slots: ProfileArtifactSlot[] };
  };
}

function resolvePlaceLabel(profile: PublicProfile): string | null {
  if (profile.online) {
    if (profile.liveZone) {
      const z = zoneById(profile.liveZone as ZoneId);
      if (z) return z.name;
    }
    if (profile.liveRegion === 'village') return '마을';
    if (profile.liveRegion === 'world') return '바다';
  }
  if (profile.location?.kind === 'base') {
    return BASE_NAMES[profile.location.id] ?? null;
  }
  if (profile.location?.kind === 'region' && profile.location.id === 'village') {
    return '마을';
  }
  if (profile.lastPos?.region === 'world') {
    const z = zoneOf(WORLD, profile.lastPos.x, profile.lastPos.y);
    return (z ? zoneById(z)?.name : undefined) ?? '바다';
  }
  if (profile.location?.kind === 'region' && profile.location.id === 'world') {
    return '바다';
  }
  return null;
}

export function selectProfileView(profile: PublicProfile): ProfileView {
  const caught = new Set(profile.dexFish);
  const variantCaught = new Set(profile.dexVariant);
  const ownedArtifacts = new Set(profile.artifacts);
  const ownedHats = new Set(profile.hats);
  const claimedAchievements = new Set(profile.achievements);

  const zones = ZONE_IDS.map(zone => {
    const fish = FISH.filter(f => topZoneOfSpot(f.spot) === zone);
    const found = fish.filter(f => caught.has(f.id)).length;
    const variantFound = fish.filter(f => variantCaught.has(f.id)).length;
    return {
      zone,
      name: zoneById(zone)?.shortName ?? zone,
      found,
      variantFound,
      total: fish.length,
      complete: found === fish.length,
      variantComplete: variantFound === fish.length,
    };
  }).filter(row => row.total > 0);

  const achievementTabs = ACHIEVEMENT_TABS.map(({ tab, label }) => {
    const inTab = ACHIEVEMENTS.filter(a => a.tab === tab);
    const claimed = inTab.filter(a => claimedAchievements.has(a.id)).length;
    return { tab, label, claimed, total: inTab.length };
  });
  const totalClaimed = ACHIEVEMENTS.filter(a => claimedAchievements.has(a.id)).length;
  const tabLabels = new Map(ACHIEVEMENT_TABS.map(t => [t.tab, t.label]));
  const hatNames = new Map(HATS.map(h => [h.id, h.name]));
  const achievementItems: ProfileAchievementItem[] = ACHIEVEMENTS.map(a => ({
    id: a.id,
    tab: a.tab,
    tabLabel: tabLabels.get(a.tab) ?? a.tab,
    name: a.name,
    desc: a.desc,
    rewardText: a.reward.kind === 'gold'
      ? `${a.reward.gold.toLocaleString('ko-KR')}G`
      : (hatNames.get(a.reward.hatId) ?? '모자'),
    claimed: claimedAchievements.has(a.id),
  }));

  const goldHats = HATS.filter(h => h.source === 'gold');
  const achievementHats = HATS.filter(h => h.source === 'achievement');
  const eventHats = HATS.filter(h => h.source === 'event');
  const goldOwned = goldHats.filter(h => ownedHats.has(h.id)).length;
  const achievementOwned = achievementHats.filter(h => ownedHats.has(h.id)).length;
  const eventOwned = eventHats.filter(h => ownedHats.has(h.id)).length;
  const hatLookBase = profile.look ?? DEFAULT_LOOK;
  const hatSlots: ProfileHatSlot[] = HATS.map(h => ({
    id: h.id,
    name: h.name,
    source: h.source,
    owned: ownedHats.has(h.id),
    look: { shirt: hatLookBase.shirt, pants: hatLookBase.pants, hat: h.id },
    conditionText: h.source === 'gold'
      ? `${h.price.toLocaleString('ko-KR')}G 구매`
      : h.source === 'event'
        ? '겨울 이벤트 기간에 접속하면 우편함으로 받을 수 있어요.'
        : (achievementById(h.achievementId)?.desc ?? '업적 보상'),
  }));

  const slots: ProfileArtifactSlot[] = ARTIFACTS.map(a => {
    const has = ownedArtifacts.has(a.id);
    const rawLevel = profile.artifactLevels[a.id];
    const level = has && artifactHasLevel(a)
      ? (typeof rawLevel === 'number' && Number.isInteger(rawLevel)
        ? Math.min(ARTIFACT_MAX_LEVEL, Math.max(1, rawLevel))
        : 1)
      : null;
    return {
      id: a.id,
      zone: zoneById(a.zone)?.shortName ?? a.zone,
      owned: has,
      name: has ? a.name : null,
      grade: has ? a.grade : null,
      level,
    };
  });

  return {
    online: profile.online,
    placeLabel: resolvePlaceLabel(profile),
    fame: profile.fame,
    look: profile.look,
    boat: { tier: profile.boat, name: boatNameOf(profile.boat), max: MAX_BOAT },
    rod: { level: profile.rod, power: powerOfLevel(profile.rod) },
    dex: {
      found: zones.reduce((n, z) => n + z.found, 0),
      variantFound: zones.reduce((n, z) => n + z.variantFound, 0),
      total: FISH.length,
      zones,
    },
    achievements: {
      claimed: totalClaimed,
      total: ACHIEVEMENTS.length,
      tabs: achievementTabs,
      items: achievementItems,
    },
    collectibles: {
      hats: {
        owned: goldOwned + achievementOwned + eventOwned,
        total: HATS.length,
        goldOwned,
        goldTotal: goldHats.length,
        achievementOwned,
        achievementTotal: achievementHats.length,
        eventOwned,
        eventTotal: eventHats.length,
        slots: hatSlots,
      },
      artifacts: {
        owned: slots.filter(s => s.owned).length,
        total: ARTIFACTS.length,
        slots,
      },
    },
  };
}
