// 플레이 흐름 시뮬레이션 CLI — 해역 전환, 플레이 유형별 실제 일수, 최초 10분, 예외 흐름.
// 사용: pnpm balance:flow [transition|days|opening|exception] [--override 파일] [--json] [--loss4h N] [--legend-at N] [--axis idle|manual] [--max-days N] [--help]
// 제품 규칙을 그대로 불러 계산하며, 같은 인자의 출력은 항상 같다.
import { HELP, parseArgs, renderText, runFlow } from './balance/flow/report';

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
  } else {
    const result = runFlow(options);
    console.log(options.json ? JSON.stringify(result, null, 2) : renderText(result));
  }
} catch (e) {
  console.error(`오류: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
}
