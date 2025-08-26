import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const MCP_COMMAND = process.env.MCP_COMMAND || "bun";
const MCP_ARGS = (process.env.MCP_ARGS && process.env.MCP_ARGS.split(" ")) || ["src/mcp/server.ts"];
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const transport = new StdioClientTransport({
    command: MCP_COMMAND,
    args: MCP_ARGS,
    env: {
        MONGODB_URI: process.env.MONGODB_URI || process.env.MONGODB_USER_URI || "",
        TAVILY_API_KEY: process.env.TAVILY_API_KEY || ""
    }
});

const client = new Client({ name: "frontend-bridge", version: "1.0.0" });
await client.connect(transport);

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/api/mcp/tools", async (_req, res) => {
    const tools = await client.listTools();
    res.json(tools);
});

app.post("/api/mcp/tools/call", async (req, res) => {
    const { name, args } = req.body || {};
    if (!name) return res.status(400).json({ error: "name required" });
    try {
        const result = await client.callTool({ name, arguments: args || {} });
        res.json(result);
    } catch (e: any) {
        res.status(500).json({ error: e.message || "callTool failed" });
    }
});

const PORT = Number(process.env.PORT || 3030);
app.listen(PORT, () => console.log(`MCP bridge http://localhost:${PORT}`));
