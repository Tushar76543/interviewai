import { AuthService } from "../services/auth.service.js";
const isProduction = process.env.NODE_ENV === "production";
const ACCESS_TOKEN_COOKIE = "token";
const REFRESH_TOKEN_COOKIE = "refresh_token";
const parseDurationMs = (raw, fallbackMs) => {
    const normalized = raw.trim().toLowerCase();
    const match = normalized.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
        const parsed = Number.parseInt(normalized, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed * 1000 : fallbackMs;
    }
    const amount = Number.parseInt(match[1], 10);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) {
        return fallbackMs;
    }
    if (unit === "s")
        return amount * 1000;
    if (unit === "m")
        return amount * 60 * 1000;
    if (unit === "h")
        return amount * 60 * 60 * 1000;
    return amount * 24 * 60 * 60 * 1000;
};
const ACCESS_TOKEN_MAX_AGE_MS = parseDurationMs(process.env.JWT_ACCESS_TTL ?? "15m", 15 * 60 * 1000);
const REFRESH_TOKEN_MAX_AGE_MS = parseDurationMs(process.env.JWT_REFRESH_TTL ?? "14d", 14 * 24 * 60 * 60 * 1000);
const BASE_COOKIE_OPTIONS = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
};
const ACCESS_COOKIE_OPTIONS = {
    ...BASE_COOKIE_OPTIONS,
    path: "/",
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
};
const REFRESH_COOKIE_OPTIONS = {
    ...BASE_COOKIE_OPTIONS,
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
};
const CLEAR_ACCESS_COOKIE_OPTIONS = {
    ...ACCESS_COOKIE_OPTIONS,
    maxAge: 0,
};
const CLEAR_REFRESH_COOKIE_OPTIONS = {
    ...REFRESH_COOKIE_OPTIONS,
    maxAge: 0,
};
const getRequestMetadata = (req) => {
    const forwardedFor = req.header("x-forwarded-for");
    const forwardedIp = forwardedFor?.split(",")[0]?.trim() ?? "";
    return {
        ipAddress: forwardedIp || req.ip || "",
        userAgent: req.header("user-agent") ?? "",
    };
};
const setAuthCookies = (res, tokens) => {
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, ACCESS_COOKIE_OPTIONS);
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, REFRESH_COOKIE_OPTIONS);
};
const clearAuthCookies = (res) => {
    res.clearCookie(ACCESS_TOKEN_COOKIE, CLEAR_ACCESS_COOKIE_OPTIONS);
    res.clearCookie(REFRESH_TOKEN_COOKIE, CLEAR_REFRESH_COOKIE_OPTIONS);
};
const extractAccessToken = (req) => {
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "").trim() ?? "";
    return (req.cookies?.[ACCESS_TOKEN_COOKIE] ?? bearer).trim();
};
const extractRefreshToken = (req) => (req.cookies?.[REFRESH_TOKEN_COOKIE] ?? "").trim();
export class AuthController {
    static async signup(req, res) {
        try {
            const { name, email, password } = req.body;
            const tokens = await AuthService.signup(name, email, password, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
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
            const tokens = await AuthService.login(email, password, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
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
    static async googleLogin(req, res) {
        try {
            const { credential } = req.body;
            const tokens = await AuthService.loginWithGoogle(credential, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
            return res.json({
                success: true,
                message: "Google login successful",
                user,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Google login failed";
            return res.status(400).json({
                success: false,
                message,
            });
        }
    }
    static async refresh(req, res) {
        try {
            const refreshToken = extractRefreshToken(req);
            if (!refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: "Refresh token is missing",
                });
            }
            const tokens = await AuthService.refreshTokens(refreshToken, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
            return res.json({
                success: true,
                message: "Session refreshed",
                user,
            });
        }
        catch (err) {
            clearAuthCookies(res);
            const message = err instanceof Error ? err.message : "Session refresh failed";
            return res.status(401).json({
                success: false,
                message,
            });
        }
    }
    static async forgotPassword(req, res) {
        try {
            const { email } = req.body;
            const { resetToken } = await AuthService.requestPasswordReset(email);
            const genericMessage = "If an account exists for this email, you will receive password reset instructions shortly.";
            const frontendUrl = (process.env.FRONTEND_URL ?? "").trim();
            const devFallbackUrl = "http://localhost:5173";
            const baseUrl = frontendUrl.startsWith("http://") || frontendUrl.startsWith("https://")
                ? frontendUrl
                : devFallbackUrl;
            const resetUrl = process.env.NODE_ENV === "production" || !resetToken
                ? undefined
                : `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;
            if (resetUrl) {
                console.info("Password reset link (development only):", resetUrl);
            }
            return res.json({
                success: true,
                message: genericMessage,
                resetUrl,
            });
        }
        catch {
            return res.status(500).json({
                success: false,
                message: "Failed to process password reset request",
            });
        }
    }
    static async resetPassword(req, res) {
        try {
            const { token, password } = req.body;
            const tokens = await AuthService.resetPassword(token, password, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
            return res.json({
                success: true,
                message: "Password reset successful",
                user,
            });
        }
        catch (err) {
            const message = err instanceof Error ? err.message : "Password reset failed";
            return res.status(400).json({
                success: false,
                message,
            });
        }
    }
    static async getMe(req, res) {
        try {
            const accessToken = extractAccessToken(req);
            const refreshToken = extractRefreshToken(req);
            if (!accessToken && !refreshToken) {
                return res.status(401).json({
                    success: false,
                    message: "Not authenticated",
                });
            }
            if (accessToken) {
                try {
                    const user = await AuthService.getUserFromToken(accessToken);
                    return res.json({
                        success: true,
                        user,
                    });
                }
                catch {
                    // Fallback to refresh token flow below.
                }
            }
            if (!refreshToken) {
                clearAuthCookies(res);
                return res.status(401).json({
                    success: false,
                    message: "Invalid or expired token",
                });
            }
            const tokens = await AuthService.refreshTokens(refreshToken, getRequestMetadata(req));
            const user = await AuthService.getUserFromToken(tokens.accessToken);
            setAuthCookies(res, tokens);
            return res.json({
                success: true,
                user,
            });
        }
        catch {
            clearAuthCookies(res);
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token",
            });
        }
    }
    static async logout(req, res) {
        await AuthService.logout({
            accessToken: extractAccessToken(req),
            refreshToken: extractRefreshToken(req),
        });
        clearAuthCookies(res);
        return res.json({
            success: true,
            message: "Logged out",
        });
    }
}
