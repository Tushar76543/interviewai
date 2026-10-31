package com.interviewai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private Jwt jwt = new Jwt();
    private Cors cors = new Cors();
    private Ai ai = new Ai();

    public Jwt getJwt() {
        return jwt;
    }

    public void setJwt(Jwt jwt) {
        this.jwt = jwt;
    }

    public Cors getCors() {
        return cors;
    }

    public void setCors(Cors cors) {
        this.cors = cors;
    }

    public Ai getAi() {
        return ai;
    }

    public void setAi(Ai ai) {
        this.ai = ai;
    }

    public static class Jwt {
        private String secret = "dev-secret-key-replace-in-production-at-least-32-chars-long-enough-for-sha256";
        private long accessTokenTtlMs = 900000; // 15 mins
        private long refreshTokenTtlMs = 1209600000; // 14 days

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }

        public long getAccessTokenTtlMs() {
            return accessTokenTtlMs;
        }

        public void setAccessTokenTtlMs(long accessTokenTtlMs) {
            this.accessTokenTtlMs = accessTokenTtlMs;
        }

        public long getRefreshTokenTtlMs() {
            return refreshTokenTtlMs;
        }

        public void setRefreshTokenTtlMs(long refreshTokenTtlMs) {
            this.refreshTokenTtlMs = refreshTokenTtlMs;
        }
    }

    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>(List.of("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5000"));

        public List<String> getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(List<String> allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }
    }

    public static class Ai {
        private String openrouterApiKey = "";
        private String endpoint = "https://openrouter.ai/api/v1/chat/completions";
        private String model = "meta-llama/llama-3.3-70b-instruct:free";
        private List<String> fallbackModels = new ArrayList<>(List.of("meta-llama/llama-3.1-8b-instruct:free", "mistralai/mistral-7b-instruct:free"));
        private int timeoutMs = 8000;
        private int circuitBreakerThreshold = 5;

        public String getOpenrouterApiKey() {
            return openrouterApiKey;
        }

        public void setOpenrouterApiKey(String openrouterApiKey) {
            this.openrouterApiKey = openrouterApiKey;
        }

        public String getEndpoint() {
            return endpoint;
        }

        public void setEndpoint(String endpoint) {
            this.endpoint = endpoint;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public List<String> getFallbackModels() {
            return fallbackModels;
        }

        public void setFallbackModels(List<String> fallbackModels) {
            this.fallbackModels = fallbackModels;
        }

        public int getTimeoutMs() {
            return timeoutMs;
        }

        public void setTimeoutMs(int timeoutMs) {
            this.timeoutMs = timeoutMs;
        }

        public int getCircuitBreakerThreshold() {
            return circuitBreakerThreshold;
        }

        public void setCircuitBreakerThreshold(int circuitBreakerThreshold) {
            this.circuitBreakerThreshold = circuitBreakerThreshold;
        }
    }
}
