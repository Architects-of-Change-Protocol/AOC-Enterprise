export class ApprovalRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ApprovalRequirementNotFoundError extends ApprovalRuntimeError {
  constructor(approvalRequirementId: string) {
    super(`Approval requirement not found: ${approvalRequirementId}`);
  }
}

export class ApproverRuleNotFoundError extends ApprovalRuntimeError {
  constructor(approverRuleId: string) {
    super(`Approver rule not found: ${approverRuleId}`);
  }
}

export class ApprovalRequestNotFoundError extends ApprovalRuntimeError {
  constructor(approvalRequestId: string) {
    super(`Approval request not found: ${approvalRequestId}`);
  }
}

export class ApprovalDecisionNotFoundError extends ApprovalRuntimeError {
  constructor(approvalDecisionId: string) {
    super(`Approval decision not found: ${approvalDecisionId}`);
  }
}

export class ApprovalProofNotFoundError extends ApprovalRuntimeError {
  constructor(approvalProofId: string) {
    super(`Approval proof not found: ${approvalProofId}`);
  }
}

export class InvalidApprovalStatusTransitionError extends ApprovalRuntimeError {
  constructor(approvalRequestId: string, from: string, to: string) {
    super(`Invalid approval request status transition for ${approvalRequestId}: ${from} -> ${to}`);
  }
}
