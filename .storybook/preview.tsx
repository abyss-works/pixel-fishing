import type { Preview } from '@storybook/react';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { sessionKey } from '../src/features/account/service/session';
import GameFrame from '../src/presentation/layouts/game-stage/GameFrame';
import '../src/index.css';

/** 스토리 매개변수 stage: 게임 스테이지 크기의 상자 안에 그린다. frame이면 그 안의 16:9 게임 프레임 안에 그린다 */
interface StageParameter {
  width?: number;
  height?: number;
  frame?: boolean;
}

/** 실제 스테이지의 기본 크기. 오른쪽 탭 패널을 뺀 게임 영역이다 */
const STAGE = { width: 1000, height: 620 } as const;

// useQuery 사용 컴포넌트용 격리 클라이언트 (스토리마다 새로 만든다).
// 세션 게이트는 확보가 끝난 것으로 채워 둔다. 매개변수 session으로 uid를 바꾸거나 null(세션 없음)로 둘 수 있다.
const previewClient = (uid: string | null) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(sessionKey, uid);
  return client;
};

// 게임 스테이지 상자. 실제 스테이지와 같이 크기 컨테이너이고, 프레임 높이는 뷰포트가 아니라 상자 크기에서만 정한다.
const stageBox = (stage: StageParameter, children: ReactNode) => {
  const style = {
    width: stage.width ?? STAGE.width,
    height: stage.height ?? STAGE.height,
    containerType: 'size',
    '--frame-h': 'min(100cqh, calc(100cqw * 9 / 16))',
  } as CSSProperties;
  return (
    <div className="relative overflow-hidden bg-bg flex items-center justify-center" style={style}>
      {stage.frame ? <GameFrame>{children}</GameFrame> : children}
    </div>
  );
};

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  loaders: [mswLoader()],
  decorators: [
    (Story, { parameters }) => {
      const stage = parameters.stage as StageParameter | undefined;
      const uid = parameters.session === undefined ? 'u-me' : parameters.session as string | null;
      return (
        <QueryClientProvider client={previewClient(uid)}>
          {stage ? stageBox(stage, <Story />) : <Story />}
        </QueryClientProvider>
      );
    },
  ],
};

export default preview;
