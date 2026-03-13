# Load Testing And Release Gates

## k6 script
- Script: `perf/k6/api-load.js`
- Core tracked route latency tags:
  - `interview_start`
  - `feedback_jobs`
  - `recording_upload`
  - `recording_stream`

## Local run
```bash
k6 run perf/k6/api-load.js --env BASE_URL=http://localhost:5000
```

## Authenticated run (recommended)
```bash
k6 run perf/k6/api-load.js \
  --env BASE_URL=http://localhost:5000 \
  --env LOADTEST_EMAIL=user@example.com \
  --env LOADTEST_PASSWORD='StrongP@ssw0rd!'
```

## CI gate
- CI runs a smoke load test and fails when thresholds are exceeded.
- Current baseline thresholds:
  - `http_req_failed < 3%`
  - p95/p99 route thresholds defined in `perf/k6/api-load.js`

