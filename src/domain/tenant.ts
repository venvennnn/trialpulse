import { DomainError } from "./money";

export function assertSameWorkspace(actorWorkspaceId: string, resourceWorkspaceId: string): void {
  if (actorWorkspaceId !== resourceWorkspaceId) {
    throw new DomainError("FORBIDDEN", "That record is not in this workspace.");
  }
}

/** Private receipt keys are `{workspaceId}/{receiptId}/{file}`. */
export function receiptObjectKey(workspaceId: string, receiptId: string, fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || "receipt";
  const safeName = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.\./g, "_");
  return `${workspaceId}/${receiptId}/${safeName}`;
}

export function assertCanReadObject(actorWorkspaceId: string, objectKey: string): void {
  const workspaceId = objectKey.split("/")[0];
  if (!workspaceId || workspaceId !== actorWorkspaceId) {
    throw new DomainError("FORBIDDEN", "That receipt is not in this workspace.");
  }
}

export function rejectDemoAuthority(value: unknown): void {
  if (value && typeof value === "object" && "mode" in value && (value as { mode?: string }).mode === "demo") {
    throw new DomainError("FORBIDDEN", "Demo identifiers have no authority on provider routes.");
  }
}
