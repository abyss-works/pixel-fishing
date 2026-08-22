// 가방 표시 그룹핑 — 개체(FishInstance)는 uid로 구분되지만 UI는 종+폼 단위 행으로 묶는다.
// 가방 탭과 판매 패널이 같은 정렬·같은 행 구성을 쓰도록 여기 한 곳에서 만든다 (세이브 v8).
import { instanceFish, priceOf, formName } from '../game/logic';
import type { FishInstance } from '../game/logic';
import type { Fish, FormId } from '../data/fish';
import { rarityRank } from './shared';

export interface BagRow {
  key: string;          // `${fishId}:${form}` — 행 식별자
  fish: Fish;
  form: FormId;
  name: string;
  price: number;        // 개체 1마리 값 (폼 배수 반영)
  items: FishInstance[]; // 이 행에 속한 개체들 — 판매 시 uid 목록의 출처
  maxSize: number | null; // 이 행 개체 중 최대 크기 (전부 미상이면 null)
}

export function groupInstances(bag: readonly FishInstance[]): BagRow[] {
  const rows = new Map<string, BagRow>();
  for (const inst of bag) {
    const fish = instanceFish(inst);
    if (!fish) continue; // 삭제된 어종 id — 표시에서 제외 (판매 대상에서도 빠진다)
    const key = `${inst.fishId}:${inst.form}`;
    const row = rows.get(key) ?? {
      key, fish, form: inst.form,
      name: formName(fish, inst.form),
      price: priceOf(fish, inst.form),
      items: [], maxSize: null,
    };
    row.items.push(inst);
    if (inst.size !== null) row.maxSize = Math.max(row.maxSize ?? 0, inst.size);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) =>
    rarityRank(a.fish.rarity) - rarityRank(b.fish.rarity)
    || a.fish.id.localeCompare(b.fish.id)
    || a.form.localeCompare(b.form));
}
