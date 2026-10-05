// REAPER's built-in web interface API: GET /_/CMD;CMD;... returns lines of
// tab-separated tokens, the first token naming the command.
// Reference: REAPER's own web interface helper, spec/reference/main.js.

import type { NativeTrack, Transport } from './types';

/** Same as main.js: a request REAPER hasn't answered in 3 s counts as failed
 *  (e.g. a modal dialog on the laptop blocks the web server). One retry, since
 *  REAPER's web server runs on its main thread and can't answer while REAPER
 *  is briefly busy (saving the project, a long bridge function). */
const TIMEOUT_MS = 3000;
const RETRIES = 1;

/** Request timing, shown in the Setup diagnostics. */
export const requestStats = { count: 0, totalMs: 0, maxMs: 0, timeouts: 0, failures: 0 };

export class TimeoutError extends Error {}

// Like main.js, only one request is in flight at a time: everything (poll and
// bridge calls) goes through this queue.
let queue: Promise<unknown> = Promise.resolve();

export function request(commands: string[]): Promise<string[][]> {
  const run = queue.then(() => send(commands));
  queue = run.catch(() => undefined);
  return run;
}

async function send(commands: string[]): Promise<string[][]> {
  for (let attempt = 0; ; attempt++) {
    const t0 = performance.now();
    try {
      const res = await fetch(`/_/${commands.join(';')}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`REAPER web API: HTTP ${res.status}`);
      const text = await res.text();
      const ms = performance.now() - t0;
      requestStats.count++;
      requestStats.totalMs += ms;
      requestStats.maxMs = Math.max(requestStats.maxMs, ms);
      return text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => line.split('\t'));
    } catch (e) {
      const timedOut = (e as Error).name === 'TimeoutError';
      if (timedOut) requestStats.timeouts++;
      else requestStats.failures++;
      if (attempt < RETRIES) continue;
      if (timedOut) throw new TimeoutError(`REAPER's web server did not answer within ${TIMEOUT_MS / 1000} s (tried ${RETRIES + 1} times).`);
      throw e;
    }
  }
}

/** EXTSTATE / PROJEXTSTATE values come back with \t, \n and \\ escaped. */
export function unescapeValue(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === 't' ? '\t' : c === 'n' ? '\n' : c));
}

export function parseTransport(tok: string[]): Transport {
  return { state: Number(tok[1]), pos: Number(tok[2]), repeat: tok[3] !== '0' };
}

export function parseTrack(tok: string[]): NativeTrack {
  return { index: Number(tok[1]), name: tok[2], flags: Number(tok[3]) };
}

/** EXTSTATE line: EXTSTATE \t section \t key \t value */
export function extValue(lines: string[][], key: string): string | undefined {
  const line = lines.find((t) => t[0] === 'EXTSTATE' && t[2] === key);
  return line ? unescapeValue(line[3] ?? '') : undefined;
}
