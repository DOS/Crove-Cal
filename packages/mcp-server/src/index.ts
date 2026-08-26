import prisma from "@calcom/prisma";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCroveCalMcpServer } from "./server";

export { createCroveCalMcpServer } from "./server";
export * from "./tools/bookings";
export * from "./tools/eventTypes";
export * from "./tools/slots";

export async function startStdioServer() {
  const mcpServer = createCroveCalMcpServer(prisma);
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  console.error("[crove-cal-mcp] Crove Cal MCP Server running on stdio transport.");
}

if (require.main === module) {
  startStdioServer().catch((error) => {
    console.error("[crove-cal-mcp] Fatal error starting MCP server:", error);
    process.exit(1);
  });
}
