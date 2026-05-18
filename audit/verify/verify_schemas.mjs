#!/usr/bin/env node
/**
 * Layer 0: structural validation of every YAML data file against its
 * JSON Schema. Catches ~80% of categorical errors (missing fields,
 * wrong types, invalid enum values, malformed URLs) before any LLM
 * is involved.
 *
 * Pattern from CNCF landscape2 and Wikidata property constraints.
 *
 * Exit 0 on clean, 1 on any validation failure.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
// Use the 2020-12 variant; default Ajv export is draft-07.
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const TARGETS = [
  {
    yaml: "data/grants.yaml",
    schema: "audit/schemas/grants.schema.json",
  },
  {
    yaml: "data/funders.yaml",
    schema: "audit/schemas/funders.schema.json",
  },
  {
    yaml: "data/projects.yaml",
    schema: "audit/schemas/projects.schema.json",
  },
];

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

let totalErrors = 0;

for (const { yaml: yamlPath, schema: schemaPath } of TARGETS) {
  const yamlText = readFileSync(resolve(ROOT, yamlPath), "utf8");
  const data = yaml.load(yamlText);
  const schemaText = readFileSync(resolve(ROOT, schemaPath), "utf8");
  const schema = JSON.parse(schemaText);
  const validate = ajv.compile(schema);
  const ok = validate(data);
  if (!ok) {
    console.error(`\n[verify_schemas] ${yamlPath}: ${validate.errors.length} validation error(s):\n`);
    for (const err of validate.errors) {
      const where = err.instancePath || "(root)";
      console.error(`  ${where}: ${err.message}`);
      if (err.params) {
        const interesting = Object.entries(err.params).filter(
          ([k]) => k !== "ref"
        );
        if (interesting.length) {
          console.error(`    params: ${JSON.stringify(Object.fromEntries(interesting))}`);
        }
      }
    }
    totalErrors += validate.errors.length;
  } else {
    console.log(`[verify_schemas] ${yamlPath}: ok (${data[Object.keys(data)[0]].length} records)`);
  }
}

if (totalErrors === 0) {
  console.log("[verify_schemas] clean");
  process.exit(0);
} else {
  console.error(`\n[verify_schemas] ${totalErrors} total error(s). Fix the YAML and re-run.`);
  process.exit(1);
}
