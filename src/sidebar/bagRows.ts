// 가방 표시 그룹핑 — 개체(FishInstance)는 uid로 구분되지만 UI는 **어종 단위** 행으로 묶는다.
// 가방 탭과 판매 패널이 같은 정렬·같은 행 구성을 쓰도록 여기 한 곳에서 만든다 (세이브 v8).
//
// 폼(변이)으로 행을 가르지 않는다. 스키마상 변이는 별개 기록이지만(`dex[id][form]`), 가방은
// "지금 뭘 들고 있나"를 보는 화면이고 종마다 행이 둘로 갈리면 목록이 두 배가 된다.
// 변이는 개체 줄의 배지로 구분한다 — 최대 배지와 같은 방식.
import { instanceFish, priceOfInstance } from '../game/logic';
import type { FishInstance } from '../game/logic';
import type { Fish, FormId } from '../data/fish';
import { rarityRank } from './shared';

export interface BagRow {
  key: string;           // fishId — 행 식별자
  fish: Fish;
  name: string;
  items: FishInstance[]; // 이 행 개체 전부 (폼 섞임) — 판매 시 uid 목록의 출처
  /** 크기가 기록된 개체 — 한 줄씩 그린다 (변이 먼저, 큰 것부터) */
  sized: FishInstance[];
  /** 크기 미상(v0.4.0 이관) — **묶어서 한 줄**. 폼별로 값이 다르니 폼으로만 가른다 */
  unsized: { form: FormId; items: FishInstance[] }[];
  /** 이 행(어종) 전체의 최대 크기 — 행 머리 요약용. 전부 미상이면 null */
  maxSize: number | null;
  /** **폼별** 최대 크기 — 개체 줄의 `최대` 배지 기준.
   *  변이는 "종만 같고 다른 개체"라 최대 기록도 폼별 독립이다(rarity-design 7절, 도감도 같다).
   *  종 단위로 재면 일반 42cm가 있을 때 변이 중 가장 큰 놈이 배지를 못 받는다 — 남길지
   *  판단하는 기준이 폼별인데 표시가 종 단위면 어긋난다. */
  maxByForm: Partial<Record<FormId, number>>;
}

/** 개체 묶음의 판매가 합 — 폼마다 값이 달라(변이 ×2) 행 단가로는 못 낸다 */
export const sumPrice = (items: readonly FishInstance[]): number =>
  items.reduce((s, i) => s + priceOfInstance(i), 0);

export function groupInstances(bag: readonly FishInstance[]): BagRow[] {
  const rows = new Map<string, BagRow>();
  for (const inst of bag) {
    const fish = instanceFish(inst);
    if (!fish) continue; // 삭제된 어종 id — 표시에서 제외 (판매 대상에서도 빠진다)
    const row = rows.get(inst.fishId)
      ?? { key: inst.fishId, fish, name: fish.name, items: [], sized: [], unsized: [],
           maxSize: null, maxByForm: {} };
    row.items.push(inst);
    if (inst.size !== null) {
      row.maxSize = Math.max(row.maxSize ?? 0, inst.size);
      row.maxByForm[inst.form] = Math.max(row.maxByForm[inst.form] ?? 0, inst.size);
    }
    rows.set(inst.fishId, row);
  }
  // 행 안 정렬 = **변이 먼저, 각 무리에서 큰 개체 먼저**.
  // 방생 우선순위(등급 → 변이 → 크기)와 같은 축이다 — 목록에서 아래에 있을수록 먼저 나간다.
  // 등급은 행이 이미 어종 단위라 행 안에서는 상수라서 빠진다.
  const byForm = (a: FishInstance, b: FishInstance) =>
    (a.form === 'variant' ? 0 : 1) - (b.form === 'variant' ? 0 : 1);

  for (const row of rows.values()) {
    row.items.sort((a, b) =>
      byForm(a, b) || (b.size ?? -1) - (a.size ?? -1) || a.uid.localeCompare(b.uid));

    // **크기 미상은 개별로 그리지 않는다.** uid 말고는 서로 다른 점이 하나도 없어서
    // (크기·잡은 날·수역·판정 전부 null) 줄을 나눠도 유저가 고를 근거가 생기지 않는다.
    // v0.4.0에서 수천 마리를 쌓아둔 세이브가 그대로 수천 줄이 되는 것도 이 때문에 막는다.
    row.sized = row.items.filter(i => i.size !== null);
    const groups = new Map<FormId, FishInstance[]>();
    for (const i of row.items) {
      if (i.size !== null) continue;
      (groups.get(i.form) ?? groups.set(i.form, []).get(i.form)!).push(i);
    }
    row.unsized = [...groups.entries()]
      .map(([form, items]) => ({ form, items }))
      .sort((a, b) => (a.form === 'variant' ? 0 : 1) - (b.form === 'variant' ? 0 : 1));
  }
  // 행 순서는 도감과 같은 기준 (등급 → id)
  return [...rows.values()].sort((a, b) =>
    rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity)
    || a.fish.id.localeCompare(b.fish.id));
}
