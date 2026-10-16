// Client side of the bridge protocol (documented in reaper/BandRemote_Bridge.lua).
// Requests from this page are serialized, one in flight at a time. Other pages
// may be open too: this page uses its own random request slot, and chunk and
// answer keys carry the request id.

import { request, extValue } from './web';
import { scripts, scriptsHash, BUILD_TIME, buildTimeOf } from './scripts';

export const SECTION = 'BandRemote';
/** Protocol version this page speaks; the bridge reports its own as status.v. */
export const BRIDGE_VERSION = 2;

/** Request chars per SET command. REAPER's web server keeps only ~1024
 *  characters of a value (measured), so stay well below that. */
const CHUNK = 900;
const RESPONSE_POLL_MS = 100;
/** The bridge serves this many request slots; each page picks one. */
const REQ_SLOTS = 8;
const SLOT = Math.floor(Math.random() * REQ_SLOTS);
/** Without an answer for this long, check the request wasn't overwritten by another page. */
const RESEND_AFTER_MS = 1000;
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
  // Unique across pages too: chunk and answer keys carry the id (bridge v2).
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const data = toBase64Url(`${kind} ${name}\n${payload}`);
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK) chunks.push(data.slice(i, i + CHUNK));

  for (let i = 0; i < chunks.length; i++) {
    await request([`SET/EXTSTATE/${SECTION}/c.${id}.${i}/${chunks[i]}`]);
  }
  const slotKey = `req.${SLOT}`;
  const req = `${id}:${chunks.length}:${data.length}`;
  await request([`SET/EXTSTATE/${SECTION}/${slotKey}/${req}`]);

  const deadline = Date.now() + TIMEOUT_MS;
  let resendAt = Date.now() + RESEND_AFTER_MS;
  while (Date.now() < deadline) {
    await sleep(RESPONSE_POLL_MS);
    if (Date.now() > resendAt) {
      // Another page using the same slot may have overwritten the request
      // before the bridge saw it. Write it again; the bridge never runs an
      // id twice, so this is safe even if it already ran.
      resendAt = Date.now() + RESEND_AFTER_MS;
      const current = extValue(await request([`GET/EXTSTATE/${SECTION}/${slotKey}`]), slotKey) ?? '';
      if (current !== req) {
        const answered = extValue(await request([`GET/EXTSTATE/${SECTION}/r.${id}`]), `r.${id}`);
        if (!answered) await request([`SET/EXTSTATE/${SECTION}/${slotKey}/${req}`]);
      }
    }
    const key = `r.${id}`;
    const head = extValue(await request([`GET/EXTSTATE/${SECTION}/${key}`]), key) ?? '';
    const m = /^(\d+)\|([\s\S]*)$/.exec(head);
    if (!m) continue;

    let json = m[2];
    const count = Number(m[1]);
    if (count > 1) {
      const keys = Array.from({ length: count - 1 }, (_, i) => `${key}.${i + 1}`);
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

export { scriptsHash, BUILD_TIME, buildTimeOf };
