# Recording Storage Scalability Plan

## Current state
- Recordings are stored in MongoDB GridFS (`interview_recordings` bucket).
- Playback is streamed through `/api/interview/recording/:fileId`.

## Scale trigger points
Move to object storage when any is true:
- recording data exceeds 25-30% of MongoDB storage footprint
- sustained upload traffic causes DB write latency spikes
- egress requirements increase (CDN/offload needed)

## Target architecture
- Store recordings in S3/R2 bucket with object lifecycle policies.
- Persist only metadata and object key in MongoDB session records.
- Generate short-lived signed URLs for upload and playback.
- Keep ownership checks in backend before issuing URLs.

## Lifecycle policy baseline
- Raw recordings retention: 30-90 days (configurable by compliance needs).
- Auto-transition cold objects to lower-cost storage tier.
- Auto-delete expired recordings based on lifecycle rules.

## Migration steps
1. Add storage abstraction (`gridfs` and `object-storage` providers).
2. Start dual-write for a canary period.
3. Backfill historical GridFS recordings to object storage.
4. Switch read path to signed URLs.
5. Remove GridFS storage path after validation.

