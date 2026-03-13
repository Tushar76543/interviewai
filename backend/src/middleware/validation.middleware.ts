import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

const ROLE_MIN_LENGTH = 2;
const ROLE_MAX_LENGTH = 80;
const CATEGORY_MAX_LENGTH = 60;
const QUESTION_MAX_LENGTH = 1000;
const ANSWER_MAX_LENGTH = 5000;
const TRANSCRIPT_MAX_LENGTH = 5000;
const CAMERA_SNAPSHOT_MAX_LENGTH = 450000;
const RESET_TOKEN_MIN_LENGTH = 40;
const RESET_TOKEN_MAX_LENGTH = 200;

export const signupValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage("Name must be between 2 and 60 characters"),
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 12, max: 128 })
    .withMessage("Password must be between 12 and 128 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[^A-Za-z0-9]/)
    .withMessage("Password must contain at least one special character")
    .not()
    .matches(/\s/)
    .withMessage("Password cannot include spaces"),
];

export const loginValidation = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

export const forgotPasswordValidation = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
];

export const resetPasswordValidation = [
  body("token")
    .trim()
    .isLength({ min: RESET_TOKEN_MIN_LENGTH, max: RESET_TOKEN_MAX_LENGTH })
    .withMessage("A valid password reset token is required"),
  body("password")
    .isLength({ min: 12, max: 128 })
    .withMessage("Password must be between 12 and 128 characters")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[a-z]/)
    .withMessage("Password must contain at least one lowercase letter")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[^A-Za-z0-9]/)
    .withMessage("Password must contain at least one special character")
    .not()
    .matches(/\s/)
    .withMessage("Password cannot include spaces"),
];

export const googleAuthValidation = [
  body("credential")
    .trim()
    .isLength({ min: 20, max: 4096 })
    .withMessage("A valid Google credential is required"),
];

export const interviewStartValidation = [
  body("role")
    .optional()
    .isString()
    .trim()
    .isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH })
    .withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
  body("difficulty")
    .optional()
    .isString()
    .trim()
    .isIn(["Easy", "Medium", "FAANG"])
    .withMessage("Difficulty must be one of: Easy, Medium, FAANG"),
  body("category")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: CATEGORY_MAX_LENGTH })
    .withMessage(`Category must be between 2 and ${CATEGORY_MAX_LENGTH} characters`),
  body("previousQuestions")
    .optional()
    .isArray({ max: 20 })
    .withMessage("previousQuestions can contain at most 20 items"),
  body("previousQuestions.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 3, max: QUESTION_MAX_LENGTH })
    .withMessage(`Each previous question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
  body("previousCategories")
    .optional()
    .isArray({ max: 20 })
    .withMessage("previousCategories can contain at most 20 items"),
  body("previousCategories.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: CATEGORY_MAX_LENGTH })
    .withMessage(`Each previous category must be between 2 and ${CATEGORY_MAX_LENGTH} characters`),
  body("sessionId")
    .optional()
    .isMongoId()
    .withMessage("sessionId must be a valid identifier"),
];

export const feedbackValidation = [
  body("role")
    .trim()
    .isLength({ min: ROLE_MIN_LENGTH, max: ROLE_MAX_LENGTH })
    .withMessage(`Role must be between ${ROLE_MIN_LENGTH} and ${ROLE_MAX_LENGTH} characters`),
  body("question")
    .trim()
    .isLength({ min: 3, max: QUESTION_MAX_LENGTH })
    .withMessage(`Question must be between 3 and ${QUESTION_MAX_LENGTH} characters`),
  body("answer")
    .trim()
    .isLength({ min: 1, max: ANSWER_MAX_LENGTH })
    .withMessage(`Answer must be between 1 and ${ANSWER_MAX_LENGTH} characters`),
  body("expectedPoints")
    .optional()
    .isArray({ max: 8 })
    .withMessage("expectedPoints can contain at most 8 items"),
  body("expectedPoints.*")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 2, max: 240 })
    .withMessage("Each expected point must be between 2 and 240 characters"),
  body("speechTranscript")
    .optional()
    .isString()
    .trim()
    .isLength({ max: TRANSCRIPT_MAX_LENGTH })
    .withMessage(`speechTranscript can be at most ${TRANSCRIPT_MAX_LENGTH} characters`),
  body("answerDurationSec")
    .optional()
    .isInt({ min: 0, max: 7200 })
    .withMessage("answerDurationSec must be between 0 and 7200 seconds"),
  body("cameraSnapshot")
    .optional()
    .isString()
    .isLength({ max: CAMERA_SNAPSHOT_MAX_LENGTH })
    .withMessage(`cameraSnapshot is too large (max ${CAMERA_SNAPSHOT_MAX_LENGTH} chars)`)
    .matches(/^data:image\/(jpeg|jpg|png);base64,/i)
    .withMessage("cameraSnapshot must be a base64 encoded image data URL"),
  body("sessionQuestionIndex")
    .optional()
    .isInt({ min: 0, max: 200 })
    .withMessage("sessionQuestionIndex must be between 0 and 200"),
  body("sessionId")
    .optional()
    .isMongoId()
    .withMessage("sessionId must be a valid identifier"),
];

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => (e as { msg: string }).msg).join("; ");
    return res.status(400).json({ success: false, message: msg });
  }
  next();
}
