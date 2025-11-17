import { AuthService } from "../services/auth.service";
const COOKIE_OPTIONS = {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};
export class AuthController {
    // ======================
    // SIGNUP
    // ======================
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
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }
    // ======================
    // LOGIN
    // ======================
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
            return res.status(400).json({
                success: false,
                message: err.message,
            });
        }
    }
    // ======================
    // LOGOUT
    // ======================
    static async logout(req, res) {
        res.clearCookie("token");
        return res.json({
            success: true,
            message: "Logged out",
        });
    }
}
