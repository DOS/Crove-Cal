#!/usr/bin/env node
import { startStdioServer } from "../src/index";

startStdioServer().catch((error) => {
  console.error("[crove-cal-mcp] Server error:", error);
  process.exit(1);
});
