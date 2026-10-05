// Client side of the bridge protocol (documented in reaper/BandRemote_Bridge.lua).
// Requests are serialized: one in flight at a time, since the bridge has a
// single req/resp slot.

import { request, extValue } from './web';
import { scripts, scriptsHash } from './scripts';

export const SECTION = 'BandRemote';

/** Request chars per SET command. REAPER's web server keeps only ~1024
 *  characters of a value (measured), so stay well below that. */
const CHUNK = 900;
const RESPONSE_POLL_MS = 100;
/** Saving a big project or a first action lookup can take a few seconds. */
const TIMEOUT_MS = 15000;

export class BridgeError extends Error {}

let chain: Promise<unknown> = Promise.resolve();
let counter = 0;

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(job, job);
  chain = run.catch(() => undefined);
  return run;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(kind: 'def' | 'seal' | 'call', name: string, payload: string): Promise<unknown> {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}`;
  const data = toBase64Url(`${kind} ${name}\n${payload}`);
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));

  for (let i = 0; i < chunks.length; i++) {
    await request([`SET/EXTSTATE/${SECTION}/c${i}/${chunks[i]}`]);
  }
  await request([`SET/EXTSTATE/${SECTION}/req/${id}:${chunks.length}:${data.length}`]);

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(RESPONSE_POLL_MS);
    const head = extValue(await request([`GET/EXTSTATE/${SECTION}/resp`]), 'resp') ?? '';
    const m = /^([^|]*)\|(\d+)\|([\s\S]*)$/.exec(head);
    if (!m || m[1] !== id) continue;

    let json = m[3];
    const count = Number(m[2]);
    if (count > 1) {
      const keys = Array.from({ length: count - 1 }, (_, i) => `resp${i + 1}`);
      const lines = await request(keys.map((k) => `GET/EXTSTATE/${SECTION}/${k}`));
      for (const k of keys) json += extValue(lines, k) ?? '';
    }
    const body = JSON.parse(json) as { ok: boolean; result?: unknown; error?: string };
    if (!body.ok) throw new BridgeError(body.error ?? 'Bridge error');
    return body.result;
  }
  throw new BridgeError(`REAPER bridge did not answer "${name}" within ${TIMEOUT_MS / 1000} s`);
}

/** Call a bridge function (reaper/functions/<name>.lua) with JSON arguments. */
export function call<T = unknown>(name: string, args: object = {}): Promise<T> {
  return enqueue(() => send('call', name, JSON.stringify(args)) as Promise<T>);
}

/** Upload every function as-is, then seal the set with its hash. */
export function uploadScripts(): Promise<void> {
  return enqueue(async () => {
    for (const s of scripts) await send('def', s.name, s.source);
    await send('seal', scriptsHash, '');
  });
}

export { scriptsHash };
