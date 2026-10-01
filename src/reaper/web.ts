// REAPER's built-in web interface API: GET /_/CMD;CMD;... returns lines of
// tab-separated tokens, the first token naming the command.
// Reference: REAPER's own web interface helper, spec/reference/main.js.

import type { NativeTrack, Transport } from './types';

/** Same as main.js: a request REAPER hasn't answered in 3 s counts as failed
 *  (e.g. a modal dialog on the laptop blocks the web server). */
const TIMEOUT_MS = 3000;

export async function request(commands: string[]): Promise<string[][]> {
  const res = await fetch(`/_/${commands.join(';')}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`REAPER web API: HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\t'));
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
