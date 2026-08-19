import { createEnterpriseServer } from '../dist/src/enterprise/index.js';

const server = await createEnterpriseServer();
const { host, port } = await server.listen();
console.log(`Soberanía Enterprise Host listening on http://${host}:${port}`);
console.log('Boot with zero registered actors/trust domains (fail-closed default) -- seed real governance data via the recognition/authority runtimes before routing production traffic.');

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
