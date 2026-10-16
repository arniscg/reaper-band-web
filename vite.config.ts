import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// REAPER web interface the dev server forwards /_/ to. Defaults to the mock
// (npm run mock); point it at real REAPER with e.g.
//   REAPER_URL=http://192.168.8.47:8080 npm run dev
const REAPER_URL = process.env.REAPER_URL ?? 'http://localhost:8080';

// Builds to one self-contained dist/index.html (JS and CSS inlined),
// so it can be copied into REAPER's reaper_www_root as a single file.
export default defineConfig({
  plugins: [preact(), viteSingleFile()],
  // Build time, part of the uploaded functions' fingerprint: when several
  // versions of the page are open, the newest build's functions win.
  define: { __BUILD_TIME__: JSON.stringify(Date.now()) },
  server: {
    host: true, // reachable from the iPad on the local network
    proxy: { '/_': REAPER_URL },
  },
});
