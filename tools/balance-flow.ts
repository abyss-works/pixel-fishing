// 플레이 흐름 시뮬레이션 CLI — 해역 전환, 플레이 유형별 실제 일수, 최초 10분, 예외 흐름, 방치 EV, 게이트 검사.
// 사용: pnpm balance:flow [transition|days|opening|exception|ev|gates] [--override 파일] [--json] [--loss4h N] [--legend-at N] [--axis idle|manual] [--max-days N] [--bag-cap-awake] [--help]
// 제품 규칙을 그대로 불러 계산하며, 같은 인자의 출력은 항상 같다. gates는 위반이 있으면 종료 코드 1로 끝난다.
import { runCli } from './balance/flow/report';

const { stdout, stderr, exitCode } = runCli(process.argv.slice(2));
if (stdout) console.log(stdout);
if (stderr) console.error(stderr);
process.exitCode = exitCode;
