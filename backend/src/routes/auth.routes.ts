import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import {
  signupValidation,
  loginValidation,
  googleAuthValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  handleValidationErrors,
} from "../middleware/validation.middleware.js";
import { authRateLimit } from "../middleware/rateLimit.middleware.js";
import { issueCsrfToken } from "../middleware/csrf.middleware.js";

const router = Router();

router.get("/csrf", issueCsrfToken);

router.post(
  "/signup",
  authRateLimit,
  signupValidation,
  handleValidationErrors,
  AuthController.signup
);

router.post(
  "/login",
  authRateLimit,
  loginValidation,
  handleValidationErrors,
  AuthController.login
);

router.post(
  "/google",
  authRateLimit,
  googleAuthValidation,
  handleValidationErrors,
  AuthController.googleLogin
);

router.post("/refresh", authRateLimit, AuthController.refresh);

router.post(
  "/forgot-password",
  authRateLimit,
  forgotPasswordValidation,
  handleValidationErrors,
  AuthController.forgotPassword
);

router.post(
  "/reset-password",
  authRateLimit,
  resetPasswordValidation,
  handleValidationErrors,
  AuthController.resetPassword
);

router.get("/me", AuthController.getMe);
router.post("/logout", AuthController.logout);

export default router;
