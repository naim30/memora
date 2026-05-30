import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTool<S extends z.ZodObject<z.ZodRawShape>>(
  server: McpServer,
  name: string,
  description: string,
  schema: S,
  handler: (args: z.infer<S>) => Promise<unknown>,
) {
  server.registerTool(
    name,
    { description, inputSchema: schema.shape },
    async (args) => {
      try {
        const response = await handler(args);
        return {
          content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text", text: error }],
        };
      }
    },
  );
}
