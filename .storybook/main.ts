import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['msw-storybook-addon'],
  framework: { name: '@storybook/react-vite', options: {} },
  // MSW 서비스 워커(mockServiceWorker.js)를 루트에서 내려준다
  staticDirs: ['../public'],
  // 서버 기능(친구, 길드, 우편 등)의 어댑터가 fetch를 부르도록 클라우드 빌드로 묶는다. 응답은 스토리의 MSW 핸들러가 준다
  viteFinal: async config => ({
    ...config,
    define: { ...config.define, 'import.meta.env.VITE_CLOUD': JSON.stringify('1') },
  }),
};

export default config;
