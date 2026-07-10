import { createRuntimeHostServer } from '../dist/src/kernel-host/index.js';

const server = await createRuntimeHostServer();
const { host, port } = await server.listen();
console.log(`AOC Enterprise Kernel Runtime Host listening on http://${host}:${port}`);
console.log('Boot with zero registered actors/trust domains (fail-closed default) -- seed real governance data via the recognition/authority runtimes before routing production traffic.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
