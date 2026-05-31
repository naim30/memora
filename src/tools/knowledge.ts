import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import { paths } from "../config/config.js";

const Type = z.enum(["procedural", "semantic"]);
const Scope = z.enum(["global", "agent"]);

function resolveMemPath(
  type: z.infer<typeof Type>,
  scope: z.infer<typeof Scope> = "agent",
): string {
  return scope === "global"
    ? resolve(paths.globalMem, `${type}.md`)
    : resolve(paths.agentMem, `${type}.md`);
}

// ─── knowledge_read ─────────────────────────────────────────────────────────
const KnowledgeReadInput = z.object({
  type: Type.describe(
    "Knowledge category. 'procedural' = how-to rules and workflows. 'semantic' = facts and concepts.",
  ),
  scope: Scope.optional().describe(
    "Storage scope. 'agent' = private to this MCP's AGENT_NAME. 'global' = shared across every agent using this MCP. Defaults to 'agent'.",
  ),
});

async function handleKnowledgeRead(input: z.infer<typeof KnowledgeReadInput>) {
  const filePath = resolveMemPath(input.type, input.scope);
  if (!existsSync(filePath)) return { ok: true, content: "" };
  return { ok: true, content: readFileSync(filePath, "utf8") };
}

export const KnowledgeRead = {
  name: "knowledge_read",
  description:
    "Read the agent's procedural or semantic knowledge from markdown storage. Returns { ok, content } — content is empty if the file hasn't been written yet.",
  input: KnowledgeReadInput,
  handler: handleKnowledgeRead,
};

// ─── knowledge_write ────────────────────────────────────────────────────────
const KnowledgeWriteInput = z.object({
  type: Type.describe(
    "Knowledge category. 'procedural' = how-to rules and workflows. 'semantic' = facts and concepts.",
  ),
  scope: Scope.optional().describe(
    "Storage scope. 'agent' = private to this MCP's AGENT_NAME. 'global' = shared across every agent using this MCP. Defaults to 'agent'.",
  ),
  content: z
    .string()
    .describe(
      "Full file content as markdown. REPLACES the entire file — call knowledge_read first if you want to preserve existing entries.",
    ),
});

async function handleKnowledgeWrite(
  input: z.infer<typeof KnowledgeWriteInput>,
) {
  const filePath = resolveMemPath(input.type, input.scope);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, input.content, "utf8");
  return { ok: true, path: filePath };
}

export const KnowledgeWrite = {
  name: "knowledge_write",
  description:
    "Write the agent's procedural or semantic knowledge to markdown storage. OVERWRITES the entire file — call knowledge_read first if you want to preserve existing entries. Returns { ok, path }.",
  input: KnowledgeWriteInput,
  handler: handleKnowledgeWrite,
};
