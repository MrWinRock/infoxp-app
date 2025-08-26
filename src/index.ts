import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import compression from "compression";
import { connectToDatabase } from "./config/database";
import userRoutes from "./routes/userRoutes";
import gameRoutes from "./routes/gameRoutes";
import chatRoutes from "./routes/chatRoutes";
import { agent } from "./routes/agentRoutes";

dotenv.config();

// --- Env validation ---
const requiredEnv = ["MONGODB_URI"];
const missing = requiredEnv.filter(k => !process.env[k]);
if (missing.length) {
  console.error("Missing required env vars:", missing.join(", "));
  process.exit(1);
}

const app = express();
const port = Number(process.env.PORT) || 5000;
const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const jsonLimit = process.env.JSON_LIMIT || "1mb";

// --- Middleware ---
app.use(cors({
  origin: clientOrigin,
  credentials: true
}));
app.use(helmet());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(compression());
app.use(express.json({ limit: jsonLimit }));
app.use(cookieParser());
app.use(express.static("public"));

// --- Liveness (always responds) ---
app.get("/healthz", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

let ready = false;
app.get("/readyz", (_req, res) => {
  if (!ready) return res.status(503).json({ status: "starting" });
  res.json({ status: "ready" });
});

// --- API routes ---
app.use("/api/users", userRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/agent", agent);

// Root convenience
app.get("/", (_req, res) => res.json({ service: "api", status: "ok", ready }));

// 404
app.use((req, res) => {
  res.status(404).json({ message: "Not found", path: req.originalUrl });
});

// Error handler
app.use((
  err: any,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  const status = err.status || 500;
  const payload: any = {
    message: err.message || "Internal server error"
  };
  if (process.env.NODE_ENV !== "production") {
    payload.stack = err.stack;
  }
  console.error("Unhandled error:", err);
  res.status(status).json(payload);
});

// --- Startup sequence ---
(async () => {
  try {
    await connectToDatabase();
    ready = true;
    const server = app.listen(port, () => {
      console.log(`API listening on ${port} (origin: ${clientOrigin})`);
    });

    // Graceful shutdown
    const shutdown = (signal: string) => {
      console.log(`\nReceived ${signal}, shutting down...`);
      ready = false;
      server.close(() => {
        console.log("HTTP server closed.");
        process.exit(0);
      });
      // Fallback force-exit timer
      setTimeout(() => process.exit(1), 10000).unref();
    };
    ["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => shutdown(sig)));

    process.on("unhandledRejection", (r) => {
      console.error("Unhandled rejection:", r);
    });
    process.on("uncaughtException", (e) => {
      console.error("Uncaught exception:", e);
      shutdown("uncaughtException");
    });
  } catch (e) {
    console.error("Startup failure:", e);
    process.exit(1);
  }
})();