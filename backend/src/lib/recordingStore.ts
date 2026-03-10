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

  if (rangeHeader && /^bytes=\d*-\d*$/i.test(rangeHeader)) {
    const [startPart, endPart] = rangeHeader.replace(/bytes=/i, "").split("-");
    const start = Number.parseInt(startPart, 10);
    const end = endPart ? Number.parseInt(endPart, 10) : fileLength - 1;

    if (Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start && end < fileLength) {
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Range", `bytes ${start}-${end}/${fileLength}`);
      res.setHeader("Content-Length", chunkSize.toString());
      res.setHeader("Cache-Control", "private, max-age=300");

      const stream = bucket.openDownloadStream(objectId, {
        start,
        end: end + 1,
      });

      stream.on("error", () => {
        if (!res.headersSent) {
          res.status(500).end();
        }
      });
      stream.pipe(res);
      return true;
    }
  }

  res.status(200);
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", fileLength.toString());
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "private, max-age=300");

  const stream = bucket.openDownloadStream(objectId);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).end();
    }
  });
  stream.pipe(res);
  return true;
};
