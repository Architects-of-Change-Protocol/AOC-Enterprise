import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createRuntimeHostRequestListener } from '../adapters/node-http-adapter.js';
import { buildRuntimeHost, type RuntimeHost, type RuntimeHostOverrides } from '../dependency-injection/composition-root.js';

export interface RuntimeHostServer {
  readonly host: RuntimeHost;
  readonly server: Server;
  listen(): Promise<{ readonly port: number; readonly host: string }>;
  close(): Promise<void>;
}

/**
 * Boots the Enterprise Kernel as a production HTTP service: composes a
 * `RuntimeHost` (dependency-injection/composition-root.ts) and binds it to
 * a plain `node:http` server -- no web framework dependency, consistent
 * with the rest of this package. `scripts/run-kernel-host.mjs` is the CLI
 * entry point that calls this from the built `dist/` output.
 */
export async function createRuntimeHostServer(overrides: RuntimeHostOverrides = {}): Promise<RuntimeHostServer> {
  const host = await buildRuntimeHost(overrides);
  const server = createServer(createRuntimeHostRequestListener(host));

  return {
    host,
    server,
    listen() {
      return new Promise((resolvePromise) => {
        server.listen(host.configuration.http.port, host.configuration.http.host, () => {
          host.logger.info('runtime.host.listening', {});
          // Read back the OS-assigned port (relevant when `http.port` is configured as
          // 0, e.g. in tests) rather than trusting the configured value blindly.
          const address = server.address() as AddressInfo;
          resolvePromise({ port: address.port, host: host.configuration.http.host });
        });
      });
    },
    async close() {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      });
      await host.close();
    },
  };
}
