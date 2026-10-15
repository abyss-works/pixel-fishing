import type { Preview } from '@storybook/react';
import { mswLoader } from 'msw-storybook-addon/csf3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import '../src/index.css';

// useQuery 사용 컴포넌트용 격리 클라이언트 (스토리마다 새로 만든다).
const previewClient = () => new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  loaders: [mswLoader()],
  decorators: [
    (Story) => (
      <QueryClientProvider client={previewClient()}>
        <Story />
      </QueryClientProvider>
    ),
  ],
};

export default preview;
