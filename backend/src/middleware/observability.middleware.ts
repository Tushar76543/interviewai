import type { Request, RequestHandler } from "express";
import { getEnvConfig } from "../config/env.js";
import {
  buildPrometheusMetrics,
  createRequestContext,
  getRequestTraceparent,
  getRouteLatencySnapshot,
  logger,
  recordRouteLatency,
  withRequestContext,
} from "../lib/observability.js";
import { getAiResilienceSnapshot } from "../lib/aiResilience.js";

const env = getEnvConfig();

const toLatencyMs = (startedAt: bigint) =>
  Math.round((Number(process.hrtime.bigint() - startedAt) / 1_000_000) * 100) / 100;

export const observabilityMiddleware: RequestHandler = (req, res, next) => {
  const startedAt = process.hrtime.bigint();
  const context = createRequestContext({
    requestIdHeader: req.header("x-request-id") ?? "",
    traceparentHeader: req.header("traceparent") ?? "",
    method: req.method,
    path: req.originalUrl || req.url || "/",
  });

  res.setHeader("X-Request-Id", context.requestId);
  res.setHeader("Traceparent", getRequestTraceparent(context));

  withRequestContext(context, () => {
    logger.info("http.request.start", {
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
    });

    res.on("finish", () => {
      withRequestContext(context, () => {
        const latencyMs = toLatencyMs(startedAt);
        const typedReq = req as Request & {
          user?: {
            _id?: string;
          };
        };

        recordRouteLatency({
          method: req.method,
          path: req.originalUrl || req.url || "/",
          statusCode: res.statusCode,
          latencyMs,
        });

        logger.info("http.request.finish", {
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          latencyMs,
          userId: typedReq.user?._id,
        });
      });
    });

    next();
  });
};

export const metricsHandler: RequestHandler = (req, res) => {
  const apiKey = env.metricsApiKey;
  if (apiKey) {
    const headerValue = req.header("x-metrics-key") ?? "";
    if (headerValue !== apiKey) {
      res.status(403).json({
        success: false,
        message: "Forbidden",
      });
      return;
    }
  }

  const format = (req.query.format ?? "").toString().toLowerCase();
  if (format === "prometheus" || format === "prom") {
    res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    res.status(200).send(buildPrometheusMetrics());
    return;
  }

  res.status(200).json({
    success: true,
    generatedAt: new Date().toISOString(),
    routes: getRouteLatencySnapshot(),
    aiResilience: getAiResilienceSnapshot(),
  });
};
