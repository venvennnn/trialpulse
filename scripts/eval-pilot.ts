import { mkdirSync, writeFileSync } from "node:fs";
import { buildManifest } from "../src/eval/manifest";
import { evaluationReport } from "../src/eval/metrics";

const manifest = buildManifest();
mkdirSync(new URL("../eval/", import.meta.url), { recursive: true });
writeFileSync(new URL("../eval/pilot-manifest.json", import.meta.url), JSON.stringify(manifest, null, 2));
console.log(evaluationReport());
console.log(`\nWrote eval/pilot-manifest.json (${manifest.claims.length} claims).`);
