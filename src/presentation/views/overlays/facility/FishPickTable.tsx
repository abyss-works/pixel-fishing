import type { ReactNode } from 'react';
import type { SaleRow } from '../../../../features/inventory/model/catalog';
import { LOCKED_PICK_TIP } from '../../../../features/inventory/model/saleWindow';
import InstanceLine, { UnsizedLine } from '../../../ui/fish/InstanceLine';
import { RarityText } from '../../../ui/fish/RarityTag';
import DataTable from '../../../ui/DataTable';
import IconButton from '../../../ui/IconButton';
import PixelIcon from '../../../ui/PixelIcon';
import Tip from '../../../ui/Tip';

// 어종 선택 표 — 판매 창의 판매 탭과 기운 얻기 탭이 함께 쓰는 표다.
// 선택의 원자 단위는 개체(uid)다. 행 체크는 그 행 전부를 켜고 끄는 단축이고, 줄을 펼치면 개체 하나씩 고를 수 있다.
// 잠근 개체는 개별로 선택할 수 없다(가방 탭에서 해제). 크기 미상 개체는 구별할 정보가 없어 묶음 단위로 고른다.
// 무엇을 고르는지(판매, 기운 얻기)와 마지막 열의 값(소계, 얻는 기운)은 호출부가 정하고, 행 구성과 체크 동작은 이 표 하나가 맡는다.
// 스크롤 칸은 호출부가 둔다.
export default function FishPickTable({ rows, expanded, onToggleExpand, onToggleRow, onToggleOne, action, heads, valueOf, emptyValue }: {
  /** 행과 선택 상태 — 선택한 개체는 행의 selected가 알린다 */
  rows: readonly SaleRow[];
  /** 펼친 행의 키 */
  expanded: ReadonlySet<string>;
  onToggleExpand: (key: string) => void;
  /** 행 체크 — 그 행의 잠그지 않은 개체 전부를 켜거나 끈다. allOn은 지금 전부 켜져 있는가 */
  onToggleRow: (uids: string[], allOn: boolean) => void;
  onToggleOne: (uid: string) => void;
  /** 체크 버튼의 접근성 이름에 쓰는 동작 이름(예: 판매) */
  action: string;
  /** 첫 열과 마지막 열의 머리 */
  heads: { check: string; value: string };
  /** 마지막 열의 값 — 선택한 개체가 있을 때만 호출한다 */
  valueOf: (row: SaleRow) => ReactNode;
  /** 마지막 열이 비는 행(아무것도 고르지 않았거나 전부 잠김)에 보이는 값 */
  emptyValue: ReactNode;
}) {
  const checked = new Set(rows.flatMap(row => row.selected.map(inst => inst.uid)));
  return (
    <DataTable>
      <thead><tr><th>{heads.check}</th><th>어종</th><th>등급</th><th>수량</th><th>{heads.value}</th></tr></thead>
      <tbody>
        {rows.map(row => {
          const { key, fish, name, items, sized, unsized, sellable, maxByForm, selectedCount: on, allSelected: allOn } = row;
          const locked = sellable.length === 0; // 이 종 개체가 전부 잠김
          const glyph = on === 0 ? 'checkOff' : allOn ? 'checkOn' : 'checkPartial';
          const open = expanded.has(key);
          return [
            <tr key={key} className={locked || on === 0 ? 'text-text-dim' : ''}>
              <td>
                {locked ? (
                  <Tip plain text={LOCKED_PICK_TIP} className="text-text-dim">
                    <PixelIcon glyph="lock" size={13} />
                  </Tip>
                ) : (
                  <IconButton glyph={glyph} size={13}
                              tone={on > 0 ? 'gold' : 'dim'}
                              className="p-0 leading-none"
                              aria-label={`${name} ${action} ${allOn ? '해제' : '선택'}`}
                              onClick={() => onToggleRow(sellable.map(i => i.uid), allOn)} />
                )}
              </td>
              <td>
                <IconButton glyph={open ? 'caretDown' : 'caretRight'} size={9}
                            className="p-0 text-inherit gap-1"
                            aria-label={`${name} 개체 ${open ? '접기' : '펼치기'}`}
                            aria-expanded={open}
                            onClick={() => onToggleExpand(key)}>
                  {name}
                </IconButton>
              </td>
              <td><RarityText rarity={fish.rarity} /></td>
              <td className="pf-accent">
                {on === items.length ? `×${items.length}` : `${on}/${items.length}`}
              </td>
              <td className="pf-accent">
                {on > 0 && !locked ? valueOf(row) : emptyValue}
              </td>
            </tr>,
            open ? (
              <tr key={`${key}-items`}>
                <td colSpan={5} className="p-0 bg-bg">
                  {sized.map(inst => {
                    const on = checked.has(inst.uid);
                    return (
                      <InstanceLine key={inst.uid} inst={inst} fish={fish}
                                    best={inst.size !== null && inst.size === maxByForm[inst.form]}
                                    checked={!inst.locked && on}
                                    onToggle={inst.locked ? undefined : () => onToggleOne(inst.uid)}>
                        {inst.locked ? (
                          <Tip plain text={LOCKED_PICK_TIP} className="text-text-dim"><PixelIcon size={11} glyph="lock" /></Tip>
                        ) : (
                          <PixelIcon size={11} className={on ? 'text-gold' : 'text-text-dim'} glyph={on ? 'checkOn' : 'checkOff'} />
                        )}
                      </InstanceLine>
                    );
                  })}
                  {/* 크기 미상은 묶음 단위로 고른다 — 구별할 정보가 없으니 개별 선택이 무의미하다 */}
                  {unsized.map(g => {
                    const gOn = g.selectedCount;
                    const gGlyph = gOn === 0 ? 'checkOff' : g.allSelected ? 'checkOn' : 'checkPartial';
                    return (
                      <UnsizedLine key={g.form} count={g.items.length} form={g.form}
                                   locked={g.free.length === 0}
                                   checked={gOn > 0}
                                   onToggle={g.free.length === 0
                                     ? undefined
                                     : () => onToggleRow(g.free.map(i => i.uid), g.allSelected)}>
                        {g.free.length === 0 ? (
                          <Tip plain text={LOCKED_PICK_TIP} className="text-text-dim"><PixelIcon size={11} glyph="lock" /></Tip>
                        ) : (
                          <PixelIcon size={11} glyph={gGlyph} className={gOn > 0 ? 'text-gold' : 'text-text-dim'} />
                        )}
                      </UnsizedLine>
                    );
                  })}
                </td>
              </tr>
            ) : null,
          ];
        })}
      </tbody>
    </DataTable>
  );
}
