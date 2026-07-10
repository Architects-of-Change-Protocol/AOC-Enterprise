import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createEnterpriseRequestListener } from '../adapters/node-http-adapter.js';
import { createEnterprise, type AocEnterprise, type CreateEnterpriseOptions } from '../composition/composition-root.js';

export interface EnterpriseServer {
  readonly enterprise: AocEnterprise;
  readonly server: Server;
  listen(): Promise<{ readonly port: number; readonly host: string }>;
  close(): Promise<void>;
}

/**
 * Boots the Enterprise Kernel as a production HTTP service: composes an
 * `AocEnterprise` (`composition/composition-root.ts`) and binds it to a
 * plain `node:http` server -- no web framework dependency, consistent with
 * the rest of this package. `scripts/run-enterprise-host.mjs` is the CLI
 * entry point that calls this from the built `dist/` output. The HTTP
 * server consumes only the stable `AocEnterprise` interface -- it has no
 * visibility into how the Kernel, persistence, or providers were composed.
 */
export async function createEnterpriseServer(options: CreateEnterpriseOptions = {}): Promise<EnterpriseServer> {
  const enterprise = await createEnterprise(options);
  const server = createServer(createEnterpriseRequestListener(enterprise));

  return {
    enterprise,
    server,
    listen() {
      return new Promise((resolvePromise) => {
        server.listen(enterprise.configuration.http.port, enterprise.configuration.http.host, () => {
          enterprise.logger.info('enterprise.host.listening', {});
          // Read back the OS-assigned port (relevant when `http.port` is configured as
          // 0, e.g. in tests) rather than trusting the configured value blindly.
          const address = server.address() as AddressInfo;
          resolvePromise({ port: address.port, host: enterprise.configuration.http.host });
        });
      });
    },
    async close() {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
      });
      await enterprise.close();
    },
  };
}
