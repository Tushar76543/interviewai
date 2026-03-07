import mongoose from "mongoose";
import app from "./app.js";
import { getEnvConfig } from "./config/env.js";
const { isProduction } = getEnvConfig();
const PORT = Number.parseInt(process.env.PORT ?? "5000", 10);
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
const shutdown = (signal) => {
    console.log(`${signal} received. Shutting down server.`);
    server.close(async () => {
        try {
            await mongoose.disconnect();
        }
        catch {
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
    if (isProduction) {
        shutdown("UNCAUGHT_EXCEPTION");
    }
});
