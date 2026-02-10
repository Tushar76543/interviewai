import { Request, Response } from "express";
import { AuthService } from "../services/auth.service.js";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

export class AuthController {

  // ======================
  // SIGNUP
  // ======================
  static async signup(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body;

      const token = await AuthService.signup(name, email, password);
      const user = await AuthService.getUserFromToken(token);

      res.cookie("token", token, COOKIE_OPTIONS);

      return res.json({
        success: true,
        message: "Signup successful",
        user,
        token, // For cross-origin: frontend stores and sends via Authorization header
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ======================
  // LOGIN
  // ======================
  static async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const token = await AuthService.login(email, password);
      const user = await AuthService.getUserFromToken(token);

      res.cookie("token", token, COOKIE_OPTIONS);

      return res.json({
        success: true,
        message: "Login successful",
        user,
        token, // For cross-origin: frontend stores and sends via Authorization header
      });
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err.message,
      });
    }
  }

  // ======================
  // GET ME (Current User)
  // ======================
  static async getMe(req: Request, res: Response) {
    try {
      const token =
        req.cookies?.token ||
        req.headers.authorization?.replace("Bearer ", "");

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated",
        });
      }

      const user = await AuthService.getUserFromToken(token);

      return res.json({
        success: true,
        user,
      });
    } catch (err: any) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
  }

  // ======================
  // LOGOUT
  // ======================
  static async logout(req: Request, res: Response) {
    res.clearCookie("token");
    return res.json({
      success: true,
      message: "Logged out",
    });
  }
}

