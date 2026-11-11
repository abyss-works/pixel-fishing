// 등급 괄호 표기 — 등급이 있는 대상의 이름은 이름 뒤에 등급을 괄호로 붙인다.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GradeName } from './RarityTag';

afterEach(cleanup);

describe('등급 괄호 표기의 색', () => {
  it('색 표기는 같은 글자를 등급색 속성으로 그린다', () => {
    render(<GradeName name="생명의 기운" grade="rare" />);
    const el = screen.getByText('생명의 기운(희귀)');
    expect(el).toHaveAttribute('data-rarity', 'rare');
  });
});
