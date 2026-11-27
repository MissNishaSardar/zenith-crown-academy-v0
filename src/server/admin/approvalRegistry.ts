import {
  APPROVAL_ACTIONS,
  type ApprovalActionName,
} from "@/lib/auth/permissions";

export type ApprovalExecutor = (
  approvalId: string,
  actorId: string,
) => Promise<void>;

const notImplemented = (action: ApprovalActionName): ApprovalExecutor => {
  return async () => {
    throw new Error(`Approval executor for ${action} is not implemented yet.`);
  };
};

// Plain module with no server directive. The registry object lives here so
// server action files can import it for internal use without publishing it
// as an action. Every export of a use server file must be an async function.
export const approvalExecutors: Record<ApprovalActionName, ApprovalExecutor> =
  Object.fromEntries(
    APPROVAL_ACTIONS.map((action) => [action, notImplemented(action)]),
  ) as Record<ApprovalActionName, ApprovalExecutor>;
