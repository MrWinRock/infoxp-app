import express from "express";
import cors from "cors";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";

const MCP_COMMAND = process.env.MCP_COMMAND || "bun";
const MCP_ARGS = (process.env.MCP_ARGS && process.env.MCP_ARGS.split(" ")) || ["src/mcp/server.ts"];
const MCP_ORIGIN = (process.env.MCP_ORIGIN || "").trim();
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

let transport: any;
if (MCP_ORIGIN.startsWith("http://") || MCP_ORIGIN.startsWith("https://")) {
    try {
        const url = new URL(MCP_ORIGIN);
        console.log("[mcp-bridge] connecting to remote (SSE)", { url: url.toString() });
        transport = new SSEClientTransport(url);
    } catch (e) {
        console.warn("[mcp-bridge] invalid MCP_ORIGIN URL, falling back to local stdio:", (e as any)?.message || e);
    }
} else if (MCP_ORIGIN.startsWith("ws://") || MCP_ORIGIN.startsWith("wss://")) {
    try {
        const url = new URL(MCP_ORIGIN);
        console.log("[mcp-bridge] connecting to remote (WebSocket)", { url: url.toString() });
        transport = new WebSocketClientTransport(url);
    } catch (e) {
        console.warn("[mcp-bridge] invalid MCP_ORIGIN URL, falling back to local stdio:", (e as any)?.message || e);
    }
}

if (!transport) {
    transport = new StdioClientTransport({
        command: MCP_COMMAND,
        args: MCP_ARGS,
        env: {
            MONGODB_URI: process.env.MONGODB_URI || process.env.MONGODB_USER_URI || "",
            TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",
            MCP_ORIGIN: process.env.MCP_ORIGIN || "frontend-bridge"
        }
    });
    console.log("[mcp-bridge] spawning local MCP via stdio", { MCP_COMMAND, MCP_ARGS });
}

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

const PORT = Number(process.env.BRIDGE_PORT || 3030);
app.listen(PORT, () => console.log(`MCP bridge http://localhost:${PORT}`));
