// 낚시 상태 띠의 안내 문구 - 입력 장치 이름이 들어간 문구만 모바일에서 바뀐다.
// judge는 판정 영역(PERFECT, GOOD) 설명 줄이고, 띠가 좁은 스테이지에서 이 줄만 숨긴다.
interface StatusParts { lead: string; judge?: string }

const JUDGE = {
  wait: '빨간 영역은 PERFECT, 노란 영역은 GOOD이에요.',
  bite: '빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.',
};

const STATUS = {
  wait: (device: string): StatusParts => ({ lead: `입질을 기다리는 중이에요.\n“!”가 뜨면 ${device} 눌러 주세요.`, judge: JUDGE.wait }),
  bite: (): StatusParts => ({ lead: '지금 눌러 주세요.', judge: JUDGE.bite }),
  catch: (): StatusParts => ({ lead: '물고기를 끌어올리는 중이에요…' }),
};

export function statusParts(phase: keyof typeof STATUS, mobile: boolean): StatusParts {
  return STATUS[phase](mobile ? '화면을' : '스페이스를');
}
