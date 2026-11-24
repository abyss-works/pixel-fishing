// 어종 가격 — 확정한 가격표와 대조한다. 가격은 해역 순서로 적었다.
import { describe, it, expect } from 'vitest';
import { FISH } from './fish';

const CONFIRMED_PRICE: Record<string, number> = {
  // 마을 연못 (pond)
  goldcarp: 800, crucian: 4, minnow: 3, loach: 3, goldfish: 250, carp: 60,
  // 마을 강 (river)
  riverlord: 1000, salmon: 65, mandarin: 60, rainbow: 300, sweetfish: 4, catfish: 3,
  // 태평양 (sea)
  moonveil: 2400, shark: 1200, tuna: 350, yellowtail: 75, seabream: 70, mackerel: 3, hairtail: 4,
  // 마리아나 해구 (deep)
  abyssveil: 4000, kraken: 2000, oarfish: 500, coelacanth: 450, squid: 120, anglerfish: 5,
  // 드래곤 홀 (dragonhole)
  seadragon: 2700, nightdragon: 5400, moonglow: 1200, sailfish: 600, pufferfish: 150, filefish: 5, stingray: 6,
  // 코론 침선 지대 (coron)
  nightking: 7600, ironreefking: 3800, wraithfish: 1600, tigershark: 800, napoleonfish: 750, lionfish: 200, moray: 7,
  // 그레이트 배리어 리프 (barrierreef)
  coralking: 4500, bunyip: 5000, dreamking: 10000, mooncoral: 1200, bluestreak: 600, emperorbream: 500, ausalsmon: 8, spangledemperor: 7, butterflyfish: 7, clownfish: 6,
  // 인도양 (indian)
  makaira: 12000, oceanmirror: 24000, blackmarlin: 2700, starfin: 5400, nighttrevally: 1200, yellowfin: 600, ribbonfish: 9, horsejack: 10, trevally: 11,
  // 남인도양 (southindian)
  deepsilence: 60000, varuna: 30000, aurorafish: 10000, whaleshark: 5000, sbft: 4500, frostnight: 2000, blueshark: 1000, neonsquid: 900, sardineS: 19, saury: 21,
  // 모잠비크 해협 (mozstrait)
  nightmanta: 110000, mantaray: 53000, starcuttlefish: 19000, hammerhead: 9400, kingmackerel: 1500, moonflyingfish: 3000, flyingfish: 20, skipjack: 21, cuttlefish: 22,
  // 코모로 심해 (comorodeep)
  darkmegamouth: 220000, megamouth: 110000, goblinshark: 19000, frilledshark: 17000, abyssglass: 39000, upperlantern: 5400, glassoctopus: 2700, deepeel: 31, lanternfish: 29,
  // 남대서양 용승대 (benguela)
  kalunga: 600000, kianda: 300000, nighthake: 15000, snoek: 7500, orangeroughy: 49000, kingfish: 45000, capehake: 113, capejack: 101, capeanchovy: 90,
  // 세인트헬레나 (sthelena)
  bigeye: 1100000, galapagosshark: 560000, wahoo: 94000, eolgedom: 190000, ascensionangel: 23000, apollodamsel: 135, sthpuffer: 128, sthwrasse: 120,
  // 아조레스 해령 (azores)
  sunkenecho: 3300000, unreturning: 1700000, oceanmola: 300000, atlanticblueshark: 280000, nightalfonsino: 95000, johndory: 47000, europeanconger: 429, atlanticbonito: 396, bluejack: 363,
  // 버뮤다 삼각지대 (bermuda)
  vanishingpoint: 7000000, unraveledknot: 3500000, nightporcupine: 1200000, atlantictarpon: 600000, spottedeagleray: 120000, cobia: 790, americaneel: 750, sargassumfish: 710,
};

// 반올림 규칙 밖에 두기로 확정한 가격(앞 세 자리가 유효한 값)
const ROUNDING_EXCEPTIONS = new Set<number>([]);

// 희귀 이상 가격: 두 자리 수는 5 단위, 세 자리 이상은 앞 두 자리 유효숫자
function followsRoundingRule(price: number): boolean {
  if (price < 100) return price % 5 === 0;
  const digits = String(price).length;
  const unit = 10 ** (digits - 2);
  return price % unit === 0;
}

describe('어종 가격', () => {
  it('모든 어종의 가격이 확정 가격표와 같고 표에 없는 어종이 없다', () => {
    expect(FISH).toHaveLength(Object.keys(CONFIRMED_PRICE).length);
    for (const f of FISH) expect(f.price, f.id).toBe(CONFIRMED_PRICE[f.id]);
  });
  it('희귀 이상 가격은 반올림 규칙 안이거나 확정한 예외다', () => {
    for (const f of FISH) {
      if (f.rarity === 'common') continue;
      expect(followsRoundingRule(f.price) || ROUNDING_EXCEPTIONS.has(f.price), `${f.id} ${f.price}`).toBe(true);
    }
  });
  it('예외 가격은 확정 가격표에서 실제로 쓰인다', () => {
    const used = new Set(FISH.map(f => f.price));
    for (const v of ROUNDING_EXCEPTIONS) expect(used.has(v), String(v)).toBe(true);
  });
});
