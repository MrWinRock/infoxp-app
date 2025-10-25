import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";

let clientPromise: Promise<Client> | null = null;

function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const id = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
        p.then(v => { clearTimeout(id); resolve(v); }, e => { clearTimeout(id); reject(e); });
    });
}

export function getMcpClient(): Promise<Client> {
    if (!clientPromise) {
        const remoteUrl = (process.env.MCP_ORIGIN || "").trim();
        const CONNECT_TIMEOUT_MS = Math.max(500, Number(process.env.MCP_CONNECT_TIMEOUT_MS ?? 1200));

        async function connectRemote(): Promise<Client> {
            let transport: any | null = null;
            if (remoteUrl.startsWith("http://") || remoteUrl.startsWith("https://")) {
                try {
                    const url = new URL(remoteUrl);
                    console.log("[mcp-client] connecting to remote (SSE)", { url: url.toString() });
                    transport = new SSEClientTransport(url);
                } catch (e) {
                    console.warn("[mcp-client] invalid MCP_ORIGIN URL, skipping remote:", (e as any)?.message || e);
                    return Promise.reject(new Error("invalid MCP_ORIGIN URL"));
                }
            } else if (remoteUrl.startsWith("ws://") || remoteUrl.startsWith("wss://")) {
                try {
                    const url = new URL(remoteUrl);
                    console.log("[mcp-client] connecting to remote (WebSocket)", { url: url.toString() });
                    transport = new WebSocketClientTransport(url);
                } catch (e) {
                    console.warn("[mcp-client] invalid MCP_ORIGIN URL, skipping remote:", (e as any)?.message || e);
                    return Promise.reject(new Error("invalid MCP_ORIGIN URL"));
                }
            } else {
                return Promise.reject(new Error("no remote MCP_ORIGIN url"));
            }
            const client = new Client({ name: "api-integrated", version: "1.0.0" });
            await client.connect(transport);
            return client;
        }

        async function connectLocal(): Promise<Client> {
            const transport = new StdioClientTransport({
                command: process.env.MCP_COMMAND || "bun",
                args: (process.env.MCP_ARGS && process.env.MCP_ARGS.split(" ")) || ["src/mcp/server.ts"],
                env: {
                    MONGODB_URI: process.env.MONGODB_URI || process.env.MONGODB_USER_URI || "",
                    TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",
                    MCP_ORIGIN: process.env.MCP_ORIGIN || "api-integrated"
                }
            });
            console.log("[mcp-client] spawning local MCP via stdio", {
                command: process.env.MCP_COMMAND || "bun",
                args: (process.env.MCP_ARGS && process.env.MCP_ARGS.split(" ")) || ["src/mcp/server.ts"],
                TAVILY: process.env.TAVILY_API_KEY ? "set" : "empty"
            });
            const client = new Client({ name: "api-integrated", version: "1.0.0" });
            await client.connect(transport);
            return client;
        }

        // Try remote first with a short timeout; on failure or timeout, fall back to local
        clientPromise = (async () => {
            try {
                if (remoteUrl) {
                    return await withTimeout(connectRemote(), CONNECT_TIMEOUT_MS, "mcp remote connect");
                }
            } catch (e: any) {
                console.warn("[mcp-client] remote connect failed:", e?.message || e);
            }
            return await connectLocal();
        })();
    }
    return clientPromise;
}