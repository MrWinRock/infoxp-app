# Chat and MCP Integration Guide

This document explains how chat requests are processed, how MCP tools are invoked, data persistence, and how to test the flow locally.

## Overview

- API entrypoint: [src/index.ts](src/index.ts)
- Chat handler: [`handleChatMessage`](src/controllers/chatController.ts)
- Persistence:
  - [`ChatSession`](src/models/chatSessionModel.ts)
  - [`ChatMessage`](src/models/chatMessageModel.ts)
- LLM integration: [`queryLLM`](src/services/llmService.ts) (streams model output)
- MCP client used by API: [`getMcpClient`](src/mcp/mcpClient.ts)
- MCP server and tools: [src/mcp/server.ts](src/mcp/server.ts)
- Optional MCP HTTP bridge for testing/dev: [src/mcp/bridge.ts](src/mcp/bridge.ts)
- Optional agent with tools (Ollama local): [src/agent/ollamaTools.ts](src/agent/ollamaTools.ts)
- Process spawner: [src/main.ts](src/main.ts)

## Request Flow (/api/chat)

1) Client POSTs to `/api/chat` with JSON:
   - Required: `message: string`
   - Optional: `userId`, `toolName`, `toolArgs` (to explicitly invoke an MCP tool)

2) Controller: [`handleChatMessage`](src/controllers/chatController.ts)
   - Ensures user identity:
     - If `userId` not provided, uses/creates a `guest` user.
     - Finds or creates a `ChatSession` for the user.
   - Persists the user message as a `ChatMessage`.
   - If `toolName` provided:
     - Calls MCP tool via [`getMcpClient`](src/mcp/mcpClient.ts) -> `client.callTool(...)`.
     - Saves a `ChatMessage` with `sender: "tool"` containing the tool’s JSON result.
     - Augments the LLM prompt with tool JSON.
     - On failure, logs error, saves a tool error message, and proceeds without tool data.
   - Streams LLM output back to client in plain text chunks:
     - Parses each NDJSON piece and writes `parsed.response` to the HTTP response.
     - On stream end/error, saves the final chatbot message (if available).

3) Response
   - Content-Type: `text/plain; charset=utf-8`
   - Transfer-Encoding: `chunked`
   - Body: streaming text produced by the LLM.

### Data Model

- [`ChatSession`](src/models/chatSessionModel.ts)
  - Fields: `user_id`, `session_started`, `session_ended`, timestamps.
- [`ChatMessage`](src/models/chatMessageModel.ts)
  - Fields: `chat_session_id`, `sender` ("user" | "chatbot" | "tool" | "system"), `message`, `timestamp`, timestamps.

## MCP Integration

### How the API talks to MCP

- The API constructs an MCP stdio client: [`getMcpClient`](src/mcp/mcpClient.ts).
  - Spawns `bun src/mcp/server.ts` with env `{ MONGODB_URI, TAVILY_API_KEY }`.
  - Exposes `client.callTool({ name, arguments })` used by the chat controller.

- The `toolName` and `toolArgs` fields in `/api/chat` request directly trigger an MCP tool call from the API.

### MCP Server and Tools

The MCP server registers multiple tools in [src/mcp/server.ts](src/mcp/server.ts):

- `web_search`
  - Inputs: `{ q: string, maxResults?: number, depth?: "basic" | "advanced" }`
  - Uses Tavily; falls back to DuckDuckGo on any error.
  - Returns a `content` array with:
    - a summary text block
    - `resource_link` items for top results

- `fetch_url`
  - Inputs: `{ url: string }`
  - Fetches clean text via `https://r.jina.ai/<url>`.

- `mongo_find`
  - Inputs: `{ db, collection, filter?, projection?, sort?, limit? }`
  - Executes a MongoDB find and returns documents JSON.

- `mongo_insertOne`
  - Inputs: `{ db, collection, document }`
  - Inserts a document.

- `mongo_updateOne`
  - Inputs: `{ db, collection, filter, update, upsert? }`
  - Runs an updateOne.

- `hybrid_game_context`
  - Inputs: `{ q, db, collection, filter?, projection?, limit?, maxResults?, depth? }`
  - Aggregates MongoDB doc(s) and web results into a single text block and resource links.
  - Web search uses the same resilient fallback.

Search fallback functions:

- [`tavilySearch`](src/mcp/server.ts)
- [`ddgFallback`](src/mcp/server.ts)
- [`safeWebSearch`](src/mcp/server.ts)

Reader helper:

- [`readWithJina`](src/mcp/server.ts)

### Optional MCP Bridge (HTTP)

For dev/testing without the chat pipeline:

- List tools: GET `/api/mcp/tools` -> [src/mcp/bridge.ts](src/mcp/bridge.ts)
- Call a tool: POST `/api/mcp/tools/call` with `{ name, args }`

The bridge also spins an MCP client with the same env vars.

## Running Locally

- Start both API and MCP from one command:
  - `bun run start` (spawns API and MCP via [src/main.ts](src/main.ts))
- Or run separately:
  - API: `bun src/index.ts`
  - MCP: `bun src/mcp/server.ts`
  - Bridge: `bun src/mcp/bridge.ts`

Health:

- `/healthz` -> liveness
- `/readyz` -> readiness

## Example Requests

- Plain chat:

```bash
curl -N http://localhost:5000/api/chat -H "Content-Type: application/json" ^
  -d "{ \"message\": \"Summarize Baldur's Gate 3.\" }"
```

- Chat + MCP tool (hybrid DB + Web):

```bash
curl -N http://localhost:5000/api/chat -H "Content-Type: application/json" ^
  -d "{ \
\"message\": \"Using DB + web, summarize Baldur's Gate 3 with any recent updates.\", \
\"toolName\": \"hybrid_game_context\", \
\"toolArgs\": { \
  \"q\": \"Baldur's Gate 3\", \
  \"db\": \"infoxp\", \
  \"collection\": \"games\", \
  \"filter\": { \"$or\": [ { \"title\": { \"$regex\": \"^Baldur'?s Gate 3$\", \"$options\": \"i\" } }, { \"steam_app_id\": 1086940 } ] }, \
  \"projection\": { \"title\": 1, \"developer\": 1, \"genres\": 1, \"release_date\": 1, \"description\": 1, \"steam_app_id\": 1 }, \
  \"limit\": 1, \
  \"maxResults\": 3, \
  \"depth\": \"basic\" \
} }"
```

- Direct tool testing via bridge:

```bash
curl http://localhost:5000/api/mcp/tools
curl -X POST http://localhost:5000/api/mcp/tools/call -H "Content-Type: application/json" ^
  -d "{ \"name\": \"web_search\", \"args\": { \"q\": \"Baldur's Gate 3 patch notes\", \"maxResults\": 3 } }"
```

Notes:

- If your documents use `genres` (array) instead of `genre`, project `genres`.
- Tool results are embedded as JSON into the LLM prompt by the chat controller.

## Environment Variables

Key vars consumed across the system:

- API/LLM: `OLLAMA_URL`, `LLM_MODEL`, `JSON_LIMIT`, `CLIENT_ORIGIN`
- Mongo: `MONGODB_URI` or `MONGODB_USER_URI`
- MCP tools: `TAVILY_API_KEY` (web search), `MONGODB_URI`
- Ports: `PORT` (API), `BRIDGE_PORT` (MCP bridge)

Ensure these are set in `.env`. Secrets should not be committed.

## Error Handling

- MCP tool errors in chat:
  - Controller logs error, saves a `tool` message with error, proceeds without tool output.
- Web search errors:
  - Tavily failures automatically fall back to DuckDuckGo in [`safeWebSearch`](src/mcp/server.ts).
- LLM streaming:
  - Controller parses NDJSON chunks; writes `parsed.response` to the client.
  - On stream error, returns 500 if headers not sent; otherwise ends the stream.

## Sequence (High-level)

- Client -> `/api/chat` (message + optional toolName/args)
- API saves user message -> optionally invokes MCP tool -> augments prompt
- API streams LLM output back
- API saves final chatbot message
