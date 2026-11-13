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
  nightmanta: 140000, mantaray: 70000, starcuttlefish: 25000, hammerhead: 12500, kingmackerel: 2000, moonflyingfish: 4000, flyingfish: 26, skipjack: 28, cuttlefish: 29,
  // 코모로 심해 (comorodeep)
  darkmegamouth: 300000, megamouth: 150000, goblinshark: 27000, frilledshark: 24000, abyssglass: 54000, upperlantern: 7500, glassoctopus: 3750, deepeel: 43, lanternfish: 40,
  // 남대서양 용승대 (benguela)
  kalunga: 800000, kianda: 400000, nighthake: 20000, snoek: 10000, orangeroughy: 65000, kingfish: 60000, capehake: 150, capejack: 135, capeanchovy: 120,
  // 세인트헬레나 (sthelena)
  bigeye: 1500000, galapagosshark: 750000, wahoo: 125000, eolgedom: 250000, ascensionangel: 30000, apollodamsel: 180, sthpuffer: 170, sthwrasse: 160,
};

// 반올림 규칙 밖에 두기로 확정한 가격(앞 세 자리가 유효한 값)
const ROUNDING_EXCEPTIONS = new Set([12500, 3750, 125000]);

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
