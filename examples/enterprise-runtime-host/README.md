# Enterprise Runtime Host Starter

This starter shows the registry-free consumption model for an external AOC Enterprise Runtime host.

The host provides all runtime ports explicitly, creates a runtime with `createAocEnterpriseRuntime()`, and calls `evaluate()` or `enforce()` without bootstrapping any application framework or mutating a global adapter registry.

## Files

- `mock-ports.ts` provides in-memory mock implementations of the required host ports.
- `host-runtime.ts` composes the runtime from those explicit ports.
- `usage-example.ts` demonstrates a single enforcement call and decision handling.

## Replace the mocks

Production hosts should replace the mock ports with their own identity, capability, delegation, policy, audit, access-verification, and signing infrastructure. The runtime itself does not require a specific database, web framework, route handler, or application bootstrap.
