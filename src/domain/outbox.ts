export type JobType = "extract_receipt" | "submit_payout" | "reconcile_payout";
export type JobState = "pending" | "leased" | "succeeded" | "failed" | "dead";

export interface OutboxJob {
  id: string;
  workspaceId: string;
  jobType: JobType;
  dedupeKey: string;
  payload: Record<string, unknown>;
  state: JobState;
  attempts: number;
  leaseExpiresAt: string | null;
  lastError: string | null;
  leaseOwner: string | null;
}

export function enqueueJob(jobs: OutboxJob[], job: OutboxJob): OutboxJob[] {
  if (jobs.some((existing) => existing.dedupeKey === job.dedupeKey && existing.state !== "succeeded" && existing.state !== "dead")) {
    return jobs;
  }
  return [...jobs, job];
}

/** Lease pending jobs, and jobs whose lease has expired, in stable id order. */
export function leaseJobs(jobs: OutboxJob[], nowIso: string, owner: string, limit: number, leaseMs: number): OutboxJob[] {
  const now = Date.parse(nowIso);
  const available = jobs
    .filter((job) => {
      if (job.state === "pending") return true;
      if (job.state === "leased" && job.leaseExpiresAt && Date.parse(job.leaseExpiresAt) <= now) return true;
      return false;
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, limit);
  const leasedIds = new Set(available.map((job) => job.id));
  return jobs.map((job) =>
    leasedIds.has(job.id)
      ? {
          ...job,
          state: "leased",
          attempts: job.attempts + 1,
          leaseExpiresAt: new Date(now + leaseMs).toISOString(),
          leaseOwner: owner,
        }
      : job,
  );
}
