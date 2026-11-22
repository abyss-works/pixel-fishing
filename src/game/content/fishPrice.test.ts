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
  nightmanta: 80000, mantaray: 40000, starcuttlefish: 20000, hammerhead: 10000, kingmackerel: 1900, moonflyingfish: 3800, flyingfish: 27, skipjack: 29, cuttlefish: 30,
  // 코모로 심해 (comorodeep)
  darkmegamouth: 160000, megamouth: 80000, goblinshark: 21000, frilledshark: 19000, abyssglass: 42000, upperlantern: 7200, glassoctopus: 3600, deepeel: 44, lanternfish: 41,
  // 남대서양 용승대 (benguela)
  kalunga: 200000, kianda: 100000, nighthake: 18000, snoek: 9000, orangeroughy: 48000, kingfish: 43000, capehake: 155, capejack: 140, capeanchovy: 125,
  // 세인트헬레나 (sthelena)
  bigeye: 360000, galapagosshark: 180000, wahoo: 90000, eolgedom: 180000, ascensionangel: 27000, apollodamsel: 195, sthpuffer: 185, sthwrasse: 175,
  // 아조레스 해령 (azores)
  sunkenecho: 3000000, unreturning: 1500000, oceanmola: 270000, atlanticblueshark: 250000, nightalfonsino: 86000, johndory: 43000, europeanconger: 390, atlanticbonito: 360, bluejack: 330,
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
