// 이름과 등급을 함께 적는 기본 꼴 `이름(등급)` — 이름은 본문색, 괄호와 등급 낱말만 등급색, 굵기 보통.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GradeName } from './RarityTag';

afterEach(cleanup);

describe('이름(등급) 표기', () => {
  it('괄호와 등급 낱말만 등급색 속성을 갖고 이름은 갖지 않는다', () => {
    render(<GradeName name="생명의 기운" grade="rare" />);
    const grade = screen.getByText('(희귀)');
    expect(grade).toHaveAttribute('data-rarity', 'rare');
    const name = screen.getByText('생명의 기운');
    expect(name).not.toHaveAttribute('data-rarity');
    expect(name.closest('[data-rarity]')).toBeNull();
  });

  it('이어 읽으면 이름(등급) 꼴이다', () => {
    const { container } = render(<GradeName name="사프란 미끼" grade="special" />);
    expect(container.textContent).toBe('사프란 미끼(특수)');
    expect(screen.getByText('(특수)')).toHaveAttribute('data-rarity', 'special');
  });

  it('기본 굵기는 보통이다', () => {
    render(<GradeName name="생명의 기운" grade="epic" />);
    expect(screen.getByText('생명의 기운').className).not.toMatch(/font-(bold|semibold|medium)/);
    expect(screen.getByText('(영웅)').className).not.toMatch(/font-(bold|semibold|medium)/);
  });

  it('강조하면 이름만 굵은 골드이고 괄호의 등급색은 그대로다', () => {
    render(<GradeName name="용연향 미끼" grade="legendary" emphasized />);
    expect(screen.getByText('용연향 미끼').className).toMatch(/font-bold/);
    expect(screen.getByText('용연향 미끼').className).toMatch(/text-gold/);
    expect(screen.getByText('(전설)')).toHaveAttribute('data-rarity', 'legendary');
    expect(screen.getByText('(전설)').className).not.toMatch(/font-bold|text-gold/);
  });

  it('등급이 없으면 이름만 쓴다', () => {
    const { container } = render(<GradeName name="가루디야" grade={null} />);
    expect(container.textContent).toBe('가루디야');
    expect(container.querySelector('[data-rarity]')).toBeNull();
  });

  it('등급이 없어도 강조는 이름에 적용한다', () => {
    render(<GradeName name="가루디야" grade={null} emphasized />);
    expect(screen.getByText('가루디야').className).toMatch(/font-bold/);
  });
});
