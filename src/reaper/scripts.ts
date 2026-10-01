// Every reaper/functions/*.lua file, imported as text and uploaded to the
// bridge as-is. Adding a file there is enough to make it callable.

const files = import.meta.glob('../../reaper/functions/*.lua', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Script {
  name: string;
  source: string;
}

export const scripts: Script[] = Object.entries(files)
  .map(([path, source]) => ({ name: path.split('/').pop()!.replace(/\.lua$/, ''), source }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** FNV-1a over all names and sources; the bridge reports it back after upload. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const scriptsHash = hash(scripts.map((s) => `${s.name}\n${s.source}`).join('\u0000'));
