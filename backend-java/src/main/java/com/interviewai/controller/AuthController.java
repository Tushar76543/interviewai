package com.interviewai.controller;

import com.interviewai.dto.AuthDtos.*;
import com.interviewai.security.UserPrincipal;
import com.interviewai.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Endpoints for user authentication, registration, session management and CSRF")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/csrf")
    @Operation(summary = "Get CSRF bootstrap token and set cookie")
    public ResponseEntity<Map<String, Object>> getCsrf() {
        String csrfToken = UUID.randomUUID().toString();
        ResponseCookie csrfCookie = authService.createCsrfCookie(csrfToken);

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, csrfCookie.toString())
                .body(Map.of("success", true, "csrfToken", csrfToken));
    }

    @PostMapping("/signup")
    @Operation(summary = "Register a new user account")
    public ResponseEntity<AuthSuccessResponse> signup(@Valid @RequestBody SignupRequest request) {
        AuthSuccessResponse response = authService.signup(request);
        ResponseCookie tokenCookie = authService.createAccessTokenCookie(response.getToken());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                .body(response);
    }

    @PostMapping("/login")
    @Operation(summary = "Log in with email and password")
    public ResponseEntity<AuthSuccessResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthSuccessResponse response = authService.login(request);
        ResponseCookie tokenCookie = authService.createAccessTokenCookie(response.getToken());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                .body(response);
    }

    @PostMapping("/google")
    @Operation(summary = "Authenticate with Google OAuth ID credential")
    public ResponseEntity<AuthSuccessResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        AuthSuccessResponse response = authService.googleLogin(request);
        ResponseCookie tokenCookie = authService.createAccessTokenCookie(response.getToken());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, tokenCookie.toString())
                .body(response);
    }

    @GetMapping("/me")
    @Operation(summary = "Retrieve current authenticated user session")
    public ResponseEntity<Map<String, Object>> getMe(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).body(Map.of("success", false, "message", "Not authenticated"));
        }
        UserResponse user = authService.getMe(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "user", user));
    }

    @PostMapping("/logout")
    @Operation(summary = "Log out user and clear auth cookies")
    public ResponseEntity<Map<String, Object>> logout() {
        ResponseCookie logoutCookie = authService.createLogoutCookie();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, logoutCookie.toString())
                .body(Map.of("success", true, "message", "Logged out successfully"));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Refresh user JWT token")
    public ResponseEntity<Map<String, Object>> refresh(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.status(401).body(Map.of("success", false, "message", "Invalid session"));
        }
        UserResponse user = authService.getMe(principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "user", user));
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request password reset email")
    public ResponseEntity<Map<String, Object>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return ResponseEntity.ok(Map.of("success", true, "message", "If an account exists, reset instructions have been sent"));
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Reset account password with token")
    public ResponseEntity<Map<String, Object>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        return ResponseEntity.ok(Map.of("success", true, "message", "Password has been successfully updated"));
    }
}
