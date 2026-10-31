package com.interviewai.security;

import com.interviewai.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

@Component
public class JwtUtils {

    private final AppProperties appProperties;
    private final SecretKey signingKey;

    public JwtUtils(AppProperties appProperties) {
        this.appProperties = appProperties;
        String rawSecret = appProperties.getJwt().getSecret();
        if (rawSecret == null || rawSecret.length() < 32) {
            rawSecret = "default-dev-secret-key-that-is-at-least-32-chars-long";
        }
        this.signingKey = Keys.hmacShaKeyFor(rawSecret.getBytes(StandardCharsets.UTF_8));
    }

    public String generateAccessToken(String userId, String email) {
        long ttl = appProperties.getJwt().getAccessTokenTtlMs();
        return Jwts.builder()
                .subject(userId)
                .claim("email", email)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ttl))
                .signWith(signingKey)
                .compact();
    }

    public String generateRefreshToken(String userId) {
        long ttl = appProperties.getJwt().getRefreshTokenTtlMs();
        return Jwts.builder()
                .subject(userId)
                .claim("type", "refresh")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + ttl))
                .signWith(signingKey)
                .compact();
    }

    public String getUserIdFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.getSubject();
    }

    public String getEmailFromToken(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return claims.get("email", String.class);
    }

    public boolean validateToken(String token) {
        try {
            Jwts.parser()
                    .verifyWith(signingKey)
                    .build()
                    .parseSignedClaims(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    public String extractTokenFromRequest(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (bearer != null && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }

        if (request.getCookies() != null) {
            for (Cookie cookie : request.getCookies()) {
                if ("accessToken".equals(cookie.getName()) || "token".equals(cookie.getName())) {
                    return cookie.getValue();
                }
            }
        }
        return null;
    }
}
