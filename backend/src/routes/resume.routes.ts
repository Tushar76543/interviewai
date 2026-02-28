import { Request, Router } from "express";
import multer from "multer";
import { createRequire } from "module";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { resumeRateLimit } from "../middleware/rateLimit.middleware.js";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse-fork");

type ResumeRequest = Request & {
  file?: {
    buffer: Buffer;
    mimetype?: string;
    originalname?: string;
  };
};

const router = Router();

const MAX_RESUME_SIZE = Number.parseInt(
  process.env.MAX_RESUME_FILE_SIZE_BYTES ?? `${2 * 1024 * 1024}`,
  10
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number.isFinite(MAX_RESUME_SIZE) ? MAX_RESUME_SIZE : 2 * 1024 * 1024 },
  fileFilter: (_req: Request, file: { mimetype?: string; originalname?: string }, cb: (error: Error | null, acceptFile?: boolean) => void) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname?.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      cb(new Error("Only PDF files are supported"));
      return;
    }

    cb(null, true);
  },
});

const commonSkills = [
  "JavaScript",
  "TypeScript",
  "React",
  "Node.js",
  "Express",
  "Python",
  "SQL",
  "MongoDB",
  "Docker",
  "Kubernetes",
  "AWS",
  "System Design",
  "Machine Learning",
  "Data Structures",
  "Algorithms",
];

const extractSkills = (text: string) => {
  const normalized = text.toLowerCase();
  return commonSkills.filter((skill) => normalized.includes(skill.toLowerCase())).slice(0, 10);
};

router.post(
  "/analyze",
  authMiddleware,
  resumeRateLimit,
  (req, res, next) => {
    upload.single("resume")(req, res, (error: Error | null) => {
      if (!error) {
        next();
        return;
      }

      const maybeMulterError = error as { code?: string; message?: string };

      if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          success: false,
          message: "Resume file is too large",
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: error.message || "Invalid resume upload",
      });
    });
  },
  async (req, res) => {
    const typedReq = req as ResumeRequest;

    try {
      if (!typedReq.file) {
        return res.status(400).json({
          success: false,
          message: "No resume uploaded",
        });
      }

      const data = await pdf(typedReq.file.buffer);
      const text = (data.text || "").replace(/\s+/g, " ").trim();

      return res.json({
        success: true,
        message: "Resume processed successfully",
        textPreview: text.slice(0, 300),
        skillsFound: extractSkills(text),
      });
    } catch {
      return res.status(500).json({
        success: false,
        message: "Failed to process resume",
      });
    }
  }
);

export default router;
