import HudPanel from '../../ui/hud/HudPanel';

/** 낚시 단계별 안내 문구 */
const STATUS = {
  wait: '입질을 기다리는 중이에요. “!”가 뜨면 스페이스를 눌러 주세요.\n빨간 영역은 PERFECT, 노란 영역은 GOOD이에요.',
  bite: '지금 눌러 주세요. 빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.',
  catch: '물고기를 끌어올리는 중이에요…',
} as const;

export type FishingStatusPhase = keyof typeof STATUS;

// 낚시 상태 띠 — 게임 프레임 아래 가운데의 반투명 노치 띠. 프레임(positioned) 안에 놓인다.
export default function FishingStatus({ phase }: { phase: FishingStatusPhase }) {
  return (
    <HudPanel className="absolute left-1/2 -translate-x-1/2 bottom-3 z-(--z-overlay)
                         max-w-[min(480px,calc(100%-24px))] px-3.5 py-1.5 whitespace-pre-line
                         text-sm text-center text-text pointer-events-none animate-overlay-in">
      {STATUS[phase]}
    </HudPanel>
  );
}
