import { AuthService } from "../services/auth.service.js";
const isProduction = process.env.NODE_ENV === "production";
const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
};
const CLEAR_COOKIE_OPTIONS = {
    ...COOKIE_OPTIONS,
    maxAge: 0,
};
export class AuthController {
    static async signup(req, res) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Signup failed";
            return res.status(400).json({
                success: false,
                message,
            });
        }
    }
    static async login(req, res) {
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
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Login failed";
            return res.status(400).json({
                success: false,
                message,
            });
        }
    }
    static async getMe(req, res) {
        try {
            const token = req.cookies?.token ||
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
        }
        catch {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
        }
    }
    static async logout(_req, res) {
        res.clearCookie("token", CLEAR_COOKIE_OPTIONS);
        return res.json({
            success: true,
            message: "Logged out",
        });
    }
}
