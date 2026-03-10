import { Router, Request } from "express";
import multer from "multer";
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { recordingRateLimit } from "../middleware/rateLimit.middleware.js";
import InterviewSession from "../models/interviewSession.js";
import {
  deleteRecordingFile,
  getRecordingFileById,
  saveRecordingFile,
  streamRecordingFile,
} from "../lib/recordingStore.js";

type RecordingUploadRequest = Request & {
  file?: {
    buffer: Buffer;
    mimetype?: string;
    originalname?: string;
    size?: number;
  };
};

const MAX_RECORDING_SIZE_BYTES = Number.parseInt(
  process.env.MAX_RECORDING_FILE_SIZE_BYTES ?? `${25 * 1024 * 1024}`,
  10
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number.isFinite(MAX_RECORDING_SIZE_BYTES)
      ? MAX_RECORDING_SIZE_BYTES
      : 25 * 1024 * 1024,
  },
  fileFilter: (
    _req: Request,
    file: { mimetype?: string; originalname?: string },
    cb: (error: Error | null, acceptFile?: boolean) => void
  ) => {
    const mime = file.mimetype ?? "";
    const ext = file.originalname?.toLowerCase() ?? "";
    const isVideo = mime.startsWith("video/") || ext.endsWith(".webm") || ext.endsWith(".mp4") || ext.endsWith(".ogg");

    if (!isVideo) {
      cb(new Error("Only video recording files are supported"));
      return;
    }

    cb(null, true);
  },
});

const router = Router();

router.get("/:fileId", authMiddleware, async (req, res) => {
  try {
    const user = (req as Request & { user: { _id: string } }).user;
    const { fileId } = req.params;

    if (!mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid recording identifier",
      });
    }

    const fileDoc = await getRecordingFileById(fileId);
    const ownerId = (fileDoc?.metadata as { userId?: string } | undefined)?.userId;

    if (!fileDoc || !ownerId || ownerId !== user._id) {
      return res.status(404).json({
        success: false,
        message: "Recording not found",
      });
    }

    const streamed = await streamRecordingFile({
      fileId,
      rangeHeader: req.headers.range,
      res,
    });

    if (!streamed) {
      return res.status(404).json({
        success: false,
        message: "Recording not found",
      });
    }

    return undefined;
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to stream recording",
    });
  }
});

router.post(
  "/",
  authMiddleware,
  recordingRateLimit,
  (req, res, next) => {
    upload.single("recording")(req, res, (error: Error | null) => {
      if (!error) {
        next();
        return;
      }

      const maybeMulterError = error as { code?: string; message?: string };
      if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          success: false,
          message: "Recording file is too large",
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message || "Invalid recording upload",
      });
    });
  },
  async (req, res) => {
    try {
      const user = (req as Request & { user: { _id: string } }).user;
      const typedReq = req as RecordingUploadRequest;
      const { sessionId } = req.body as { sessionId?: string };

      if (!typedReq.file) {
        return res.status(400).json({
          success: false,
          message: "No recording uploaded",
        });
      }

      if (!sessionId || !mongoose.isValidObjectId(sessionId)) {
        return res.status(400).json({
          success: false,
          message: "Valid sessionId is required",
        });
      }

      const session = await InterviewSession.findOne({
        _id: sessionId,
        userId: user._id,
      });

      if (!session || session.questions.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Session not found for recording upload",
        });
      }

      const targetIndex = session.questions.length - 1;
      const existingRecordingId = session.questions[targetIndex].recordingFileId;

      const saved = await saveRecordingFile({
        buffer: typedReq.file.buffer,
        mimeType: typedReq.file.mimetype || "video/webm",
        filename: typedReq.file.originalname || `recording-${Date.now()}.webm`,
        metadata: {
          userId: user._id,
          sessionId,
          questionIndex: targetIndex,
        },
      });

      session.questions[targetIndex].recordingFileId = saved.fileId;
      session.questions[targetIndex].recordingMimeType = saved.mimeType;
      session.questions[targetIndex].recordingSizeBytes = saved.sizeBytes;
      session.lastActivityAt = new Date();
      await session.save();

      if (typeof existingRecordingId === "string" && existingRecordingId && existingRecordingId !== saved.fileId) {
        await deleteRecordingFile(existingRecordingId);
      }

      return res.json({
        success: true,
        recording: {
          fileId: saved.fileId,
          mimeType: saved.mimeType,
          sizeBytes: saved.sizeBytes,
          streamUrl: `/api/interview/recording/${saved.fileId}`,
        },
      });
    } catch {
      return res.status(500).json({
        success: false,
        message: "Failed to upload recording",
      });
    }
  }
);

export default router;
