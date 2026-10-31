package com.interviewai.service;

import com.interviewai.dto.AuthDtos.*;
import com.interviewai.exception.ApiException;
import com.interviewai.model.User;
import com.interviewai.repository.UserRepository;
import com.interviewai.security.JwtUtils;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.UUID;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtils jwtUtils;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtUtils jwtUtils) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtils = jwtUtils;
    }

    public AuthSuccessResponse signup(SignupRequest request) {
        String email = request.getEmail().toLowerCase().trim();
        if (userRepository.existsByEmail(email)) {
            throw new ApiException("Email is already registered", HttpStatus.CONFLICT);
        }

        User user = new User();
        user.setName(request.getName());
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setAuthProvider("local");
        user.setLastLoginAt(Instant.now());

        User saved = userRepository.save(user);
        String token = jwtUtils.generateAccessToken(saved.getId(), saved.getEmail());

        UserResponse userResponse = mapToUserResponse(saved);
        return new AuthSuccessResponse("Account created successfully", userResponse, token);
    }

    public AuthSuccessResponse login(LoginRequest request) {
        String email = request.getEmail().toLowerCase().trim();
        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException("Invalid email or password", HttpStatus.UNAUTHORIZED));

        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new ApiException("Invalid email or password", HttpStatus.UNAUTHORIZED);
        }

        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        String token = jwtUtils.generateAccessToken(user.getId(), user.getEmail());
        UserResponse userResponse = mapToUserResponse(user);
        return new AuthSuccessResponse("Login successful", userResponse, token);
    }

    public AuthSuccessResponse googleLogin(GoogleLoginRequest request) {
        // Mock / placeholder for Google ID token verification
        // In full flow: verify Google JWT with Google API Client
        String fakeEmail = "google_" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        User user = userRepository.findByGoogleId(request.getCredential())
                .orElseGet(() -> {
                    User newUser = new User();
                    newUser.setName("Google User");
                    newUser.setEmail(fakeEmail);
                    newUser.setAuthProvider("google");
                    newUser.setGoogleId(request.getCredential());
                    return userRepository.save(newUser);
                });

        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        String token = jwtUtils.generateAccessToken(user.getId(), user.getEmail());
        UserResponse userResponse = mapToUserResponse(user);
        return new AuthSuccessResponse("Google login successful", userResponse, token);
    }

    public UserResponse getMe(String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException("User not found", HttpStatus.NOT_FOUND));
        return mapToUserResponse(user);
    }

    public ResponseCookie createAccessTokenCookie(String token) {
        return ResponseCookie.from("accessToken", token)
                .httpOnly(true)
                .secure(false) // set true in production HTTPS
                .path("/")
                .maxAge(15 * 60)
                .sameSite("Lax")
                .build();
    }

    public ResponseCookie createCsrfCookie(String token) {
        return ResponseCookie.from("csrf_token", token)
                .httpOnly(false)
                .secure(false)
                .path("/")
                .maxAge(24 * 60 * 60)
                .sameSite("Lax")
                .build();
    }

    public ResponseCookie createLogoutCookie() {
        return ResponseCookie.from("accessToken", "")
                .httpOnly(true)
                .path("/")
                .maxAge(0)
                .build();
    }

    private UserResponse mapToUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getAuthProvider(),
                user.getAvatarUrl(),
                user.getCreatedAt() != null ? user.getCreatedAt().toString() : Instant.now().toString()
        );
    }
}
