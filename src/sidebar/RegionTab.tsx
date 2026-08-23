import { BOATS, FISH, RARITY, SPOTS, canFishSpot, speciesDiscovered } from '../game/logic';
import type { GameState } from '../game/logic';
import { REGION_PACKS } from '../world';
import type { RegionId } from '../world';
import { cx } from '../ui/cx';
import Panel from '../ui/Panel';
import DataTable from '../ui/DataTable';
import Note from '../ui/Note';
import PixelIcon from '../ui/PixelIcon';
import PixelList from '../ui/PixelList';
import SectionTitle from '../ui/SectionTitle';
import FishSprite from '../ui/FishSprite';
import CardCarousel from '../ui/CardCarousel';
import { RarityText } from '../ui/RarityTag';
import { RARITY_CARD, RARITY_ORDER, rarityRank } from './shared';

// 한 화면에 보일 어종 카드 수 — 수역당 보통 5~6종이라 6장이면 대개 한 번에 들어간다.
// 카드 폭은 부모 기준으로 파생한다(gap 0.25rem × 5칸을 빼고 나눈다) — 사이드바 폭이 바뀌어도
// 6장이 유지된다.
const FISH_PER_VIEW = 6;

// 지역 탭 — 현재 지역의 로어·수역 정보·서식 어종·등급 확률 (몰입 요소)
export default function RegionTab({ region, game }: { region: RegionId; game: GameState }) {
  const pack = REGION_PACKS[region];
  const info = pack.info;
  const spots = SPOTS.filter(s => s.region === region);

  return (
    <div>
      <Panel title={pack.name}>
        <p className="text-accent text-sm">{info.tagline}</p>
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
              <span className={cx('text-xs whitespace-nowrap', open ? 'text-accent' : 'text-text-dim')}>
                {open ? '낚시 가능'
                  : <><PixelIcon glyph="lock" size={10} className="mr-0.5" />{BOATS[s.boatTier - 1].name}({s.boatTier}단계) 필요</>}
              </span>
            </div>
            {/* 도감·가방과 같은 카드 언어. 여기서 알려주는 건 **어떤 놈이 사는가**뿐이라
                실루엣·이름·등급 셋만 싣는다(마릿수·가격은 도감 소관).
                한 화면에 SPOTS_PER_VIEW장, 넘치면 밀어 본다 — 수역마다 어종 수가 다르다. */}
            <CardCarousel perView={FISH_PER_VIEW}>
              {fishes.map(f => {
                const caught = speciesDiscovered(game, f.id); // 폼 무관 — 종을 아는가
                // 미획득은 ??? — 정보는 주되 신비로움 유지 (도감 스포일러 규칙과 일관)
                return (
                  <div key={f.id} data-rarity={f.rarity}
                       className={cx(RARITY_CARD, 'p-1 basis-(--card-w)', !caught && 'opacity-[0.72]')}>
                    <FishSprite fish={f} preset="thumb" form="normal" discovered={caught}
                                ariaLabel={caught ? f.name : '미확인 어종'}
                                className="block mx-auto" />
                    <div className="text-2xs leading-tight truncate">{caught ? f.name : '???'}</div>
                    <div className="text-2xs leading-tight"><RarityText rarity={f.rarity} /></div>
                  </div>
                );
              })}
            </CardCarousel>
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
