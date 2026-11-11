import { isValidRegion, type Region } from "./regions";

export interface FieldCandidate {
  name: string;
  value: string | null;
  region: Region | null;
  unreadable: boolean;
  ambiguous: boolean;
}

export interface ExtractionResult {
  receiptId: string;
  contentHash: string;
  revision: number;
  extractorVersion: string;
  fields: FieldCandidate[];
}

export interface StoredField {
  name: string;
  candidateValue: string | null;
  correctedValue: string | null;
  region: Region | null;
  sourceRevision: number;
  correctedAtRevision: number | null;
  status: "candidate" | "corrected" | "unreadable";
}

export interface ExtractionJob {
  id: string;
  receiptId: string;
  contentHash: string;
  revision: number;
}

export function effectiveFieldValue(field: StoredField): string | null {
  if (field.correctedValue !== null && field.correctedAtRevision === field.sourceRevision) return field.correctedValue;
  return field.candidateValue;
}

export function correctField(fields: StoredField[], name: string, value: string, revision: number): StoredField[] {
  return fields.map((field) =>
    field.name === name
      ? { ...field, correctedValue: value, correctedAtRevision: revision, status: "corrected" as const }
      : field,
  );
}

/**
 * Apply an extraction only when the attachment revision and content hash still match.
 * Claimant corrections on that same revision are kept; the new candidate is stored beside them.
 */
export function applyExtraction(
  current: StoredField[],
  job: ExtractionJob,
  result: ExtractionResult,
): { status: "applied" | "stale"; fields: StoredField[] } {
  if (result.receiptId !== job.receiptId || result.revision !== job.revision || result.contentHash !== job.contentHash) {
    return { status: "stale", fields: current };
  }
  const next = current.map((field) => ({ ...field }));
  for (const incoming of result.fields) {
    const region = isValidRegion(incoming.region) ? incoming.region : null;
    const existing = next.find((field) => field.name === incoming.name);
    const status = incoming.unreadable ? "unreadable" : "candidate";
    if (!existing) {
      next.push({
        name: incoming.name,
        candidateValue: incoming.value,
        correctedValue: null,
        region,
        sourceRevision: result.revision,
        correctedAtRevision: null,
        status,
      });
      continue;
    }
    existing.candidateValue = incoming.value;
    existing.region = region ?? existing.region;
    existing.sourceRevision = result.revision;
    if (existing.correctedValue !== null && existing.correctedAtRevision === result.revision) {
      existing.status = "corrected";
    } else {
      existing.status = status;
    }
  }
  return { status: "applied", fields: next };
}

export function replaceAttachment(fields: StoredField[]): { fields: StoredField[]; history: StoredField[] } {
  return { fields: [], history: fields.map((field) => ({ ...field })) };
}
