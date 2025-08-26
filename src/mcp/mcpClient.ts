import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let clientPromise: Promise<Client> | null = null;

export function getMcpClient(): Promise<Client> {
    if (!clientPromise) {
        const transport = new StdioClientTransport({
            command: process.env.MCP_COMMAND || "bun",
            args: (process.env.MCP_ARGS && process.env.MCP_ARGS.split(" ")) || ["src/mcp/server.ts"],
            env: {
                MONGODB_URI: process.env.MONGODB_URI || process.env.MONGODB_USER_URI || "",
                TAVILY_API_KEY: process.env.TAVILY_API_KEY || ""
            }
        });
        const client = new Client({ name: "api-integrated", version: "1.0.0" });
        clientPromise = client.connect(transport).then(() => client);
    }
    return clientPromise;
}