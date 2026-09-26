#!/usr/bin/env node
// Blocks publishing if data/rates.json or data/news.json is broken. Run by every workflow.
import { readFile } from 'node:fs/promises';
import { validateRates, validateNews } from '../js/validate.js';

let failed = false;
for (const [file, check] of [['data/rates.json', validateRates], ['data/news.json', validateNews]]) {
  let problems;
  try {
    problems = check(JSON.parse(await readFile(new URL(`../${file}`, import.meta.url), 'utf8')));
  } catch (err) {
    problems = [`cannot read: ${err.message}`];
  }
  if (problems.length) {
    failed = true;
    console.error(`✖ ${file}\n  - ${problems.join('\n  - ')}`);
  } else {
    console.log(`✔ ${file}`);
  }
}
process.exit(failed ? 1 : 0);
