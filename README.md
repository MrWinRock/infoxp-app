# InfoXP Backend

## Overview
InfoXP Backend is a Node.js-based backend application designed to provide robust and scalable APIs for the InfoXP platform. It leverages Express.js for server-side logic and MongoDB for database management.

## Features
- RESTful API endpoints
- MongoDB integration
- Environment-based configuration
- Modular and reusable code structure
- Hot-reloading during development with `ts-node-dev`

## Prerequisites
- Node.js (v16 or higher)
- npm (v8 or higher)
- MongoDB Atlas or a local MongoDB instance

## Installation
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd infoxp-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root directory and configure the following variables:
   ```env
   PORT=3000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority
   ```

## Development
To start the development server with hot-reloading:
```bash
npm run dev
```

## Production
To build and run the application in production:
1. Build the project:
   ```bash
   npm run build
   ```

2. Start the server:
   ```bash
   npm start
   ```

## Project Structure
```
infoxp-backend/
├── src/
│   ├── config/         # Configuration files (e.g., database connection)
│   ├── routes/         # API route handlers
│   ├── index.ts        # Entry point of the application
├── .env                # Environment variables
├── package.json        # Project metadata and dependencies
├── tsconfig.json       # TypeScript configuration
└── README.md           # Project documentation
```

## Scripts
- `npm run dev`: Start the development server with hot-reloading
- `npm run build`: Compile TypeScript to JavaScript
- `npm start`: Start the production server

## License
This project is licensed under the MIT License.