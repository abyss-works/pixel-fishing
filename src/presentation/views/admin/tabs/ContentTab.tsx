// 관리자 콘텐츠 카탈로그 탭 — 9개 콘텐츠 축 정본을 오프라인에서도 검색·필터·열람한다.
import { useMemo, useState } from 'react';
import {
  CATALOG_RARITY_OPTIONS,
  CATALOG_ZONE_OPTIONS,
  CONTENT_AXES,
  CONTENT_CATALOG,
  filterAchievementCatalog,
  filterArtifactCatalog,
  filterBoatCatalog,
  filterBonusSeriesCatalog,
  filterBountyCatalog,
  filterFishCatalog,
  filterHatCatalog,
  filterNamedCatalog,
  filterRecipeCatalog,
  filterSpotCatalog,
  filterZoneCatalog,
} from '../../../../features/admin/model/contentCatalog';
import type { CatalogFilter, ContentAxisId } from '../../../../features/admin/model/contentCatalog';
import CheckToggle from '../../../ui/CheckToggle';
import Inset from '../../../ui/Inset';
import Note from '../../../ui/Note';
import PillButton from '../../../ui/PillButton';
import Select from '../../../ui/Select';
import TextInput from '../../../ui/TextInput';
import { AdminCard } from '../layout';
import AchievementCatalogSection from './content/AchievementCatalogSection';
import ArtifactCatalogSection from './content/ArtifactCatalogSection';
import BoatCatalogSection from './content/BoatCatalogSection';
import BountyCatalogSection from './content/BountyCatalogSection';
import CookingCatalogSection from './content/CookingCatalogSection';
import FishCatalogSection from './content/FishCatalogSection';
import NamedCatalogSection from './content/NamedCatalogSection';
import WardrobeCatalogSection from './content/WardrobeCatalogSection';
import ZoneCatalogSection from './content/ZoneCatalogSection';

export default function ContentTab({ embedded = false }: { embedded?: boolean } = {}) {
  const [axis, setAxis] = useState<ContentAxisId>('fish');
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState<CatalogFilter['zone']>('all');
  const [rarity, setRarity] = useState<CatalogFilter['rarity']>('all');
  const [nightOnly, setNightOnly] = useState(false);

  const filter: CatalogFilter = useMemo(
    () => ({ query, zone, rarity, nightOnly }),
    [query, zone, rarity, nightOnly],
  );

  const hasFilter = query.trim().length > 0 || zone !== 'all' || rarity !== 'all' || nightOnly;
  const resetFilter = () => {
    setQuery('');
    setZone('all');
    setRarity('all');
    setNightOnly(false);
  };

  const activeAxisMeta = CONTENT_AXES.find(a => a.id === axis)!;

  const filteredFish = useMemo(() => filterFishCatalog(CONTENT_CATALOG.fish, filter), [filter]);
  const filteredNamed = useMemo(() => filterNamedCatalog(CONTENT_CATALOG.named, filter), [filter]);
  const filteredArtifacts = useMemo(() => filterArtifactCatalog(CONTENT_CATALOG.artifacts, filter), [filter]);
  const filteredAchievements = useMemo(() => filterAchievementCatalog(CONTENT_CATALOG.achievements, filter), [filter]);
  const filteredBonusSeries = useMemo(() => filterBonusSeriesCatalog(CONTENT_CATALOG.bonusSeries, filter), [filter]);
  const filteredHats = useMemo(() => filterHatCatalog(CONTENT_CATALOG.wardrobe.hats, filter), [filter]);
  const filteredRecipes = useMemo(() => filterRecipeCatalog(CONTENT_CATALOG.cooking.recipes, filter), [filter]);
  const filteredBoats = useMemo(() => filterBoatCatalog(CONTENT_CATALOG.boats, filter), [filter]);
  const filteredZones = useMemo(() => filterZoneCatalog(CONTENT_CATALOG.zones.zones, filter), [filter]);
  const filteredSpots = useMemo(() => filterSpotCatalog(CONTENT_CATALOG.zones.spots, filter), [filter]);
  const filteredBounties = useMemo(() => filterBountyCatalog(CONTENT_CATALOG.bounties, filter), [filter]);

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="콘텐츠 축">
        {CONTENT_AXES.map(ax => (
          <PillButton
            key={ax.id}
            type="button"
            role="tab"
            aria-selected={axis === ax.id}
            active={axis === ax.id}
            onClick={() => setAxis(ax.id)}
          >
            <span>{ax.label}</span>
            <span className="text-2xs opacity-80">({ax.count})</span>
          </PillButton>
        ))}
      </div>

      <Inset className="flex flex-wrap items-center justify-between gap-2.5 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="이름·로어·구역·재료 검색"
            aria-label="콘텐츠 검색"
            className="w-[220px]"
          />
          <Select
            value={zone}
            onChange={e => setZone(e.target.value as CatalogFilter['zone'])}
            aria-label="구역 필터"
          >
            {CATALOG_ZONE_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </Select>
          <Select
            value={rarity}
            onChange={e => setRarity(e.target.value as CatalogFilter['rarity'])}
            aria-label="등급 필터"
          >
            {CATALOG_RARITY_OPTIONS.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </Select>
          <CheckToggle checked={nightOnly} onChange={setNightOnly} label="밤 전용만" />
        </div>

        <div className="flex items-center gap-2">
          <Note size="2xs" className="my-0">{activeAxisMeta.summary}</Note>
          {hasFilter && (
            <PillButton type="button" onClick={resetFilter}>필터 초기화</PillButton>
          )}
        </div>
      </Inset>

      {axis === 'fish' && <FishCatalogSection items={filteredFish} />}
      {axis === 'named' && <NamedCatalogSection items={filteredNamed} />}
      {axis === 'artifacts' && <ArtifactCatalogSection items={filteredArtifacts} />}
      {axis === 'achievements' && (
        <AchievementCatalogSection
          achievements={filteredAchievements}
          bonusSeries={filteredBonusSeries}
          cumulativeBonusCount={CONTENT_CATALOG.cumulativeBonusCount}
        />
      )}
      {axis === 'wardrobe' && (
        <WardrobeCatalogSection wardrobe={CONTENT_CATALOG.wardrobe} hats={filteredHats} />
      )}
      {axis === 'cooking' && (
        <CookingCatalogSection cooking={CONTENT_CATALOG.cooking} recipes={filteredRecipes} />
      )}
      {axis === 'boats' && (
        <BoatCatalogSection items={filteredBoats} walkBagCap={CONTENT_CATALOG.walkBagCap} />
      )}
      {axis === 'zones' && (
        <ZoneCatalogSection
          zones={filteredZones}
          spots={filteredSpots}
          bases={CONTENT_CATALOG.zones.bases}
        />
      )}
      {axis === 'bounties' && <BountyCatalogSection items={filteredBounties} />}
    </>
  );

  if (embedded) return body;

  return (
    <AdminCard title="콘텐츠 카탈로그">
      <div className="flex flex-col gap-3">{body}</div>
    </AdminCard>
  );
}
