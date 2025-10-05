import "dotenv/config";
import { spawn } from "child_process";

console.log(`[debug] Initial LLM_MODEL from process.env: ${process.env.LLM_MODEL}`);

const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const MODEL = process.env.LLM_MODEL || "MrWinRock/infoxp";

function log(...args: any[]) {
    console.log("[start]", ...args);
}

async function modelExists(model: string): Promise<boolean> {
    try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`);
        if (!r.ok) return false;
        const data = await r.json() as any;
        const names: string[] = (data.models || []).map((m: any) => m.name);
        return names.some(n => n === model || n.startsWith(`${model}:`));
    } catch {
        return false;
    }
}

async function waitForOllama(model: string, timeoutMs = 15000, intervalMs = 1500) {
    log(`Checking Ollama at ${OLLAMA_URL} for model "${model}"...`);
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await modelExists(model)) {
            log(`Ollama model "${model}" is available.`);
            return true;
        }
        await new Promise(r => setTimeout(r, intervalMs));
    }
    log(`Ollama not ready or model "${model}" not found.
- Ensure Ollama is running:    ollama serve
- Ensure model is pulled:      ollama pull ${model}`);
    return false;
}
function spawnProc(name: string, cmd: string, args: string[] = [], extraEnv: Record<string, string> = {}) {
    log(`Starting ${name}...`);
    const p = spawn(cmd, args, {
        stdio: "inherit",
        env: { ...process.env, ...extraEnv }
    });
    p.on("exit", (code) => {
        log(`${name} exited with code ${code}`);
        process.exit(code ?? 1);
    });
    return p;
}

await waitForOllama(MODEL);

const api = spawnProc("api", "bun", ["src/index.ts"]);
const mcp = spawnProc("mcp", "bun", ["src/mcp/server.ts"]);

const shutdown = (sig: string) => {
    log(`Received ${sig}, shutting down...`);
    try { api.kill(); } catch { }
    try { mcp.kill(); } catch { }
    setTimeout(() => process.exit(0), 1500).unref();
};
["SIGINT", "SIGTERM"].forEach(s => process.on(s, () => shutdown(s)));