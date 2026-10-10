import type { Preview } from '@storybook/react';
import { mswLoader } from 'msw-storybook-addon/csf3';
import '../src/app/index.css';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
  },
  loaders: [mswLoader()],
};

export default preview;
