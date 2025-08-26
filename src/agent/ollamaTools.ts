import { MongoClient } from "mongodb";

// ---- Env ----
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.LLM_MODEL || "llama3.2";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";

let mongo: MongoClient | null = null;
async function getMongo() {
    if (!mongo) {
        mongo = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 4000 });
        await mongo.connect();
    }
    return mongo;
}

// ---- Web helpers ----
async function tavilySearch(q: string, maxResults = 5, depth: "basic" | "advanced" = "basic") {
    if (!TAVILY_API_KEY) return ddgFallback(q, maxResults);
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
}

async function ddgFallback(q: string, maxResults: number) {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
        headers: { "user-agent": "ollama-tools/1.0" }
    });
    const html = await r.text();
    const rx = /<a rel="nofollow" class="result__a" href="([^"]+)".*?>(.*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>(.*?)<\/a>/g;
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rx.exec(html)) && out.length < maxResults) {
        const url = m[1];
        const title = m[2].replace(/<[^>]+>/g, "");
        const snippet = (m[3] ?? "").replace(/<[^>]+>/g, "");
        out.push(`${out.length + 1}. ${title}\n${url}\n${snippet}`);
    }
    return out.join("\n\n");
}

async function fetchUrlReader(url: string) {
    const safe = url.startsWith("http") ? url : `https://${url}`;
    const r = await fetch(`https://r.jina.ai/${safe}`);
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return await r.text();
}

async function mongoFind(db: string, collection: string, filter = "{}", projection = "{}", sort = "{}", limit = 20) {
    const cli = await getMongo();
    const col = cli.db(db).collection(collection);
    const docs = await col
        .find(JSON.parse(filter), { projection: JSON.parse(projection) })
        .sort(JSON.parse(sort))
        .limit(limit)
        .toArray();
    return JSON.stringify(docs, null, 2);
}

async function mongoInsertOne(db: string, collection: string, document: string) {
    const cli = await getMongo();
    const res = await cli.db(db).collection(collection).insertOne(JSON.parse(document));
    return JSON.stringify(res, null, 2);
}

async function mongoUpdateOne(db: string, collection: string, filter: string, update: string, upsert = false) {
    const cli = await getMongo();
    const res = await cli.db(db).collection(collection)
        .updateOne(JSON.parse(filter), JSON.parse(update), { upsert });
    return JSON.stringify(res, null, 2);
}

// ---- Tool schema advertised to Llama 3.2 ----
const tools = [
    {
        type: "function",
        function: {
            name: "web_search",
            description: "Search the web and return top results.",
            parameters: {
                type: "object",
                properties: {
                    q: { type: "string" },
                    maxResults: { type: "integer", minimum: 1, maximum: 10, default: 5 },
                    depth: { type: "string", enum: ["basic", "advanced"], default: "basic" }
                },
                required: ["q"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_url",
            description: "Fetch readable text for a URL via r.jina.ai.",
            parameters: {
                type: "object",
                properties: { url: { type: "string" } },
                required: ["url"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "mongo_find",
            description: "Run find() with JSON filter/projection/sort/limit.",
            parameters: {
                type: "object",
                properties: {
                    db: { type: "string" },
                    collection: { type: "string" },
                    filter: { type: "string", default: "{}" },
                    projection: { type: "string", default: "{}" },
                    sort: { type: "string", default: "{}" },
                    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 }
                },
                required: ["db", "collection"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "mongo_insertOne",
            description: "Insert a single document.",
            parameters: {
                type: "object",
                properties: {
                    db: { type: "string" },
                    collection: { type: "string" },
                    document: { type: "string" }
                },
                required: ["db", "collection", "document"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "mongo_updateOne",
            description: "Update a single document. Upsert optional.",
            parameters: {
                type: "object",
                properties: {
                    db: { type: "string" },
                    collection: { type: "string" },
                    filter: { type: "string" },
                    update: { type: "string" },
                    upsert: { type: "boolean", default: false }
                },
                required: ["db", "collection", "filter", "update"]
            }
        }
    }
] as const;

// ---- Execute tool by name ----
async function runTool(name: string, args: any): Promise<string> {
    if (name === "web_search") return tavilySearch(args.q, args.maxResults, args.depth);
    if (name === "fetch_url") return fetchUrlReader(args.url);
    if (name === "mongo_find") return mongoFind(args.db, args.collection, args.filter, args.projection, args.sort, args.limit);
    if (name === "mongo_insertOne") return mongoInsertOne(args.db, args.collection, args.document);
    if (name === "mongo_updateOne") return mongoUpdateOne(args.db, args.collection, args.filter, args.update, !!args.upsert);
    throw new Error(`Unknown tool ${name}`);
}

// ---- Chat + tool loop ----
type Msg =
    | { role: "system" | "user" | "assistant"; content: string }
    | { role: "tool"; content: string; name: string; tool_call_id: string };

export async function chatWithTools(prompt: string, history: Msg[] = []) {
    const messages: Msg[] = [
        { role: "system", content: "You can call tools to search the web, fetch URLs, and query MongoDB. Prefer precise queries." },
        ...history,
        { role: "user", content: prompt }
    ];

    for (let hop = 0; hop < 4; hop++) {
        const r = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ model: MODEL, messages, tools, stream: false, options: { temperature: 0.2 } })
        });
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        const data: any = await r.json();

        const msg = data?.message;
        const calls = msg?.tool_calls ?? [];

        if (msg?.content) messages.push({ role: "assistant", content: msg.content });

        if (!calls.length) return msg?.content || "";

        for (const call of calls) {
            const name = call.function?.name;
            const args = call.function?.arguments || {};
            const result = await runTool(name, args);
            messages.push({ role: "tool", name, tool_call_id: call.id, content: result });
        }
    }

    return "Tool loop limit reached.";
}
