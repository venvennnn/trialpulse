import { applyExtraction, type ExtractionJob, type ExtractionResult, type StoredField } from "@/domain/extraction";

export function finishExtractionJob(input: {
  fields: StoredField[];
  job: ExtractionJob;
  provider: ExtractionResult | { error: string };
}): { status: "applied" | "stale" | "failed"; fields: StoredField[]; message?: string } {
  if ("error" in input.provider) {
    return { status: "failed", fields: input.fields, message: input.provider.error };
  }
  const applied = applyExtraction(input.fields, input.job, input.provider);
  return applied.status === "stale"
    ? { status: "stale", fields: applied.fields, message: "Ignored a stale extraction for an older receipt revision." }
    : { status: "applied", fields: applied.fields };
}
