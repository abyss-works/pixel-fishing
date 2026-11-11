// 튜토리얼 창은 먼저 뜰 안내 창(업데이트 소식, 미끼 환불 안내)이 끝난 뒤에 뜬다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { resetTutorialSession, useTutorialTrigger } from '../../../../features/tutorial/service/tutorial';
import { markPromptsAnswered, resetAnnouncements, setLastSeenVersion } from '../../../../platform/adapters/announcements';
import { resetWhatsNewSession } from '../../../../features/announcements/service/whatsNew';
import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';
import { APP_VERSION } from '../../../../version';
import WhatsNewModal from '../whats-new/WhatsNewModal';
import TutorialModal from './TutorialModal';
import { newState } from '../../../../game/rules/logic';

function Harness({ after }: { after: boolean }) {
  useTutorialTrigger('village', true);
  return (
    <>
      <WhatsNewModal game={{ ...newState(), fame: 120 }} ready />
      <TutorialModal seen={[]} ready after={after} dispatch={() => {}} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  resetAnnouncements();
  resetWhatsNewSession();
  resetTutorialSession();
  // 소식 창이 뜰 차례가 아닌 접속 - 보지 않은 소식과 질문이 없다
  setLastSeenVersion(APP_VERSION);
  markPromptsAnswered(SETTING_PROMPTS.map(p => p.id));
});
afterEach(cleanup);

describe('튜토리얼 창의 차례', () => {
  it('미끼 환불 안내가 남아 있으면 뜨지 않고, 끝나면 뜬다', () => {
    const { rerender } = render(<Harness after />);
    expect(screen.queryByText('마을에 오신 걸 환영해요')).not.toBeInTheDocument();
    act(() => rerender(<Harness after={false} />));
    expect(screen.getByText('마을에 오신 걸 환영해요')).toBeInTheDocument();
  });
});
