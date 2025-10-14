# InfoXP Backend

## Overview

InfoXP Backend is a Bun-based backend application designed to provide robust and scalable APIs for the InfoXP platform. It integrates Express.js for server-side logic, MongoDB for data persistence, Ollama for local LLM inference, and the Model Context Protocol (MCP) for tool execution and external integrations.

## Features

- RESTful API endpoints for games, chat, and user management
- MongoDB integration with Mongoose ODM
- Steam-like game data format for consistency
- Chat API with streaming LLM responses (Ollama)
- Model Context Protocol (MCP) server and client for tool execution
- Web search integration (Tavily API with DuckDuckGo fallback)
- Environment-based configuration
- Hot-reloading during development with Bun's built-in watch mode
- Fast startup and execution with Bun runtime

## Prerequisites

- **Bun** (v1.0 or higher) - [Install Bun](https://bun.sh)
- **MongoDB Atlas** or local MongoDB instance
- **Ollama** (optional, for LLM features) - [Install Ollama](https://ollama.ai)
- **Tavily API Key** (optional, for enhanced web search) - [Get API Key](https://tavily.com)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/MrWinRock/infoxp-app.git
   cd infoxp-app
   ```

2. Install dependencies:

   ```bash
   bun install
   ```

3. Create a `.env` file in the root directory with the following variables:

   ```env
   # Server
   PORT=5000
   BRIDGE_PORT=3030
   CLIENT_ORIGIN=http://localhost:5173
   JSON_LIMIT=2mb

   # Database
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority&appName=InfoXP
   MONGODB_USER_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority&appName=InfoXP

   # Authentication
   JWT_SECRET=your-secret-key-here
   JWT_EXPIRES_IN=7d

   # LLM (Ollama)
   OLLAMA_URL=http://localhost:11434
   LLM_MODEL=llama3.2

   # Web Search
   TAVILY_API_KEY=tvly-your-api-key-here
   ```

4. Pull the Ollama model (if using LLM features):

   ```bash
   ollama pull llama3.2
   ```

## Development

Start the development server with hot-reloading:

```bash
bun run dev
```

This starts:

- API server on `http://localhost:5000`
- MCP server (stdio-based, spawned by main process)

## Production

1. Build the project (optional - Bun can run TypeScript directly):

   ```bash
   bun run build
   ```

2. Start the production server:

   ```bash
   bun run start
   ```

This command:

- Checks for Ollama and the configured model
- Spawns the API server ([`src/index.ts`](src/index.ts))
- Spawns the MCP server ([`src/mcp/server.ts`](src/mcp/server.ts))

## Running the Scraper

To run the Steam game scraper:

```bash
bun run scraper
```

## Project Structure

```txt
infoxp-app/
├── src/
│   ├── agent/              # Ollama agent with tool support
│   │   └── ollamaTools.ts  # LLM tool definitions (search, MongoDB)
│   ├── config/             # Configuration (database connection)
│   │   └── database.ts
│   ├── constants/          # Shared constants (genres, etc.)
│   │   └── genres.ts
│   ├── controllers/        # Request handlers and business logic
│   │   ├── authController.ts
│   │   ├── chatController.ts
│   │   └── gameController.ts
│   ├── mcp/                # Model Context Protocol
│   │   ├── bridge.ts       # HTTP bridge for testing (optional)
│   │   ├── mcpClient.ts    # MCP stdio client
│   │   └── server.ts       # MCP server with tools
│   ├── middleware/         # Express middleware
│   │   └── authMiddleware.ts
│   ├── models/             # MongoDB schemas
│   │   ├── chatMessageModel.ts
│   │   ├── chatSessionModel.ts
│   │   ├── gameModel.ts
│   │   └── userModel.ts
│   ├── routes/             # API route handlers
│   │   ├── authRoutes.ts
│   │   ├── chatRoutes.ts
│   │   └── gameRoutes.ts
│   ├── scraper/            # Web scraping utilities
│   │   └── steamScraper.ts
│   ├── services/           # External service integrations
│   │   ├── dataImportService.ts
│   │   └── llmService.ts
│   ├── index.ts            # Express app entry point
│   ├── main.ts             # Process spawner and orchestrator
│   └── runScraper.ts       # Scraper execution script
├── docs/                   # Documentation
│   ├── chat_api_routes.md
│   └── game_api_routes.md
├── .env                    # Environment variables (not in repo)
├── bunfig.toml             # Bun configuration
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login and get JWT token

### Games (Steam-like format)

- `GET /api/games` - Get all games (paginated)
- `GET /api/games/:id` - Get game by ID
- `GET /api/games/search` - Search games
- `GET /api/games/genre/:genre` - Get games by genre
- `GET /api/games/developer/:developer` - Get games by developer
- `POST /api/games` - Create new game
- `PUT /api/games/:id` - Update game
- `DELETE /api/games/:id` - Delete game
- `POST /api/games/import/json` - Import games from JSON array

See [`docs/game_api_routes.md`](docs/game_api_routes.md) for full API documentation.

### Chat

- `POST /api/chat` - Send message and get streaming LLM response

See [`docs/chat_api_routes.md`](docs/chat_api_routes.md) for full chat API documentation.

## Steam-like Game Format

All game endpoints use this format:

```typescript
{
  AppID: number;
  Name: string;
  "Release date"?: number;        // Unix timestamp (ms)
  "Required age"?: number;
  "About the game"?: string;
  "Header image"?: string;
  Windows?: boolean;
  Mac?: boolean;
  Linux?: boolean;
  Developers?: string[];
  Publishers?: string | string[];
  Categories?: string[];
  Genres?: string[];
}
```

## MCP Integration

The backend includes a built-in MCP server that exposes tools for:

- MongoDB operations (find, insert, update)
- Web search (Tavily API with DuckDuckGo fallback)
- URL content fetching

The API uses an MCP client ([`src/mcp/mcpClient.ts`](src/mcp/mcpClient.ts)) to communicate with the server via stdio.

## Scripts

- `bun run dev` - Start development server with hot-reloading
- `bun run start` - Start production server (spawns API + MCP)
- `bun run build` - Build the project (optional)
- `bun run scraper` - Run the Steam game scraper
- `bun run import-csv` - Import games from CSV file
- `bun run mcp:dev` - Run MCP server standalone (for testing)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API server port | `5000` |
| `BRIDGE_PORT` | MCP HTTP bridge port (optional) | `3030` |
| `MONGODB_URI` | MongoDB connection string | Required |
| `MONGODB_USER_URI` | MongoDB user database URI | Required |
| `JWT_SECRET` | Secret for JWT signing | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `7d` |
| `OLLAMA_URL` | Ollama API endpoint | `http://localhost:11434` |
| `LLM_MODEL` | Ollama model name | `llama3.2` |
| `TAVILY_API_KEY` | Tavily search API key | Optional |
| `CLIENT_ORIGIN` | CORS allowed origin | `http://localhost:5173` |
| `JSON_LIMIT` | Max JSON body size | `2mb` |

## Why Bun?

- **Fast Runtime**: Bun is significantly faster than Node.js for most workloads
- **Built-in TypeScript**: No need for separate compilation step or ts-node
- **Built-in Package Manager**: Fast package installation and resolution
- **Built-in Bundler**: Optional bundling for production deployments
- **Hot Reloading**: Built-in watch mode for development
- **Native Web APIs**: Fetch, WebSocket, and more built-in

## License

This project is licensed under the ISC License.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Repository

[https://github.com/MrWinRock/infoxp-app](https://github.com/MrWinRock/infoxp-app)
