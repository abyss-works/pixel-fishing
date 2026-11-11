// 등급 괄호 표기 — 등급이 있는 대상의 이름은 이름 뒤에 등급을 괄호로 붙인다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { gradeName } from './gradeName';
import { GradeName } from './fish/RarityTag';

afterEach(cleanup);

describe('등급 괄호 표기', () => {
  it('이름 뒤에 등급 이름을 괄호로 붙인다', () => {
    expect(gradeName('생명의 기운', 'common')).toBe('생명의 기운(일반)');
    expect(gradeName('생명의 기운', 'legendary')).toBe('생명의 기운(전설)');
    expect(gradeName('롱페퍼 미끼', 'rare')).toBe('롱페퍼 미끼(희귀)');
  });

  it('등급을 이름 앞에 붙이거나 대괄호로 감싸지 않는다', () => {
    const text = gradeName('생명의 기운', 'epic');
    expect(text.startsWith('영웅')).toBe(false);
    expect(text).not.toContain('[');
  });

  it('색 표기는 같은 글자를 등급색 속성으로 그린다', () => {
    render(<GradeName name="생명의 기운" grade="rare" />);
    const el = screen.getByText('생명의 기운(희귀)');
    expect(el).toHaveAttribute('data-rarity', 'rare');
  });
});
