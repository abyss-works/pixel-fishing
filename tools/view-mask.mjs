import { readFileSync } from 'node:fs';
const [file, r0, r1, c0, c1] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').trim().split('\n');
const R0 = +r0, R1 = +(r1 ?? rows.length - 1), C0 = +(c0 ?? 0), C1 = +(c1 ?? rows[0].length - 1);
let ruler = '     ';
for (let c = C0; c <= C1; c++) ruler += c % 10 === 0 ? '|' : (c % 5 === 0 ? '+' : '.');
console.log(ruler);
for (let r = R0; r <= R1; r++) console.log(`r${String(r).padStart(2)} ${rows[r].slice(C0, C1 + 1)}   x=${C0 * 8}..${(C1 + 1) * 8}`);
