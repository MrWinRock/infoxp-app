# Chat and MCP Integration Guide

This document explains how chat requests are processed, how MCP tools are invoked, data persistence, and how to test the flow locally.

## Overview

- API entrypoint: [src/index.ts](src/index.ts)
- Chat routes: [src/routes/chatRoutes.ts](src/routes/chatRoutes.ts)
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

## Routes Summary (/api/chat)

- POST `/api/chat`
  - Starts a new session.
  - Body must include `message`; `userId` is optional (if omitted, a guest user is used/created).
- POST `/api/chat/:sessionId`
  - Continues an existing session.
  - Body must include `message`. If `userId` is provided, it must match the session’s owner.

Session management endpoints:

- GET `/api/chat/session/:userId` → [`getSessionByUserId`](src/controllers/chatController.ts)
- GET `/api/chat/session/:userId/messages` → [`getSessionMessagesByUserId`](src/controllers/chatController.ts)
- GET `/api/chat/sessions/:userId` → [`listChatSessionsByUserId`](src/controllers/chatController.ts)
- GET `/api/chat/session/:sessionId/messages/by-id` → [`getMessagesBySessionId`](src/controllers/chatController.ts)
- POST `/api/chat/session/:sessionId/end` → [`endSessionById`](src/controllers/chatController.ts)
- DELETE `/api/chat/session/:sessionId` → [`deleteSessionById`](src/controllers/chatController.ts)

See: [src/routes/chatRoutes.ts](src/routes/chatRoutes.ts)

## Request Flow

1) Client POSTs to:
   - New session: `/api/chat`
   - Continue session: `/api/chat/:sessionId`
   With JSON:
   - Required: `message: string`
   - Optional: `userId` (in body only), `toolName`, `toolArgs`

2) Controller: [`handleChatMessage`](src/controllers/chatController.ts)
   - If `req.params.sessionId` is present:
     - Validates and loads the session.
     - If `userId` is provided in body, enforces ownership (must match `session.user_id`).
     - Does not create a session.
   - If no `sessionId`:
     - Ensures user identity:
       - If `userId` not provided, uses/creates a `guest` user.
     - Creates a new `ChatSession`.
   - Persists the user message as a `ChatMessage`.
   - If `toolName` provided:
     - Calls MCP tool via [`getMcpClient`](src/mcp/mcpClient.ts) -> `client.callTool(...)`.
     - Saves a `ChatMessage` with `sender: "tool"` containing the tool’s JSON result (or error).
     - Augments the LLM prompt with tool JSON when available.
   - Streams LLM output back to client in plain text chunks:
     - Parses each NDJSON piece and writes `parsed.response` to the HTTP response.
     - On stream end/error, saves the final chatbot message (if available).

3) Response
   - Headers:
     - `Content-Type: text/plain; charset=utf-8`
     - `Transfer-Encoding: chunked`
     - `X-Chat-Session-Id: <sessionId>` (always included so clients can continue the chat)
     - `Access-Control-Expose-Headers: X-Chat-Session-Id` (so browsers can read the header)
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

- The `toolName` and `toolArgs` fields in `/api/chat` requests directly trigger an MCP tool call from the API.

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

- Start a new chat (guest):

```bash
curl -N http://localhost:5000/api/chat -H "Content-Type: application/json" ^
  -d "{ \"message\": \"Summarize Baldur's Gate 3.\" }"
```

- Start a new chat for a specific user:

```bash
curl -N http://localhost:5000/api/chat -H "Content-Type: application/json" ^
  -d "{ \"message\": \"Hello\", \"userId\": \"64b7e6f9d9f5a2c1e4f0a123\" }"
```

- Continue an existing session (use X-Chat-Session-Id from the previous response):

```bash
curl -N http://localhost:5000/api/chat/64b7e6f9d9f5a2c1e4f0aabc -H "Content-Type: application/json" ^
  -d "{ \"message\": \"Continue our chat from before.\" }"
```

- Chat + MCP tool (hybrid DB + Web) in a new session:

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

Notes:

- When you POST to `/api/chat` (no `sessionId`), a new session is created and the `X-Chat-Session-Id` header is returned so you can continue the conversation via `/api/chat/:sessionId`.
- When you POST to `/api/chat/:sessionId`, the request continues that session. If you include `userId` in the body, it must match the session owner.

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

- Client -> `/api/chat` (message + optional userId/toolName/args)
- API saves user message -> optionally invokes MCP tool -> augments prompt
- API streams LLM output back
- API saves final chatbot message
