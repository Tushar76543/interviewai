import { Router } from "express";
import { AuthController } from "../controllers/auth.controller.js";
import { signupValidation, loginValidation, handleValidationErrors, } from "../middleware/validation.middleware.js";
const router = Router();
router.post("/signup", signupValidation, handleValidationErrors, AuthController.signup);
router.post("/login", loginValidation, handleValidationErrors, AuthController.login);
router.get("/me", AuthController.getMe);
router.post("/logout", AuthController.logout);
export default router;
