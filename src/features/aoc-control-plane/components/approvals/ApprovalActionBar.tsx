import * as React from 'react';

const DISABLED_TOOLTIP = 'Command wiring not enabled in this read-only demo.';

export interface ApprovalActionBarProps {
  readonly disabled?: boolean;
  readonly onApprove?: (() => void) | undefined;
  readonly onReject?: (() => void) | undefined;
  readonly onRequestChanges?: (() => void) | undefined;
  readonly onEscalate?: (() => void) | undefined;
}

export function ApprovalActionBar({ disabled, onApprove, onReject, onRequestChanges, onEscalate }: ApprovalActionBarProps): React.ReactElement {
  return (
    <div className="aoc-approval-action-bar" role="group" aria-label="Approval actions">
      <button type="button" disabled={disabled || onApprove === undefined} title={onApprove === undefined ? DISABLED_TOOLTIP : 'Approve this request.'} onClick={onApprove}>
        Approve
      </button>
      <button type="button" disabled={disabled || onReject === undefined} title={onReject === undefined ? DISABLED_TOOLTIP : 'Reject this request.'} onClick={onReject}>
        Reject
      </button>
      <button
        type="button"
        disabled={disabled || onRequestChanges === undefined}
        title={onRequestChanges === undefined ? DISABLED_TOOLTIP : 'Request changes to this request.'}
        onClick={onRequestChanges}
      >
        Request changes
      </button>
      <button type="button" disabled={disabled || onEscalate === undefined} title={onEscalate === undefined ? DISABLED_TOOLTIP : 'Escalate this request.'} onClick={onEscalate}>
        Escalate
      </button>
    </div>
  );
}
