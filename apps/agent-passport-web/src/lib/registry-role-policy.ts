import type { RegistryRole, RegistryPermission } from './buyer-account-types.js';

const ROLE_PERMISSIONS: Record<RegistryRole, RegistryPermission[]> = {
  owner: [
    'registry:view',
    'registry:update_profile',
    'registry:manage_team',
    'registry:invite_team',
    'registry:enroll_agent',
    'registry:generate_exports',
    'registry:download_exports',
    'registry:rotate_admin_access',
    'registry:recover_access',
    'registry:view_billing',
    'registry:manage_billing',
  ],
  admin: [
    'registry:view',
    'registry:update_profile',
    'registry:manage_team',
    'registry:invite_team',
    'registry:enroll_agent',
    'registry:generate_exports',
    'registry:download_exports',
    'registry:view_billing',
    'registry:manage_billing',
  ],
  member: [
    'registry:view',
    'registry:enroll_agent',
    'registry:generate_exports',
    'registry:download_exports',
  ],
  viewer: [
    'registry:view',
    'registry:download_exports',
  ],
  auditor: [
    'registry:view',
    'registry:generate_exports',
    'registry:download_exports',
  ],
};

export function getRegistryRolePermissions(role: RegistryRole): RegistryPermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(role: RegistryRole, permission: RegistryPermission): boolean {
  return getRegistryRolePermissions(role).includes(permission);
}

export function requireRegistryPermission(role: RegistryRole, permission: RegistryPermission): void {
  if (!roleHasPermission(role, permission)) {
    throw new Error(`Role '${role}' does not have permission '${permission}'.`);
  }
}
