package com.interviewai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interviewai.config.AppProperties;
import com.interviewai.dto.InterviewDtos.QuestionPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.*;

@Service
public class OpenAiService {

    private static final Logger logger = LoggerFactory.getLogger(OpenAiService.class);

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public OpenAiService(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(6))
                .build();
    }

    public QuestionPayload generateQuestion(String role, String difficulty, List<String> previousQuestions, String category) {
        String apiKey = appProperties.getAi().getOpenrouterApiKey();

        if (apiKey != null && !apiKey.isBlank()) {
            try {
                return callOpenRouterForQuestion(role, difficulty, previousQuestions, category);
            } catch (Exception e) {
                logger.warn("OpenRouter API call failed, falling back to curated question engine: {}", e.getMessage());
            }
        }

        return generateCuratedQuestion(role, difficulty, category, previousQuestions);
    }

    private QuestionPayload callOpenRouterForQuestion(String role, String difficulty, List<String> previousQuestions, String category) throws Exception {
        String systemPrompt = "You are an expert technical interviewer for " + role + ". Generate one targeted interview question for "
                + difficulty + " level in category " + category + ". Output valid JSON only with keys: "
                + "prompt (string), category (string), expectedPoints (array of 3-4 strings), timeLimitSec (number).";

        String userPrompt = "Generate next technical question. Avoid previous: " + String.join(", ", previousQuestions);

        Map<String, Object> messageSystem = Map.of("role", "system", "content", systemPrompt);
        Map<String, Object> messageUser = Map.of("role", "user", "content", userPrompt);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", appProperties.getAi().getModel());
        requestBody.put("messages", List.of(messageSystem, messageUser));
        requestBody.put("max_tokens", 350);
        requestBody.put("temperature", 0.7);

        String jsonPayload = objectMapper.writeValueAsString(requestBody);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(appProperties.getAi().getEndpoint()))
                .timeout(Duration.ofMillis(appProperties.getAi().getTimeoutMs()))
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + appProperties.getAi().getOpenrouterApiKey().trim())
                .header("HTTP-Referer", "http://localhost:5000")
                .header("X-Title", "InterviewAI")
                .POST(HttpRequest.BodyPublishers.ofString(jsonPayload))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        if (response.statusCode() >= 200 && response.statusCode() < 300) {
            JsonNode root = objectMapper.readTree(response.body());
            String content = root.path("choices").path(0).path("message").path("content").asText();

            // Extract JSON from potential markdown code block
            String cleanJson = extractJson(content);
            JsonNode parsed = objectMapper.readTree(cleanJson);

            String prompt = parsed.path("prompt").asText();
            String cat = parsed.path("category").asText(category);
            int timeLimit = parsed.path("timeLimitSec").asInt(difficultyToTimeLimit(difficulty));

            List<String> expectedPoints = new ArrayList<>();
            if (parsed.has("expectedPoints") && parsed.get("expectedPoints").isArray()) {
                for (JsonNode pt : parsed.get("expectedPoints")) {
                    expectedPoints.add(pt.asText());
                }
            }

            if (!prompt.isBlank()) {
                return new QuestionPayload("q_" + UUID.randomUUID().toString().substring(0, 8), cat, prompt, expectedPoints, timeLimit);
            }
        }

        throw new RuntimeException("Unexpected response status from OpenRouter: " + response.statusCode());
    }

    public QuestionPayload generateCuratedQuestion(String role, String difficulty, String category, List<String> previousQuestions) {
        List<CuratedItem> pool = getCuratedQuestions(role, difficulty);
        Set<String> prev = new HashSet<>(previousQuestions != null ? previousQuestions : Collections.emptyList());

        for (CuratedItem item : pool) {
            if (!prev.contains(item.prompt())) {
                return new QuestionPayload("q_" + UUID.randomUUID().toString().substring(0, 8),
                        item.category(), item.prompt(), item.expectedPoints(), difficultyToTimeLimit(difficulty));
            }
        }

        // Default fallback if all were asked
        CuratedItem fallback = pool.get(new Random().nextInt(pool.size()));
        return new QuestionPayload("q_" + UUID.randomUUID().toString().substring(0, 8),
                fallback.category(), fallback.prompt(), fallback.expectedPoints(), difficultyToTimeLimit(difficulty));
    }

    private int difficultyToTimeLimit(String difficulty) {
        if ("Easy".equalsIgnoreCase(difficulty)) return 120;
        if ("FAANG".equalsIgnoreCase(difficulty)) return 240;
        return 180;
    }

    private String extractJson(String text) {
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return text.substring(firstBrace, lastBrace + 1);
        }
        return text;
    }

    private record CuratedItem(String category, String prompt, List<String> expectedPoints) {}

    private List<CuratedItem> getCuratedQuestions(String role, String difficulty) {
        String normalizedRole = role != null ? role.toLowerCase() : "";

        if (normalizedRole.contains("ai") || normalizedRole.contains("data") || normalizedRole.contains("ml")) {
            return List.of(
                new CuratedItem("ML Fundamentals", "Explain the difference between overfitting and underfitting in machine learning models, and how regularization techniques address them.",
                        List.of("High variance vs high bias tradeoff", "L1 Lasso vs L2 Ridge regularization mechanism", "Cross-validation and early stopping strategies", "Impact of feature scaling")),
                new CuratedItem("Model Evaluation", "How do Precision, Recall, and F1-Score differ, and in what real-world business scenarios would you optimize for Recall over Precision?",
                        List.of("Mathematical formulas and definitions", "False Positives vs False Negatives penalty", "Medical diagnostics and fraud detection examples", "ROC-AUC curve interpretation")),
                new CuratedItem("System Design", "How would you design a low-latency real-time feature store and model inference pipeline for recommendation systems?",
                        List.of("Offline batch processing vs online streaming features", "Redis or Feast architecture", "Inference caching and model serving with Triton/TorchServe", "Drift detection monitoring"))
            );
        } else if (normalizedRole.contains("web") || normalizedRole.contains("frontend")) {
            return List.of(
                new CuratedItem("Technical Fundamentals", "Explain the JavaScript Event Loop, microtasks vs macrotasks, and how asynchronous promises execute under the hood.",
                        List.of("Call stack and heap execution context", "Task queue vs Microtask queue priority", "Promise.then vs setTimeout timing", "Rendering phase in browser loop")),
                new CuratedItem("Performance", "How would you optimize Core Web Vitals (LCP, FID/INP, CLS) for a high-traffic single page application?",
                        List.of("Code splitting and lazy loading dynamic imports", "Image optimization, responsive srcset, and webp formats", "Font preloading and avoiding layout shifts", "Critical CSS inlining")),
                new CuratedItem("Security", "Explain Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF). How do modern web apps defend against both?",
                        List.of("Stored vs Reflected vs DOM-based XSS", "SameSite cookie attributes and HttpOnly protection", "Double submit cookie pattern and CSRF tokens", "Content Security Policy (CSP) headers"))
            );
        } else {
            // Software Engineer / Backend / Full Stack
            return List.of(
                new CuratedItem("Technical Fundamentals", "Explain how HashMap works internally in Java, including collision resolution and resizing dynamics in Java 8+.",
                        List.of("Array of buckets and hash code computation", "Separate chaining with linked lists and Red-Black trees after threshold 8", "Load factor 0.75 and rehashing cost", "Thread-safety contrast with ConcurrentHashMap")),
                new CuratedItem("System Design", "Design a distributed rate limiter that can handle 100,000 requests per second across multiple regional servers.",
                        List.of("Token Bucket vs Sliding Window Log algorithms", "Centralized Redis counter with Lua scripts for atomicity", "Local in-memory token caching with asynchronous batch sync", "Handling Redis failover and degraded states")),
                new CuratedItem("Database", "Explain the difference between Optimistic and Pessimistic locking. When should you use each in a high-concurrency transactional system?",
                        List.of("Database row locks vs version/timestamp column checking", "Performance impact on write contention", "Deadlock risks and mitigation", "Isolation levels: Read Committed vs Repeatable Read vs Serializable"))
            );
        }
    }
}
