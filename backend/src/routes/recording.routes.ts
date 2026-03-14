import { Router, Request } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
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
const SIGNED_RECORDING_TOKEN_TTL_SEC = Math.max(
  60,
  Number.parseInt(process.env.RECORDING_SIGNED_URL_TTL_SEC ?? "600", 10)
);

const parseOptionalQuestionIndex = (value: unknown) => {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

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

const getSignedRecordingSecret = () => {
  const secret = (process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    throw new Error("JWT secret is not configured");
  }

  return `${secret}:recording-signed`;
};

const issueSignedRecordingToken = (params: { fileId: string; userId: string }) =>
  jwt.sign(
    {
      type: "recording",
      fileId: params.fileId,
      userId: params.userId,
      nonce: crypto.randomBytes(12).toString("hex"),
    },
    getSignedRecordingSecret(),
    {
      algorithm: "HS256",
      expiresIn: SIGNED_RECORDING_TOKEN_TTL_SEC,
    }
  );

const readSignedRecordingToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, getSignedRecordingSecret(), {
      algorithms: ["HS256"],
    }) as jwt.JwtPayload;

    const fileId = typeof decoded.fileId === "string" ? decoded.fileId : "";
    const userId = typeof decoded.userId === "string" ? decoded.userId : "";
    const tokenType = typeof decoded.type === "string" ? decoded.type : "";

    if (!fileId || !userId || tokenType !== "recording") {
      return null;
    }

    return {
      fileId,
      userId,
    };
  } catch {
    return null;
  }
};

router.get("/signed/:token", async (req, res) => {
  try {
    const token = (req.params.token ?? "").trim();
    if (!/^[A-Za-z0-9._-]{24,2048}$/.test(token)) {
      return res.status(400).json({
        success: false,
        message: "Invalid signed recording token",
      });
    }

    const payload = readSignedRecordingToken(token);
    if (!payload) {
      return res.status(404).json({
        success: false,
        message: "Signed recording URL is invalid or expired",
      });
    }

    const fileDoc = await getRecordingFileById(payload.fileId);
    const ownerId = String((fileDoc?.metadata as { userId?: string } | undefined)?.userId || "");

    if (!fileDoc || !ownerId || ownerId !== String(payload.userId)) {
      return res.status(404).json({
        success: false,
        message: "Recording not found",
      });
    }

    const streamed = await streamRecordingFile({
      fileId: payload.fileId,
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
      message: "Failed to stream signed recording",
    });
  }
});

router.post("/signed-url", authMiddleware, async (req, res) => {
  try {
    const user = (req as Request & { user: { _id: string } }).user;
    const { fileId } = req.body as { fileId?: string };

    if (!fileId || !mongoose.isValidObjectId(fileId)) {
      return res.status(400).json({
        success: false,
        message: "Valid fileId is required",
      });
    }

    const fileDoc = await getRecordingFileById(fileId);
    const ownerId = String((fileDoc?.metadata as { userId?: string } | undefined)?.userId || "");

    if (!fileDoc || !ownerId || ownerId !== String(user._id)) {
      return res.status(404).json({
        success: false,
        message: "Recording not found",
      });
    }

    const token = issueSignedRecordingToken({
      fileId,
      userId: user._id,
    });

    return res.json({
      success: true,
      signedUrl: `/api/interview/recording/signed/${token}`,
      expiresInSec: SIGNED_RECORDING_TOKEN_TTL_SEC,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Failed to issue signed recording URL",
    });
  }
});

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
    const ownerId = String((fileDoc?.metadata as { userId?: string } | undefined)?.userId || "");

    if (!fileDoc || !ownerId || ownerId !== String(user._id)) {
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
      const { sessionId, questionIndex } = req.body as {
        sessionId?: string;
        questionIndex?: unknown;
      };

      if (!typedReq.file) {
        return res.status(400).json({
          success: false,
          message: "No recording uploaded",
        });
      }

      if (!typedReq.file.size || typedReq.file.size < 1024) {
        return res.status(400).json({
          success: false,
          message: "Recording is empty or too short",
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

      const parsedQuestionIndex = parseOptionalQuestionIndex(questionIndex);
      if (
        typeof parsedQuestionIndex === "number" &&
        (parsedQuestionIndex < 0 || parsedQuestionIndex >= session.questions.length)
      ) {
        return res.status(400).json({
          success: false,
          message: "questionIndex is out of range for this session",
        });
      }

      const targetIndex =
        typeof parsedQuestionIndex === "number"
          ? parsedQuestionIndex
          : session.questions.length - 1;
      const existingRecordingId = session.questions[targetIndex].recordingFileId;

      const saved = await saveRecordingFile({
        buffer: typedReq.file.buffer,
        mimeType: typedReq.file.mimetype || "video/webm",
        filename: typedReq.file.originalname || `recording-${Date.now()}.webm`,
        metadata: {
          userId: String(user._id),
          sessionId: String(sessionId),
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
          questionIndex: targetIndex,
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
