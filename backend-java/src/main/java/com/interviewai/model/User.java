package com.interviewai.model;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "users")
public class User {

    @Id
    private String id;

    private String name;

    @Indexed(unique = true)
    private String email;

    private String passwordHash;

    private List<String> passwordHistory = new ArrayList<>();

    @Indexed
    private String passwordResetTokenHash;

    private Instant passwordResetExpiresAt;

    private String authProvider = "local"; // "local" | "google"

    @Indexed(unique = true, sparse = true)
    private String googleId;

    private String avatarUrl;

    @Indexed
    private Instant lastLoginAt;

    private String lastLoginFingerprint;

    private List<String> rolePreferences = new ArrayList<>();

    private List<String> interviewHistory = new ArrayList<>();

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public User() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name != null ? name.trim() : null;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email != null ? email.toLowerCase().trim() : null;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public List<String> getPasswordHistory() {
        return passwordHistory;
    }

    public void setPasswordHistory(List<String> passwordHistory) {
        this.passwordHistory = passwordHistory;
    }

    public String getPasswordResetTokenHash() {
        return passwordResetTokenHash;
    }

    public void setPasswordResetTokenHash(String passwordResetTokenHash) {
        this.passwordResetTokenHash = passwordResetTokenHash;
    }

    public Instant getPasswordResetExpiresAt() {
        return passwordResetExpiresAt;
    }

    public void setPasswordResetExpiresAt(Instant passwordResetExpiresAt) {
        this.passwordResetExpiresAt = passwordResetExpiresAt;
    }

    public String getAuthProvider() {
        return authProvider;
    }

    public void setAuthProvider(String authProvider) {
        this.authProvider = authProvider;
    }

    public String getGoogleId() {
        return googleId;
    }

    public void setGoogleId(String googleId) {
        this.googleId = googleId != null ? googleId.trim() : null;
    }

    public String getAvatarUrl() {
        return avatarUrl;
    }

    public void setAvatarUrl(String avatarUrl) {
        this.avatarUrl = avatarUrl;
    }

    public Instant getLastLoginAt() {
        return lastLoginAt;
    }

    public void setLastLoginAt(Instant lastLoginAt) {
        this.lastLoginAt = lastLoginAt;
    }

    public String getLastLoginFingerprint() {
        return lastLoginFingerprint;
    }

    public void setLastLoginFingerprint(String lastLoginFingerprint) {
        this.lastLoginFingerprint = lastLoginFingerprint;
    }

    public List<String> getRolePreferences() {
        return rolePreferences;
    }

    public void setRolePreferences(List<String> rolePreferences) {
        this.rolePreferences = rolePreferences;
    }

    public List<String> getInterviewHistory() {
        return interviewHistory;
    }

    public void setInterviewHistory(List<String> interviewHistory) {
        this.interviewHistory = interviewHistory;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
