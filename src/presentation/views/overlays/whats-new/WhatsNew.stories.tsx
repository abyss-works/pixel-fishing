// 업데이트 소식 창 스토리 — 접속 흐름 없이 단계별 화면을 눈으로 확인한다.
// 소식은 길이가 실제에 가까운 샘플(범주 넷)과 현재 버전 노트 두 가지, 새 설정은 물고기 그래픽 질문.
import type { Meta, StoryObj } from '@storybook/react';
import Modal from '../../../ui/Modal';
import Button from '../../../ui/Button';
import CheckToggle from '../../../ui/CheckToggle';
import NewsStep from './NewsStep';
import SettingsStep from './SettingsStep';
import { PATCH_NOTES } from '../../../../game/content/patchnotes';
import type { PatchNote } from '../../../../game/content/patchnotes';
import { SETTING_PROMPTS } from '../../../../features/announcements/model/whatsNew';

const SAMPLE: PatchNote = {
  version: '0.10.0',
  date: '2026-10-16',
  summary: '수배판과 유물, 그리고 마다가스카르',
  notes: [
    { tag: '기능', text: '항구마다 수배판이 생겼어요. 명성을 쌓아 해역 라이선스를 받으면 매일 바뀌는 의뢰를 수주하고 납품해 골드를 벌 수 있어요.' },
    { tag: '기능', text: '해역마다 지명 수배된 녀석이 하나씩 숨어 있어요. 의뢰 중에 조우하면 도전권을 받고, 타이밍 승부에서 이기면 납품까지 이어집니다.' },
    { tag: '기능', text: '가방에 유물 칸이 생겼어요. 가방 탭을 한 번 더 누르면 물고기 → 아이템 → 유물 순서로 넘어가요.' },
    { tag: 'UI', text: '[실험] 설정의 화면 항목에서 물고기 그래픽을 고를 수 있어요.' },
    { tag: 'UI', text: '입질이 오면 어군이 찌 쪽으로 몰려듭니다.' },
    { tag: '밸런스', text: '도전권이 두 시간 동안 유효해요. 마을에서 걷는 속도가 조금 빨라졌어요.' },
  ],
};

function Frame({ title, step, children, footer }: {
  title: string; step: string; children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <Modal title={title} onClose={() => {}}>
      <p className="text-2xs text-text-dim mb-3">{step}</p>
      {children}
      <div className="border-t border-line mt-3 pt-3 flex flex-col gap-2">{footer}</div>
    </Modal>
  );
}

const meta: Meta = { title: 'Overlays/WhatsNew' };
export default meta;
type Story = StoryObj;

export const News: Story = {
  render: () => (
    <Frame title="업데이트 소식" step="1 업데이트 소식 — 2 새 설정" footer={<>
      <CheckToggle checked={false} onChange={() => {}} label="다음 업데이트부터 소식을 자동으로 열지 않기" />
      <Button variant="primary" className="flex-1">다음: 새 설정 고르기</Button>
    </>}>
      <NewsStep news={SAMPLE} />
    </Frame>
  ),
};

export const CurrentRelease: Story = {
  render: () => (
    <Frame title="업데이트 소식" step="1 업데이트 소식" footer={<Button variant="primary">확인</Button>}>
      <NewsStep news={PATCH_NOTES[0]} />
    </Frame>
  ),
};

export const Settings: Story = {
  render: () => (
    <Frame title="새 설정" step="1 업데이트 소식 — 2 새 설정" footer={
      <div className="flex gap-2">
        <Button variant="ghost">이전</Button>
        <Button variant="primary" className="flex-1">완료</Button>
      </div>
    }>
      <SettingsStep prompts={SETTING_PROMPTS} />
    </Frame>
  ),
};
