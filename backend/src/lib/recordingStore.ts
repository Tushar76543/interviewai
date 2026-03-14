import mongoose from "mongoose";

const RECORDING_BUCKET = "interview_recordings";

type RecordingMetadata = {
  userId: string;
  sessionId: string;
  questionIndex: number;
};

const toObjectId = (value: string) => {
  if (!mongoose.isValidObjectId(value)) {
    throw new Error("Invalid recording id");
  }

  return new mongoose.Types.ObjectId(value);
};

const getBucket = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not ready");
  }

  return new mongoose.mongo.GridFSBucket(db, {
    bucketName: RECORDING_BUCKET,
  });
};

export const saveRecordingFile = async (params: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  metadata: RecordingMetadata;
}) => {
  const bucket = getBucket();
  const { buffer, filename, mimeType, metadata } = params;

  const uploadStream = bucket.openUploadStream(filename, {
    contentType: mimeType,
    metadata,
  });

  const fileId = await new Promise<mongoose.Types.ObjectId>((resolve, reject) => {
    uploadStream.on("finish", () => resolve(uploadStream.id as mongoose.Types.ObjectId));
    uploadStream.on("error", reject);
    uploadStream.end(buffer);
  });

  return {
    fileId: fileId.toString(),
    mimeType,
    sizeBytes: buffer.length,
  };
};

export const getRecordingFileById = async (fileId: string) => {
  const bucket = getBucket();
  const id = toObjectId(fileId);

  const file = await bucket.find({ _id: id }).limit(1).next();
  return file ?? null;
};

export const deleteRecordingFile = async (fileId: string) => {
  try {
    const bucket = getBucket();
    const id = toObjectId(fileId);
    await bucket.delete(id);
  } catch {
    // Best effort cleanup.
  }
};

export const streamRecordingFile = async (params: {
  fileId: string;
  rangeHeader: string | undefined;
  res: import("express").Response;
}) => {
  const { fileId, rangeHeader, res } = params;
  const bucket = getBucket();
  const fileDoc = await getRecordingFileById(fileId);

  if (!fileDoc) {
    return false;
  }

  const contentType =
    typeof fileDoc.contentType === "string" && fileDoc.contentType.trim()
      ? fileDoc.contentType
      : "video/webm";
  const fileLength = Number(fileDoc.length || 0);
  const objectId = fileDoc._id as mongoose.Types.ObjectId;

  // Helper: download a GridFS stream into a Buffer.
  // Vercel serverless functions don't reliably support stream.pipe(res),
  // so we buffer the entire download and send it with res.end().
  const downloadToBuffer = (downloadStream: import("stream").Readable): Promise<Buffer> =>
    new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      downloadStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
      downloadStream.on("error", reject);
    });

  // Set Content-Disposition to inline so browsers render the video in-page
  res.setHeader("Content-Disposition", "inline");

  // Handle range requests – browsers send "bytes=0-" (open-ended) for initial
  // metadata probes and "bytes=123-456" for seeking.
  if (rangeHeader && /^bytes=\d+-/i.test(rangeHeader)) {
    const [startPart, endPart] = rangeHeader.replace(/bytes=/i, "").split("-");
    const start = Number.parseInt(startPart, 10);
    const end = endPart && endPart.trim() ? Number.parseInt(endPart, 10) : fileLength - 1;

    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end < fileLength) {
      const chunkSize = end - start + 1;

      try {
        const downloadStream = bucket.openDownloadStream(objectId, {
          start,
          end: end + 1,
        });
        const buffer = await downloadToBuffer(downloadStream);

        res.status(206);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Range", `bytes ${start}-${end}/${fileLength}`);
        res.setHeader("Content-Length", buffer.length.toString());
        res.setHeader("Cache-Control", "private, max-age=300");
        res.end(buffer);
        return true;
      } catch {
        if (!res.headersSent) {
          res.status(500).end();
        }
        return true;
      }
    }
  }

  try {
    const downloadStream = bucket.openDownloadStream(objectId);
    const buffer = await downloadToBuffer(downloadStream);

    res.status(200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.length.toString());
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "private, max-age=300");
    res.end(buffer);
    return true;
  } catch {
    if (!res.headersSent) {
      res.status(500).end();
    }
    return true;
  }
};
