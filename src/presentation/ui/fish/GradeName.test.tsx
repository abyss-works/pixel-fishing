// 이름과 등급을 함께 적는 기본 꼴 `이름(등급)` — 이름은 본문색, 괄호와 등급 낱말만 등급색, 굵기 보통.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { GradeName, HighlightRarityText, FormatGradeLabel } from './RarityTag';

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

  it('기본 꼴은 이름과 등급에 굵기 클래스를 붙이지 않고 괄호(등급)는 font-normal로 굵기 상속을 막는다', () => {
    render(<GradeName name="생명의 기운" grade="epic" />);
    expect(screen.getByText('생명의 기운').className).not.toMatch(/font-(bold|semibold|medium)/);
    expect(screen.getByText('(영웅)').className).not.toMatch(/font-(bold|semibold|medium)/);
    expect(screen.getByText('(영웅)')).toHaveClass('font-normal');
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

describe('인라인 등급·형태 강조(HighlightRarityText)', () => {
  it('전설·영웅·희귀·특수와 돌연변이·네임드를 공용 색으로 강조한다', () => {
    const { container } = render(
      <HighlightRarityText text="전설과 영웅, 희귀, 특수 미끼, 돌연변이, 네임드 토벌" />,
    );
    expect(screen.getByText('전설')).toHaveAttribute('data-rarity', 'legendary');
    expect(screen.getByText('영웅')).toHaveAttribute('data-rarity', 'epic');
    expect(screen.getByText('희귀')).toHaveAttribute('data-rarity', 'rare');
    expect(screen.getByText('특수')).toHaveAttribute('data-rarity', 'special');
    expect(screen.getByText('돌연변이')).toHaveClass('text-mutation');
    expect(screen.getByText('네임드')).toHaveClass('text-named');
    expect(container.textContent).toBe('전설과 영웅, 희귀, 특수 미끼, 돌연변이, 네임드 토벌');
  });

  it('등급 맥락의 일반과 (일반)만 색칠하고 일반 의뢰·일반적인·일반 바다·일반 모습은 색칠하지 않는다', () => {
    const { container } = render(
      <HighlightRarityText text="일반 등급과 일반 어종, 일반 생명의 기운, 일반과 돌연변이, 도감(일반)" />,
    );
    expect(screen.getAllByText('일반')).toHaveLength(4);
    for (const el of screen.getAllByText('일반')) expect(el).toHaveAttribute('data-rarity', 'common');
    expect(screen.getByText('(일반)')).toHaveAttribute('data-rarity', 'common');
    expect(screen.getByText('돌연변이')).toHaveClass('text-mutation');

    cleanup();
    const { container: plain } = render(
      <HighlightRarityText text="일반 의뢰는 일반적인 경우와 일반 바다, 일반 모습에서 나오지 않아요." />,
    );
    expect(plain.querySelector('[data-rarity]')).toBeNull();
    expect(plain.textContent).toBe('일반 의뢰는 일반적인 경우와 일반 바다, 일반 모습에서 나오지 않아요.');
    expect(container).toBeTruthy();
  });

  it('쉼표 열거 속 일반(일반, 돌연변이, 네임드)도 일반 등급색으로 강조한다', () => {
    render(
      <HighlightRarityText text="도감의 각 보기에서 일반, 돌연변이, 네임드 기록을 따로 모아 봐요." />,
    );
    expect(screen.getByText('일반')).toHaveAttribute('data-rarity', 'common');
    expect(screen.getByText('돌연변이')).toHaveClass('text-mutation');
    expect(screen.getByText('네임드')).toHaveClass('text-named');
  });

  it('FormatGradeLabel은 이름(등급) 꼴을 GradeName으로 분리한다', () => {
    render(<FormatGradeLabel text="생명의 기운(희귀)" />);
    expect(screen.getByText('생명의 기운')).not.toHaveAttribute('data-rarity');
    expect(screen.getByText('(희귀)')).toHaveAttribute('data-rarity', 'rare');
  });
});
