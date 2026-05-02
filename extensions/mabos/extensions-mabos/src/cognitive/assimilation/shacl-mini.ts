/**
 * Minimal SHACL subset validator.
 *
 * Covers only the constraint forms used by shapes-sbvr.jsonld: sh:minCount,
 * sh:maxCount, sh:datatype, sh:minInclusive, sh:maxInclusive, sh:in. Hand-rolled
 * intentionally to avoid pulling in a full SHACL engine for ~6 constraint forms.
 *
 * If the shape file ever needs richer constraints (sh:pattern, sh:node, etc.),
 * upgrade to a real engine — don't extend this in place beyond simple additions.
 */

export interface PropertyConstraint {
  path: string;
  minCount?: number;
  maxCount?: number;
  datatype?: "xsd:string" | "xsd:integer" | "xsd:float" | "xsd:boolean";
  minInclusive?: number;
  maxInclusive?: number;
  in?: unknown[];
}

export interface ShapeNode {
  targetClass: string;
  properties: PropertyConstraint[];
}

export interface Violation {
  path: string;
  kind: "minCount" | "maxCount" | "datatype" | "range" | "in";
  message: string;
}

export interface ShaclResult {
  conforms: boolean;
  violations: Violation[];
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function checkDatatype(v: unknown, dt: string): boolean {
  switch (dt) {
    case "xsd:string":
      return typeof v === "string";
    case "xsd:integer":
      return typeof v === "number" && Number.isInteger(v);
    case "xsd:float":
      return typeof v === "number";
    case "xsd:boolean":
      return typeof v === "boolean";
    default:
      return true;
  }
}

export function validateAgainstShape(node: Record<string, unknown>, shape: ShapeNode): ShaclResult {
  const violations: Violation[] = [];
  for (const p of shape.properties) {
    const values = asArray(node[p.path]);
    if (p.minCount !== undefined && values.length < p.minCount) {
      violations.push({
        path: p.path,
        kind: "minCount",
        message: `expected ≥${p.minCount}, got ${values.length}`,
      });
      continue;
    }
    if (p.maxCount !== undefined && values.length > p.maxCount) {
      violations.push({
        path: p.path,
        kind: "maxCount",
        message: `expected ≤${p.maxCount}, got ${values.length}`,
      });
    }
    for (const v of values) {
      if (p.datatype && !checkDatatype(v, p.datatype)) {
        violations.push({
          path: p.path,
          kind: "datatype",
          message: `expected ${p.datatype}`,
        });
      }
      if (typeof v === "number") {
        if (p.minInclusive !== undefined && v < p.minInclusive) {
          violations.push({
            path: p.path,
            kind: "range",
            message: `<${p.minInclusive}`,
          });
        }
        if (p.maxInclusive !== undefined && v > p.maxInclusive) {
          violations.push({
            path: p.path,
            kind: "range",
            message: `>${p.maxInclusive}`,
          });
        }
      }
      if (p.in && !p.in.includes(v)) {
        violations.push({
          path: p.path,
          kind: "in",
          message: `not in {${p.in.join(",")}}`,
        });
      }
    }
  }
  return { conforms: violations.length === 0, violations };
}
