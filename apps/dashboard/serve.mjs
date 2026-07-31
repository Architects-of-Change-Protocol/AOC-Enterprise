// Zero-dependency static file server for the AOC Runtime Authority
// dashboard. This process serves only index.html; it never proxies,
// authenticates, or evaluates authority itself -- the browser talks
// directly to the Enterprise Host's real HTTP API (see index.html's "API
// base URL" field). Not for production hosting: no TLS, no compression, no
// caching headers beyond the defaults below.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number.parseInt(process.env.AOC_DASHBOARD_PORT ?? '4173', 10);

const server = createServer(async (req, res) => {
  try {
    const html = await readFile(join(here, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(`Failed to serve dashboard: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, () => {
  console.log(`AOC Runtime Authority dashboard on http://localhost:${port}`);
  console.log('Point it at a running AOC Enterprise Host (default http://localhost:8787) via the "API base URL" field.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
