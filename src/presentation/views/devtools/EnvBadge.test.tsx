import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import EnvBadge from './EnvBadge';
import { DevEnvContext, devEnvOf } from './devEnv';

const renderIn = (env: string) => render(
  <DevEnvContext.Provider value={devEnvOf(env)}><EnvBadge build="abc1234" /></DevEnvContext.Provider>,
);

describe('환경 배지', () => {
  afterEach(cleanup);

  it('스테이징 빌드는 PREVIEW와 빌드 식별자를 가운뎃점 없이 두 칸으로 보인다', () => {
    renderIn('preview');
    const badge = screen.getByRole('status', { name: 'PREVIEW 빌드 abc1234' });
    expect([...badge.children].map(c => c.textContent)).toEqual(['PREVIEW', 'abc1234']);
    expect(badge.textContent).not.toMatch(/[·–—]/);
    expect(badge.className).not.toMatch(/rounded/);
  });

  it('운영 빌드에는 배지가 없다', () => {
    renderIn('production');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
