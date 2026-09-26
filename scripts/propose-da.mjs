#!/usr/bin/env node
// Turns .paysa/da-proposal.json (written by fetch-news.mjs) into a pull request that updates
// data/rates.json. A person reviews it and taps "Merge"; nothing reaches users before that.
// Runs on GitHub Actions with GH_TOKEN set. Uses execFileSync (no shell) so text from the web
// can never be run as a command.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { validateRates } from '../js/validate.js';

const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const p = JSON.parse(await readFile(new URL('../.paysa/da-proposal.json', import.meta.url), 'utf8'));
const RATES = new URL('../data/rates.json', import.meta.url);

const branch = `da-${p.from}-${p.rate}`;
if (run('git', ['ls-remote', '--heads', 'origin', branch])) {
  console.log(`Proposal ${branch} already open. Nothing to do.`);
  process.exit(0);
}

const rates = JSON.parse(await readFile(RATES, 'utf8'));
const entry = { from: p.from, rate: p.rate, status: 'notified', source: p.source };
const i = rates.da.findIndex(d => d.from === p.from);
if (i >= 0) rates.da[i] = entry; else rates.da.push(entry);
rates.version += 1;
rates.updated = new Date().toISOString().slice(0, 10);
delete rates.notice;
const problems = validateRates(rates);
if (problems.length) { console.error('Proposal would break rates.json:\n' + problems.join('\n')); process.exit(1); }

run('git', ['checkout', '-b', branch]);
await writeFile(RATES, JSON.stringify(rates, null, 2) + '\n');
run('git', ['add', 'data/rates.json']);
run('git', ['commit', '-m', `DA ${p.rate}% from ${p.from} (from official PIB release)`]);
run('git', ['push', 'origin', branch]);

const eff = new Date(p.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
const body = `### Official DA announcement detected

**DA ${p.previousRate}% → ${p.rate}%**, effective **${eff}**

Source: ${p.source}
> ${p.evidence.replace(/\n/g, ' ')}

${p.baseMatches === false ? '⚠️ **The release mentions a different existing rate than Paysa has. Check carefully.**\n' : ''}
#### Before you merge
1. Open the source link above. Check that it is a **PIB / Government** release.
2. Check that the new DA is **${p.rate}%** and the effective date is **${eff}**.
3. If both are right, tap **Merge pull request**. Every Paysa user gets the new rate within minutes.
4. If anything is wrong, tap **Close pull request**. Nothing changes for users.

_Opened automatically by the Paysa news robot._`;
await writeFile('pr-body.md', body);
const url = run('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', `Approve DA ${p.rate}% from ${eff}?`, '--body-file', 'pr-body.md']);
console.log('Opened', url);
