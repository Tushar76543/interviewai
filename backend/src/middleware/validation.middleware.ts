import { Request, Response, NextFunction } from "express";
import { body, validationResult } from "express-validator";

export const signupValidation = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/\d/)
    .withMessage("Password must contain at least one number")
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter"),
];

export const loginValidation = [
  body("email").trim().isEmail().withMessage("Valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

export const interviewStartValidation = [
  body("role").optional().trim().notEmpty(),
  body("difficulty").optional().trim().notEmpty(),
];

export const feedbackValidation = [
  body("role").trim().notEmpty().withMessage("Role is required"),
  body("question").trim().notEmpty().withMessage("Question is required"),
  body("answer").trim().notEmpty().withMessage("Answer is required"),
];

export function handleValidationErrors(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const msg = errors.array().map((e) => (e as any).msg).join("; ");
    return res.status(400).json({ success: false, message: msg });
  }
  next();
}
