import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mongoose from "mongoose";
import "dotenv/config";

const MONGO_URI =
    process.env.MONGODB_URI || process.env.MONGODB_USER_URI || "";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

console.log("[boot]", {
    pid: process.pid,
    node: process.version,
    bun: (globalThis as any).Bun?.version,
    MONGO_URI: MONGO_URI ? "(set)" : "(missing)",
    TAVILY: TAVILY_API_KEY ? "set" : "empty",
});

function toJsonStr(v: unknown, fallback = "{}") {
    if (typeof v === "string") return v || fallback;
    try { return JSON.stringify(v ?? {}); } catch { return fallback; }
}

let mongooseReady = false;

async function initMongoose() {
    if (mongooseReady) return;
    if (!MONGO_URI) throw new Error("MONGODB_URI not set");
    console.time("[mongo] connect");
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) throw new Error("Mongoose connection db is undefined");
    await db.admin().command({ ping: 1 });
    mongooseReady = true;
    console.timeEnd("[mongo] connect");
    console.log("[mongo] ping ok");
}

async function getCol(dbName: string, collName: string) {
    await initMongoose();
    const base = mongoose.connection;
    const db =
        dbName && dbName !== base.name ? base.useDb(dbName, { useCache: true }) : base;
    console.log("[mongo] getCol", { db: db.name, coll: collName });
    return db.collection(collName);
}


type SearchItem = { title: string; url: string; snippet: string };

async function tavilySearch(q: string, maxResults = 5, depth: "basic" | "advanced" = "basic") {
    if (!TAVILY_API_KEY) return ddgFallback(q, maxResults);
    try {
        const r = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": TAVILY_API_KEY },
            body: JSON.stringify({ query: q, search_depth: depth, max_results: maxResults })
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        const data: any = await r.json();
        return (data.results ?? [])
            .slice(0, maxResults)
            .map((x: any, i: number) => `${i + 1}. ${x.title}\n${x.url}\n${x.content}`)
            .join("\n\n");
    } catch (e) {
        console.warn("[agent:web] Tavily failed, falling back:", (e as any)?.message || e);
        return ddgFallback(q, maxResults);
    }
}

async function ddgFallback(q: string, maxResults: number) {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        headers: { "user-agent": "mcp-web-mongo/1.0" }
    });
    const html = await r.text();
    const out: SearchItem[] = [];
    const rx = /<a rel="nofollow" class="result__a" href="([^"]+)".*?>(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) && out.length < maxResults) {
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, "");
        const snippet = (m[3] ?? "").replace(/<[^>]+>/g, "");
        out.push({ title, url, snippet });
    }
    return out;
}

async function safeWebSearch(q: string, maxResults: number, depth: "basic" | "advanced") {
    if (!TAVILY_API_KEY) {
        console.warn("[web] Tavily key missing — falling back to DuckDuckGo");
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

async function readWithJina(url: string) {
    const safe = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${safe}`);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return await r.text();
}

const server = new McpServer({ name: "web-mongo", version: "1.0.0" });

server.registerTool(
    "web_search",
    {
        title: "Web Search",
        description: "Search the web and return top results.",
        inputSchema: {
            q: z.string().min(1),
            maxResults: z.number().int().min(1).max(10).default(5),
            depth: z.enum(["basic", "advanced"]).default("basic"),
        },
    },
    async ({ q, maxResults, depth }) => {
        const results: SearchItem[] = await safeWebSearch(q, maxResults, depth);

        console.log("[tool] web_search", { q, maxResults, depth });

        return {
            content: [
                {
                    type: "text",
                    text:
                        `Results for: ${q}\n` +
                        results
                            .map((r: SearchItem, i: number) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`)
                            .join("\n\n"),
                },
                ...results.slice(0, maxResults).map((r: SearchItem) => ({
                    type: "resource_link" as const,
                    uri: r.url,
                    name: r.title,
                    description: r.snippet,
                    mimeType: "text/html",
                })),
            ],
        };
    }
);

server.registerTool(
    "fetch_url",
    {
        title: "Fetch URL (Reader)",
        description: "Fetch page content via r.jina.ai for clean text/markdown.",
        inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
        console.log("[tool] fetch_url", { url });
        return { content: [{ type: "text", text: await readWithJina(url) }] };
    }
);

server.registerTool(
    "mongo_find",
    {
        title: "MongoDB Find",
        description: "find() with JSON filter/projection/sort/limit",
        inputSchema: {
            db: z.string(),
            collection: z.string(),
            filter: z.any().optional(),
            projection: z.any().optional(),
            sort: z.any().optional(),
            limit: z.number().int().min(1).max(100).default(20),
        },
    },
    async ({ db, collection, filter, projection, sort, limit }) => {
        const col = await getCol(db, collection);
        const f = JSON.parse(toJsonStr(filter, "{}"));
        const p = JSON.parse(toJsonStr(projection, "{}"));
        const s = JSON.parse(toJsonStr(sort, "{}"));
        const docs = await col.find(f, { projection: p }).sort(s).limit(limit).toArray();
        console.log("[tool] mongo_find", { db, collection, limit });
        return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
    }
);

server.registerTool(
    "mongo_insertOne",
    {
        title: "MongoDB Insert One",
        description: "Insert a single document.",
        inputSchema: {
            db: z.string(),
            collection: z.string(),
            document: z.string(),
        },
    },
    async ({ db, collection, document }) => {
        const col = await getCol(db, collection);
        const res = await col.insertOne(JSON.parse(document));
        console.log("[tool] mongo_insertOne", { db, collection });
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
);

server.registerTool(
    "mongo_updateOne",
    {
        title: "MongoDB Update One",
        description: "Update one doc with operators. Upsert optional.",
        inputSchema: {
            db: z.string(),
            collection: z.string(),
            filter: z.any(),
            update: z.any(),
            upsert: z.boolean().default(false),
        },
    },
    async ({ db, collection, filter, update, upsert }) => {
        const col = await getCol(db, collection);
        const f = JSON.parse(toJsonStr(filter, "{}"));
        const u = JSON.parse(toJsonStr(update, "{}"));
        const res = await col.updateOne(f, u, { upsert });
        console.log("[tool] mongo_updateOne", { db, collection, upsert });
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
    }
);

server.registerTool(
    "hybrid_game_context",
    {
        title: "Hybrid Game Context (MongoDB + Web)",
        description: "Fetch game details from MongoDB and recent web results together.",
        inputSchema: {
            q: z.string().min(1),
            db: z.string(),
            collection: z.string(),
            filter: z.any().optional(),
            projection: z.any().optional(),
            limit: z.number().int().min(1).max(20).default(1),
            maxResults: z.number().int().min(1).max(5).default(3),
            depth: z.enum(["basic", "advanced"]).default("basic"),
        },
    },
    async ({ q, db, collection, filter, projection, limit, maxResults, depth }) => {
        const col = await getCol(db, collection);
        const f = JSON.parse(toJsonStr(filter, "{}"));
        const p = JSON.parse(toJsonStr(projection, "{}"));

        const [docs, web] = await Promise.all([
            col.find(f, { projection: p }).limit(limit).toArray(),
            safeWebSearch(q, maxResults, depth)
        ]);

        const webText = Array.isArray(web)
            ? web.map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.url}\n${r.snippet}`).join("\n\n")
            : String(web);

        const text = `[DB]
${JSON.stringify(docs, null, 2)}

[WEB]
Query: ${q}
${webText}`;

        return {
            content: [
                { type: "text", text },
                ...((Array.isArray(web) ? web : []).slice(0, maxResults).map((r: any) => ({
                    type: "resource_link" as const,
                    uri: r.url,
                    name: r.title,
                    description: r.snippet,
                    mimeType: "text/html",
                })))
            ]
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.log("[mcp] ready on stdio. Waiting for a client...");

process.on("SIGINT", async () => {
    await mongoose.disconnect();
    process.exit(0);
});

if (process.env.MCP_SELFTEST === "1") {
    (async () => {
        try {
            await initMongoose();
            const col = await getCol("test", "users");
            const count = await col.countDocuments();
            console.log("[selftest] users.countDocuments =", count);

            const txt = await (async () => {
                try { return await (await fetch("https://r.jina.ai/https://example.com")).text(); }
                catch { return ""; }
            })();
            console.log("[selftest] reader bytes =", txt.length);

            process.exit(0);
        } catch (e: any) {
            console.error("[selftest] error:", e?.message);
            process.exit(1);
        }
    })();
}

// safety
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));
