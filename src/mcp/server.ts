import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import mongoose from "mongoose";

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

async function tavilySearch(q: string, maxResults: number, depth: "basic" | "advanced") {
    const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": TAVILY_API_KEY },
        body: JSON.stringify({ query: q, search_depth: depth, max_results: maxResults })
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const data = await r.json() as any;
    const items: SearchItem[] = (data.results ?? []).map((x: any) => ({
        title: x.title, url: x.url, snippet: x.content
    }));
    return items;
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
        const results: SearchItem[] = TAVILY_API_KEY
            ? await tavilySearch(q, maxResults, depth)
            : await ddgFallback(q, maxResults);

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
            filter: z.string().default("{}"),
            projection: z.string().default("{}"),
            sort: z.string().default("{}"),
            limit: z.number().int().min(1).max(100).default(20),
        },
    },
    async ({ db, collection, filter, projection, sort, limit }) => {
        const col = await getCol(db, collection);
        const docs = await col
            .find(JSON.parse(filter), { projection: JSON.parse(projection) })
            .sort(JSON.parse(sort))
            .limit(limit)
            .toArray();
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
            filter: z.string(),
            update: z.string(),
            upsert: z.boolean().default(false),
        },
    },
    async ({ db, collection, filter, update, upsert }) => {
        const col = await getCol(db, collection);
        const res = await col.updateOne(JSON.parse(filter), JSON.parse(update), { upsert });
        console.log("[tool] mongo_updateOne", { db, collection, upsert });
        return { content: [{ type: "text", text: JSON.stringify(res, null, 2) }] };
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
