import { Request, Response, CookieOptions } from "express";
import { AuthService } from "../services/auth.service.js";

const isProduction = process.env.NODE_ENV === "production";

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
  maxAge: 1000 * 60 * 60 * 24 * 7,
};

const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  ...COOKIE_OPTIONS,
  maxAge: 0,
};

export class AuthController {
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
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Signup failed";
      return res.status(400).json({
        success: false,
        message,
      });
    }
  }

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
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      return res.status(400).json({
        success: false,
        message,
      });
    }
  }

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
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token",
      });
    }
  }

  static async logout(_req: Request, res: Response) {
    res.clearCookie("token", CLEAR_COOKIE_OPTIONS);
    return res.json({
      success: true,
      message: "Logged out",
    });
  }
}
