// 어종 선택 표 — 판매 창과 부엌 창의 기운 얻기 탭이 함께 쓰는 표. 행 구성과 체크 동작은 이 표 하나가 맡는다.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { FISH } from '../../../../game/rules/logic';
import type { FishInstance } from '../../../../game/rules/logic';
import { selectSalePreview } from '../../../../features/inventory/model/catalog';
import FishPickTable from './FishPickTable';

afterEach(cleanup);

const fish = FISH.find(f => f.rarity === 'common')!;
const inst = (uid: string, over: Partial<FishInstance> = {}): FishInstance =>
  ({ uid, fishId: fish.id, form: 'normal', size: 20, caughtAt: null, spot: null, judgment: null, locked: false, ...over });

function show(bag: FishInstance[], excluded: string[] = [], expandedKeys: string[] = []) {
  const handlers = {
    onToggleExpand: vi.fn(), onToggleRow: vi.fn(), onToggleOne: vi.fn(),
  };
  render(
    <FishPickTable rows={selectSalePreview(bag, new Set(excluded), 0).rows} expanded={new Set(expandedKeys)}
                   action="선택" heads={{ check: '선택', value: '값' }}
                   valueOf={row => `+${row.selectedCount}`} emptyValue="0" {...handlers} />,
  );
  return handlers;
}

describe('어종 선택 표', () => {
  it('머리는 호출부가 정한 첫 열과 마지막 열 이름을 쓰고 가운데 열은 같다', () => {
    show([inst('a')]);
    const heads = screen.getAllByRole('columnheader').map(h => h.textContent);
    expect(heads).toEqual(['선택', '어종', '등급', '수량', '값']);
  });

  it('행마다 어종 이름, 수량, 마지막 열 값을 보인다', () => {
    show([inst('a'), inst('b')]);
    const row = screen.getByText(fish.name).closest('tr')!;
    expect(within(row).getByText('×2')).toBeInTheDocument();
    expect(within(row).getByText('+2')).toBeInTheDocument();
  });

  it('일부만 고르면 수량이 선택 수와 전체 수로 보이고 체크는 부분 선택이다', () => {
    show([inst('a'), inst('b')], ['b']);
    const row = screen.getByText(fish.name).closest('tr')!;
    expect(within(row).getByText('1/2')).toBeInTheDocument();
    expect(within(row).getByText('+1')).toBeInTheDocument();
  });

  it('아무것도 고르지 않은 행은 마지막 열에 비었을 때의 값을 보인다', () => {
    show([inst('a')], ['a']);
    const row = screen.getByText(fish.name).closest('tr')!;
    expect(within(row).getByText('0')).toBeInTheDocument();
  });

  it('행 체크는 그 행의 잠그지 않은 개체 전부와 지금 전부 켜져 있는지를 넘긴다', () => {
    const h = show([inst('a'), inst('b'), inst('c', { locked: true })]);
    fireEvent.click(screen.getByRole('button', { name: `${fish.name} 선택 해제` }));
    expect(h.onToggleRow).toHaveBeenCalledWith(['a', 'b'], true);
  });

  it('전부 잠긴 행은 체크 버튼 대신 잠금 표시이고 선택할 수 없다', () => {
    show([inst('a', { locked: true })]);
    expect(screen.queryByRole('button', { name: new RegExp(`${fish.name} 선택`) })).toBeNull();
  });

  it('펼치면 개체 줄이 보이고 줄의 체크가 그 개체 하나를 넘긴다', () => {
    const h = show([inst('a', { size: 31 }), inst('b', { size: 12 })], [], [fish.id]);
    fireEvent.click(screen.getAllByRole('button', { name: /31\.0cm/ })[0] ?? screen.getByText('31.0cm'));
    expect(h.onToggleOne).toHaveBeenCalledWith('a');
  });

  it('행 이름 버튼은 펼침 상태를 알리고 누르면 그 행 키를 넘긴다', () => {
    const h = show([inst('a')]);
    const button = screen.getByRole('button', { name: `${fish.name} 개체 펼치기` });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(button);
    expect(h.onToggleExpand).toHaveBeenCalledWith(fish.id);
  });

  it('크기를 모르는 개체는 묶음 하나로 고른다', () => {
    const h = show([inst('a', { size: null }), inst('b', { size: null })], [], [fish.id]);
    fireEvent.click(screen.getByText(/크기 미상|미상/));
    expect(h.onToggleRow).toHaveBeenCalledWith(['a', 'b'], true);
  });
});
