export type StripeSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "paused";

export type RegistryBillingStatus =
  | "unknown"
  | "pending"
  | "trialing"
  | "active"
  | "past_due"
  | "suspended"
  | "canceled";

export type RegistryOperationalState =
  | "operational"
  | "warning"
  | "restricted"
  | "suspended";

export type RegistryBillingProfile = {
  registryId: string;
  organizationName: string;
  billingStatus: RegistryBillingStatus;
  operationalState: RegistryOperationalState;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  subscriptionStatus: StripeSubscriptionStatus | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  trialEnd: string | null;
  gracePeriodEndsAt: string | null;
  updatedAt: string | null;
};

export type RegistryBillingEventRecord = {
  id: string;
  event_id: string;
  registry_id: string | null;
  account_id: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  event_type: string;
  subscription_status: string | null;
  billing_status: string | null;
  payload_summary: string | null;
  created_at: string;
  processed_at: string;
};

export type BillingPortalSessionRecord = {
  id: string;
  portal_session_id: string;
  registry_id: string | null;
  account_id: string | null;
  stripe_customer_id: string;
  return_url: string;
  created_at: string;
};
