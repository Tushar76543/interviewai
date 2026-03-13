# Observability Baseline

## Implemented in app
- Structured JSON logs for request start/finish and provider failures.
- Request correlation:
  - `X-Request-Id`
  - W3C `traceparent` propagation
- Route latency metrics with p50/p95/p99 for:
  - `POST /api/interview/start`
  - `POST /api/interview/feedback/jobs`
  - `GET /api/interview/feedback/jobs/:jobId`
  - `POST /api/interview/recording`
  - `GET /api/interview/recording/:fileId`
- AI resilience telemetry (circuit breaker and error-budget state).

## Metrics endpoints
- JSON: `GET /api/metrics`
- Prometheus text: `GET /api/metrics?format=prom`
- Optional protection: set `METRICS_API_KEY` and pass `x-metrics-key`.

## OpenTelemetry compatibility
- Request trace context follows W3C Trace Context (`traceparent`).
- Log fields include `traceId` and `spanId`, ready for OTEL collector ingestion.
- For full OTLP exporter integration, wire these logs/metrics into your collector pipeline.

