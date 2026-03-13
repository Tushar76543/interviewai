import { Router, type RequestHandler } from "express";
import mongoose from "mongoose";
import { getEnvConfig } from "../config/env.js";

const router = Router();
const env = getEnvConfig();

const requireOpsKey: RequestHandler = (req, res, next) => {
  if (!env.metricsApiKey) {
    next();
    return;
  }

  const candidate = (req.header("x-metrics-key") ?? "").trim();
  if (!candidate || candidate !== env.metricsApiKey) {
    res.status(403).json({
      success: false,
      message: "Forbidden",
    });
    return;
  }

  next();
};

router.get("/mongo/indexes", requireOpsKey, async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({
        success: false,
        message: "Mongo connection is not ready",
      });
    }

    const collectionNames = ["users", "interviewsessions", "feedbackjobs"];
    const collections = await Promise.all(
      collectionNames.map(async (name) => {
        const collection = db.collection(name);
        const [indexes, estimatedCount] = await Promise.all([
          collection.indexes(),
          collection.estimatedDocumentCount(),
        ]);

        return {
          collection: name,
          estimatedDocumentCount: estimatedCount,
          indexes,
        };
      })
    );

    return res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      collections,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read index stats";
    return res.status(500).json({
      success: false,
      message,
    });
  }
});

export default router;
