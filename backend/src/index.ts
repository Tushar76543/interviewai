import mongoose from "mongoose";
import app from "./app.js";

const isProduction = process.env.NODE_ENV === "production";

const requiredEnv = ["MONGO_URI", "JWT_SECRET", "OPENROUTER_API_KEY"];
if (isProduction) {
  requiredEnv.push("FRONTEND_URL", "REDIS_REST_URL", "REDIS_REST_TOKEN");
}

const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(", ")}`);
  process.exit(1);
}

const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const shutdown = (signal: string) => {
  console.log(`${signal} received. Shutting down server.`);

  server.close(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // Ignore disconnect errors during shutdown.
    }

    process.exit(0);
  });

  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10000).unref();
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  shutdown("UNCAUGHT_EXCEPTION");
});
