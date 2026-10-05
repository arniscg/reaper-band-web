#!/usr/bin/env node
// Talk to a running Band Remote bridge from the command line, using the same
// protocol as the page (see reaper/BandRemote_Bridge.lua).
//
//   node tools/bridge.mjs <reaper-url> run <file.lua> [json-args]
//       upload the file as a function (named after the file) and call it
//   node tools/bridge.mjs <reaper-url> call <name> [json-args]
//       call an already uploaded function
//   node tools/bridge.mjs <reaper-url> status
//
// Example: node tools/bridge.mjs http://192.168.8.45:8080 run reaper/dev/probeLanes.lua

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const [base, cmd, ...rest] = process.argv.slice(2);
if (!base || !cmd) {
  console.error('usage: bridge.mjs <reaper-url> run <file.lua> [json] | call <name> [json] | status');
  process.exit(2);
}

const SECTION = 'BandRemote';
const CHUNK = 900;

async function request(commands) {
  const res = await fetch(`${base}/_/${commands.join(';')}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.text()).split('\n').filter(Boolean).map((l) => l.split('\t'));
}

const unescape = (s) => s.replace(/\\(.)/g, (_, c) => (c === 't' ? '\t' : c === 'n' ? '\n' : c));
const ext = async (key) => {
  const line = (await request([`GET/EXTSTATE/${SECTION}/${key}`]))[0];
  return line ? unescape(line[3] ?? '') : '';
};

async function send(kind, name, payload) {
  const id = `cli${Date.now().toString(36)}`;
  const data = Buffer.from(`${kind} ${name}\n${payload}`).toString('base64url');
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));
  for (let i = 0; i < chunks.length; i++) await request([`SET/EXTSTATE/${SECTION}/c${i}/${chunks[i]}`]);
  await request([`SET/EXTSTATE/${SECTION}/req/${id}:${chunks.length}:${data.length}`]);
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    const head = await ext('resp');
    const m = /^([^|]*)\|(\d+)\|([\s\S]*)$/.exec(head);
    if (!m || m[1] !== id) continue;
    let json = m[3];
    for (let i = 1; i < Number(m[2]); i++) json += await ext(`resp${i}`);
    return JSON.parse(json);
  }
  throw new Error('no answer from the bridge within 30 s');
}

let result;
if (cmd === 'status') {
  result = JSON.parse((await ext('status')) || 'null');
} else if (cmd === 'run') {
  const [file, args = '{}'] = rest;
  const name = basename(file).replace(/\.lua$/, '');
  const def = await send('def', name, readFileSync(file, 'utf8'));
  if (!def.ok) result = def;
  else result = await send('call', name, args);
} else if (cmd === 'call') {
  const [name, args = '{}'] = rest;
  result = await send('call', name, args);
} else {
  console.error(`unknown command: ${cmd}`);
  process.exit(2);
}

if (result && result.ok === false) {
  console.error(result.error);
  process.exit(1);
}
console.log(JSON.stringify(result && 'result' in result ? result.result : result, null, 2));
