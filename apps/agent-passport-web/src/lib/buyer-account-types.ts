export type BuyerAccountStatus = "active" | "disabled" | "deleted";

export type BuyerAccountRecord = {
  id: string;
  account_id: string;
  email: string;
  display_name: string | null;
  password_hash: string;
  status: BuyerAccountStatus;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type BuyerAccountPublic = {
  accountId: string;
  email: string;
  displayName: string | null;
  status: BuyerAccountStatus;
};

export type BuyerAccountSessionRecord = {
  id: string;
  session_id: string;
  session_token_hash: string;
  account_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
};

export type RegistryRole = "owner" | "admin" | "member" | "viewer" | "auditor";

export type RegistryMembershipStatus = "active" | "pending" | "removed";

export type RegistryAccountMembershipRecord = {
  id: string;
  registry_id: string;
  account_id: string;
  role: RegistryRole;
  status: RegistryMembershipStatus;
  invited_by_account_id: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RegistryTeamInvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type RegistryTeamInvitationRecord = {
  id: string;
  invitation_id: string;
  registry_id: string;
  invited_email: string;
  role: RegistryRole;
  invitation_token_hash: string;
  invited_by_account_id: string | null;
  status: RegistryTeamInvitationStatus;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

export type RegistryPermission =
  | "registry:view"
  | "registry:update_profile"
  | "registry:manage_team"
  | "registry:invite_team"
  | "registry:enroll_agent"
  | "registry:generate_exports"
  | "registry:download_exports"
  | "registry:rotate_admin_access"
  | "registry:recover_access";

export type RegistryAccessContext = {
  registryId: string;
  accessMode: "buyer_account" | "registry_admin_session" | "registry_access_token";
  account?: BuyerAccountPublic;
  membership?: {
    role: RegistryRole;
    permissions: RegistryPermission[];
  };
  legacyAccess?: boolean;
};
