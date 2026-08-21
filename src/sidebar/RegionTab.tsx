import { BOATS, FISH, RARITY, SPOTS, canFishSpot } from '../game/logic';
import type { GameState } from '../game/logic';
import { REGION_INFO } from '../data/regions';
import type { RegionId } from '../world';
import { cx } from '../ui/cx';
import Panel from '../ui/Panel';
import DataTable from '../ui/DataTable';
import Note from '../ui/Note';
import PixelIcon from '../ui/PixelIcon';
import PixelList from '../ui/PixelList';
import SectionTitle from '../ui/SectionTitle';
import { RarityText, RarityDot } from '../ui/RarityTag';
import { RARITY_ORDER, rarityRank } from './shared';

// 지역 탭 — 현재 지역의 로어·수역 정보·서식 어종·등급 확률 (몰입 요소)
export default function RegionTab({ region, game }: { region: RegionId; game: GameState }) {
  const info = REGION_INFO[region];
  const spots = SPOTS.filter(s => s.region === region);

  return (
    <div>
      <Panel title={info.name}>
        <p className="text-accent text-xs">{info.tagline}</p>
        <p className="text-xs leading-[1.7]">{info.lore}</p>
      </Panel>

      <SectionTitle>이 지역의 수역</SectionTitle>
      {spots.map(s => {
        const open = canFishSpot(game, s.id);
        const fishes = FISH.filter(f => f.spot === s.id)
          .sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
        return (
          <div key={s.id} className={cx('border border-line rounded-sm p-2 bg-bg', !open && 'opacity-75')}>
            <div className="flex justify-between items-baseline gap-2 mb-1">
              <b>{s.name}</b>
              <span className={cx('text-[11px] whitespace-nowrap', open ? 'text-accent' : 'text-text-dim')}>
                {open ? '낚시 가능'
                  : <><PixelIcon glyph="lock" size={10} className="mr-0.5" />{BOATS[s.boatTier - 1].name}({s.boatTier}단계) 필요</>}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {fishes.map(f => {
                const caught = (game.caught[f.id] ?? 0) > 0;
                // 미획득은 ??? + 등급 점만 — 정보는 주되 신비로움 유지 (도감 스포일러 규칙과 일관)
                return (
                  <span key={f.id}
                        className={cx('text-[11px] bg-surface border border-line rounded-sm px-1 py-px whitespace-nowrap',
                          caught ? 'text-text' : 'text-text-dim')}>
                    <RarityDot rarity={f.rarity} />
                    {caught ? f.name : '???'}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}

      <SectionTitle>이 지역의 등급 확률</SectionTitle>
      <DataTable>
        <thead><tr><th>등급</th><th>가중치</th><th>명성</th></tr></thead>
        <tbody>
          {RARITY_ORDER.map(id => (
            <tr key={id}>
              <td><RarityText rarity={id} /></td>
              <td className="pf-accent">{RARITY[id].weight}</td>
              <td className="pf-accent">+{RARITY[id].fame}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <Note>PERFECT 판정은 희귀 이상 확률을 높여요. 방치는 흔한 물고기가 잘 나와요.</Note>

      <SectionTitle>여기서 할 수 있는 것</SectionTitle>
      <PixelList>
        {info.tips.map((t, i) => <li key={i}>{t}</li>)}
      </PixelList>

      <SectionTitle>조작</SectionTitle>
      <PixelList>
        {info.controls.map((c, i) => <li key={i}>{c}</li>)}
      </PixelList>
    </div>
  );
}
