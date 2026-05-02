/**
 * Compile SBVR fact-type readings into regex templates with named role
 * captures and per-role casters. Used by the pattern-based lifter.
 */

export interface FactTypeShape {
  id: string;
  reading: string;
  arity: number;
  roles: Array<{ roleName: string; rolePlayer: string }>;
}

export interface FactTemplate {
  factTypeId: string;
  roles: string[];
  pattern: RegExp;
  caster: Record<string, (s: string) => unknown>;
}

const INTEGER_PLAYERS = new Set(["xsd:integer", "xsd:int"]);
const FLOAT_PLAYERS = new Set(["xsd:float", "xsd:decimal", "xsd:double"]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function compileFactTemplates(factTypes: FactTypeShape[]): FactTemplate[] {
  return factTypes.map((ft) => {
    const tokens = ft.reading.split(/\s+/);
    const roleSet = new Set(ft.roles.map((r) => r.roleName));
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const tok of tokens) {
      if (roleSet.has(tok) && !seen.has(tok)) {
        seen.add(tok);
        parts.push(`(?<${tok}>.+?)`);
      } else {
        parts.push(escapeRegex(tok));
      }
    }
    // Roles not mentioned in the reading text get appended as trailing captures
    // (covers n-ary fact types where some roles are implied).
    for (const r of ft.roles) {
      if (!seen.has(r.roleName)) parts.push(`(?<${r.roleName}>\\S+)`);
    }
    const pattern = new RegExp(`^${parts.join("\\s+")}\\s*$`, "i");

    const caster: Record<string, (s: string) => unknown> = {};
    for (const r of ft.roles) {
      if (INTEGER_PLAYERS.has(r.rolePlayer)) caster[r.roleName] = (s) => parseInt(s, 10);
      else if (FLOAT_PLAYERS.has(r.rolePlayer)) caster[r.roleName] = (s) => parseFloat(s);
      else caster[r.roleName] = (s) => s.trim();
    }

    return { factTypeId: ft.id, roles: ft.roles.map((r) => r.roleName), pattern, caster };
  });
}
