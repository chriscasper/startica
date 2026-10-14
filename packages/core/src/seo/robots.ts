/**
 * robots.txt as search engines read it (RFC 9309): groups per user agent, the most
 * specific matching group wins (else `*`), the longest matching rule wins, and Allow
 * wins a tie. `*` and `$` wildcards are supported.
 */

type Rule = { allow: boolean; path: string };
type Group = { agents: string[]; rules: Rule[] };

export function parseRobots(text: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value || key === "allow") current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function ruleMatches(rulePath: string, path: string): boolean {
  if (!rulePath) return false;
  const anchored = rulePath.endsWith("$");
  const pattern = (anchored ? rulePath.slice(0, -1) : rulePath).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(path);
}

/** The group that applies to a crawler: the one naming its token (case-insensitive), else `*`. */
function groupFor(groups: Group[], token: string): Group | null {
  const t = token.toLowerCase();
  return groups.find((g) => g.agents.includes(t)) ?? groups.find((g) => g.agents.includes("*")) ?? null;
}

/** Whether `token` (e.g. "GPTBot") may fetch `path` under these rules. No robots.txt (or no matching group) allows everything. */
export function robotsAllows(groups: Group[], token: string, path: string): boolean {
  const group = groupFor(groups, token);
  if (!group) return true;
  let best: Rule | null = null;
  for (const rule of group.rules) {
    if (!ruleMatches(rule.path, path)) continue;
    if (!best || rule.path.length > best.path.length || (rule.path.length === best.path.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

/** Whether a crawler has a group of its own (rather than falling under `*`). */
export function robotsNamesAgent(groups: Group[], token: string): boolean {
  return groups.some((g) => g.agents.includes(token.toLowerCase()));
}
