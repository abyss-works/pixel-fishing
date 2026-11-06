// 낚시 상태 띠의 안내 문구 — 입력 장치 이름이 들어간 문구만 모바일에서 바뀐다
const STATUS = {
  wait: (device: string) => `입질을 기다리는 중이에요.\n“!”가 뜨면 ${device} 눌러 주세요.\n빨간 영역은 PERFECT, 노란 영역은 GOOD이에요.`,
  bite: () => '지금 눌러 주세요.\n빨간 영역이면 PERFECT, 노란 영역이면 GOOD이에요.',
  catch: () => '물고기를 끌어올리는 중이에요…',
};

export function statusText(phase: keyof typeof STATUS, mobile: boolean): string {
  return STATUS[phase](mobile ? '화면을' : '스페이스를');
}
