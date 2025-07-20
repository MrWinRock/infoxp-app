# InfoXP Backend

## Overview
InfoXP Backend is a Bun-based backend application designed to provide robust and scalable APIs for the InfoXP platform. It leverages Express.js for server-side logic and MongoDB for database management, with Bun providing fast runtime and built-in TypeScript support.

## Features
- RESTful API endpoints
- MongoDB integration
- Environment-based configuration
- Modular and reusable code structure
- Hot-reloading during development with Bun's built-in watch mode
- Fast startup and execution with Bun runtime

## Prerequisites
- Bun (v1.0 or higher)
- MongoDB Atlas or a local MongoDB instance

## Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd infoxp-backend
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Create a `.env` file in the root directory and configure the following variables:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority
   ```

## Development
To start the development server with hot-reloading:
```bash
bun dev
```

## Production
To build and run the application in production:
1. Build the project (optional - Bun can run TypeScript directly):
   ```bash
   bun run build
   ```

2. Start the server:
   ```bash
   bun start
   ```

## Running the Scraper
To run the scraper script:
```bash
bun run scraper
```

## Project Structure
```
infoxp-backend/
├── src/
│   ├── config/         # Configuration files (e.g., database connection)
│   ├── controllers/    # Request handlers and business logic
│   ├── models/         # Database models and schemas
│   ├── routes/         # API route handlers
│   ├── scraper/        # Web scraping utilities
│   ├── services/       # External service integrations
│   ├── index.ts        # Entry point of the application
│   └── runScraper.ts   # Scraper execution script
├── .env                # Environment variables
├── bunfig.toml         # Bun configuration
├── package.json        # Project metadata and dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```

## Scripts
- `bun dev`: Start the development server with hot-reloading
- `bun run build`: Build the project for production (optional)
- `bun start`: Start the production server
- `bun run scraper`: Run the web scraper

## Why Bun?
- **Fast Runtime**: Bun is significantly faster than Node.js for most workloads
- **Built-in TypeScript**: No need for separate compilation step or ts-node
- **Built-in Package Manager**: Fast package installation and resolution
- **Built-in Bundler**: Optional bundling for production deployments
- **Hot Reloading**: Built-in watch mode for development

## License
This project is licensed under the MIT License.