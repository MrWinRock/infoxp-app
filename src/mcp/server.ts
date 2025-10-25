import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import "dotenv/config";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const WEB_BACKEND = (process.env.MCP_WEB_SEARCH_BACKEND || "ddg").toLowerCase() as "tavily" | "ddg";
const REQ_TIMEOUT_MS = Math.max(1000, Number(process.env.MCP_WEB_SEARCH_TIMEOUT_MS ?? 6000));

function withTimeout(ms: number) {
    const ctl = new AbortController();
    const id = setTimeout(() => ctl.abort(), ms).unref?.();
    return { signal: ctl.signal, done: () => clearTimeout(id as any) };
}

console.log("[boot]", {
    pid: process.pid,
    node: process.version,
    bun: (globalThis as any).Bun?.version,
    TAVILY: TAVILY_API_KEY ? "set" : "empty",
    ORIGIN: process.env.MCP_ORIGIN || "standalone",
});

type SearchItem = { title: string; url: string; snippet: string };

async function tavilySearch(
    q: string,
    maxResults = 5,
    depth: "basic" | "advanced" = "basic"
): Promise<SearchItem[]> {
    if (!TAVILY_API_KEY) return ddgFallback(q, maxResults);
    const t = withTimeout(REQ_TIMEOUT_MS);
    try {
        const r = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-api-key": TAVILY_API_KEY,
            },
            body: JSON.stringify({
                query: q,
                search_depth: depth,
                max_results: maxResults,
            }),
            signal: t.signal,
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        const data: any = await r.json();
        const items = Array.isArray(data?.results) ? data.results : [];
        return items.slice(0, maxResults).map((x: any) => ({
            title: String(x.title ?? ""),
            url: String(x.url ?? ""),
            snippet: String(x.content ?? x.snippet ?? ""),
        }));
    } catch (e) {
        console.warn("[web] Tavily failed — falling back:", (e as any)?.message || e);
        return ddgFallback(q, maxResults);
    } finally {
        t.done();
    }
}

async function ddgFallback(q: string, maxResults: number): Promise<SearchItem[]> {
    const t = withTimeout(REQ_TIMEOUT_MS);
    const r = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
        {
            headers: { "user-agent": "mcp-web-only/1.0" },
            signal: t.signal,
        }
    );
    const html = await r.text();
    const out: SearchItem[] = [];
    const rx =
        /<a rel="nofollow" class="result__a" href="([^"]+)".*?>(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) && out.length < maxResults) {
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, "");
        const snippet = (m[3] ?? "").replace(/<[^>]+>/g, "");
        out.push({ title, url, snippet });
    }
    t.done();
    return out;
}

async function safeWebSearch(
    q: string,
    maxResults: number,
    depth: "basic" | "advanced"
): Promise<SearchItem[]> {
    if (WEB_BACKEND === "ddg") {
        return ddgFallback(q, maxResults);
    }
    // tavily preferred
    if (!TAVILY_API_KEY) {
        console.warn("[web] Tavily key missing — using DuckDuckGo backend");
        return ddgFallback(q, maxResults);
    }
    try {
        return await tavilySearch(q, maxResults, depth);
    } catch (e: any) {
        console.warn("[web] Tavily failed — falling back to DuckDuckGo:", e?.message || e);
        try {
            return await ddgFallback(q, maxResults);
        } catch (e2: any) {
            console.error("[web] DuckDuckGo fallback failed:", e2?.message || e2);
            return [];
        }
    }
}

const server = new McpServer({ name: "web-only", version: "1.0.0" });

server.registerTool(
    "web_search",
    {
        title: "Web Search",
        description: "Search the web and return top results.",
    },
    async (extra: any): Promise<any> => {
        type Args = { q?: string; maxResults?: number; depth?: "basic" | "advanced" };

        const raw = extra ?? {};
        const params: any = raw.params ?? raw;
        const maybeArgs = params?.arguments ?? params ?? {};
        const args: Args =
            typeof maybeArgs === "string"
                ? (() => { try { return JSON.parse(maybeArgs); } catch { return {}; } })()
                : (maybeArgs as Args);

        try {
            console.log("[tool] web_search inbound", {
                hasParams: !!raw.params,
                paramKeys: Object.keys(params ?? {}),
                hasArguments: !!params?.arguments,
                argumentKeys: params?.arguments ? Object.keys(params.arguments) : [],
                q: (args as any)?.q,
            });
        } catch { }

        const query = args.q && String(args.q).trim() ? String(args.q).trim() : "";
        const mr = Math.min(Math.max(Number(args.maxResults ?? 5), 1), 10);
        const dp: "basic" | "advanced" = args.depth === "advanced" ? "advanced" : "basic";

        if (!query) {
            return { content: [{ type: "text" as const, text: "Missing required argument: q" }] } as any;
        }

        const started = Date.now();
        const results: SearchItem[] = await safeWebSearch(query, mr, dp);
        const ms = Date.now() - started;

        console.log("[tool] web_search", { q: query, maxResults: mr, depth: dp, backend: WEB_BACKEND, ms });

        const text =
            `Note: Using ${WEB_BACKEND} • ${ms} ms\n\n` +
            `Results for: ${query}\n` +
            results.map((r: SearchItem, i: number) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n");

        return { content: [{ type: "text" as const, text }] } as any;
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.log("[mcp] ready on stdio. Waiting for a client...");

// safety
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));