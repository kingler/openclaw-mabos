/**
 * IRC Stage Output Validator — validates structural integrity of each
 * ideation pipeline stage output. Reuses the GDC ValidationError so the
 * orchestrator's retry-with-feedback loop is identical across pipelines.
 */

import { ValidationError } from "../gdc/validator.js";

export { ValidationError };

const BMC_BLOCKS = [
  "customer_segments",
  "value_propositions",
  "channels",
  "customer_relationships",
  "revenue_streams",
  "key_resources",
  "key_activities",
  "key_partners",
  "cost_structure",
] as const;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function nonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Validate a research finding has a source or is explicitly unverified. */
function checkFindings(findings: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(findings)) {
    errors.push(`${label} must be an array`);
    return;
  }
  findings.forEach((f, i) => {
    if (!isObject(f)) {
      errors.push(`${label}[${i}] must be an object`);
      return;
    }
    const hasSources = Array.isArray(f.sources) && f.sources.length > 0;
    if (!hasSources && f.unverified !== true) {
      errors.push(`${label}[${i}] has no sources and is not flagged unverified`);
    }
  });
}

/**
 * Validate an IRC stage output. Throws ValidationError with structured
 * feedback that the orchestrator appends to a retry prompt.
 */
export function validate(stageNumber: number, output: unknown): void {
  const errors: string[] = [];

  if (!isObject(output)) {
    throw new ValidationError(stageNumber, ["output is not an object"]);
  }

  switch (stageNumber) {
    case 1: {
      if (!nonEmptyString(output.problem_statement)) errors.push("problem_statement is required");
      if (!Array.isArray(output.riskiest_assumptions) || output.riskiest_assumptions.length < 1) {
        errors.push("riskiest_assumptions must list at least one assumption");
      }
      if (!Array.isArray(output.jobs_to_be_done)) errors.push("jobs_to_be_done must be an array");
      break;
    }
    case 2: {
      checkFindings(output.findings, "findings", errors);
      checkFindings(output.trends, "trends", errors);
      checkFindings(output.regulatory, "regulatory", errors);
      if (output.mode !== "researched" && output.mode !== "analyst-only") {
        errors.push('mode must be "researched" or "analyst-only"');
      }
      if (!isObject(output.sizing)) errors.push("sizing block is required");
      break;
    }
    case 3: {
      if (!Array.isArray(output.competitors)) {
        errors.push("competitors must be an array");
      } else {
        output.competitors.forEach((c, i) => {
          if (!isObject(c) || !nonEmptyString(c.name)) {
            errors.push(`competitors[${i}] must have a name`);
          }
        });
      }
      break;
    }
    case 4: {
      const scores = output.scores;
      if (!isObject(scores)) {
        errors.push("scores object is required");
      } else {
        for (const dim of ["desirability", "viability", "feasibility"]) {
          if (typeof scores[dim] !== "number") errors.push(`scores.${dim} must be a number`);
        }
      }
      if (typeof output.confidence !== "number" || output.confidence < 0 || output.confidence > 1) {
        errors.push("confidence must be a number in [0,1]");
      }
      if (!["go", "refine", "pivot"].includes(output.recommendation as string)) {
        errors.push('recommendation must be "go", "refine", or "pivot"');
      }
      break;
    }
    case 5: {
      const bmc = output.bmc;
      if (!isObject(bmc)) {
        errors.push("bmc object is required");
      } else {
        for (const block of BMC_BLOCKS) {
          if (!Array.isArray(bmc[block])) errors.push(`bmc.${block} must be an array`);
        }
      }
      if (!nonEmptyString(output.mission)) errors.push("mission is required");
      if (!nonEmptyString(output.vision)) errors.push("vision is required");
      if (!Array.isArray(output.values)) errors.push("values must be an array");
      break;
    }
    default:
      errors.push(`Unknown IRC stage: ${stageNumber}`);
  }

  if (errors.length > 0) {
    throw new ValidationError(stageNumber, errors);
  }
}
