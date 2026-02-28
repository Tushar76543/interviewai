import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

const ROLE_MIN_LENGTH = 2;
const ROLE_MAX_LENGTH = 80;
const QUESTION_MAX_LENGTH = 1000;
const ANSWER_MAX_LENGTH = 5000;

export const signupValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 60 })
    .withMessage("Name must be between 2 and 60 characters"),
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter"),
];

export const loginValidation = [
  body("email").trim().isEmail().normalizeEmail().withMessage("Valid email is required"),
  body("password").isString().notEmpty().withMessage("Password is required"),
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
