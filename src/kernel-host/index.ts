/**
 * Transitional compatibility shim. The Enterprise Kernel Runtime Host that
 * used to live at `src/kernel-host/` (and the `@aoc-enterprise/runtime/kernel-host`
 * package export) has been renamed to `src/enterprise/`
 * (`@aoc-enterprise/runtime/enterprise`) -- see
 * `docs/enterprise/KERNEL_HOST_TO_ENTERPRISE_MIGRATION.md` and
 * `docs/architecture/ADR-ENTERPRISE-HOST-NAMING.md`.
 *
 * This file re-exports the new module unchanged so existing imports of
 * `@aoc-enterprise/runtime/kernel-host` keep working during the
 * compatibility period. There is no duplicate implementation here -- update
 * imports to `@aoc-enterprise/runtime/enterprise` when convenient; this
 * shim is removed once no known consumer depends on the old path.
 */
export * from '../enterprise/index.js';
