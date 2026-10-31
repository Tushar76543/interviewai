package com.interviewai.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.interviewai.config.AppProperties;
import com.interviewai.model.FeedbackJob.FollowUp;
import com.interviewai.model.InterviewSession.FeedbackMetrics;
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
public class FeedbackService {

    private static final Logger logger = LoggerFactory.getLogger(FeedbackService.class);

    private final AppProperties appProperties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public FeedbackService(AppProperties appProperties, ObjectMapper objectMapper) {
        this.appProperties = appProperties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(6))
                .build();
    }

    public record EvaluationResult(FeedbackMetrics metrics, FollowUp followUp, String source) {}

    public EvaluationResult evaluateAnswer(String role, String question, String answer, List<String> expectedPoints) {
        String apiKey = appProperties.getAi().getOpenrouterApiKey();

        if (apiKey != null && !apiKey.isBlank()) {
            try {
                return callOpenRouterForFeedback(role, question, answer, expectedPoints);
            } catch (Exception e) {
                logger.warn("OpenRouter feedback evaluation failed, using calibrated heuristic engine: {}", e.getMessage());
            }
        }

        return evaluateHeuristically(role, question, answer, expectedPoints);
    }

    private EvaluationResult callOpenRouterForFeedback(String role, String question, String answer, List<String> expectedPoints) throws Exception {
        String systemPrompt = "You are a senior technical interviewer evaluating a candidate for " + role + ". "
                + "Evaluate their answer to the question objectively. Expected key points: " + String.join(", ", expectedPoints) + ". "
                + "Output valid JSON only with keys: "
                + "technical (0-10 number), clarity (0-10 number), completeness (0-10 number), overall (0-10 number), "
                + "suggestion (string advice), strengths (array of 2 strings), improvements (array of 2 strings), "
                + "followUpPrompt (string follow-up question), followUpExpectedPoints (array of strings).";

        String userPrompt = "Question: " + question + "\nCandidate Answer: " + answer;

        Map<String, Object> messageSystem = Map.of("role", "system", "content", systemPrompt);
        Map<String, Object> messageUser = Map.of("role", "user", "content", userPrompt);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", appProperties.getAi().getModel());
        requestBody.put("messages", List.of(messageSystem, messageUser));
        requestBody.put("max_tokens", 450);
        requestBody.put("temperature", 0.4);

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

            String cleanJson = extractJson(content);
            JsonNode parsed = objectMapper.readTree(cleanJson);

            FeedbackMetrics metrics = new FeedbackMetrics();
            metrics.setTechnical(clamp(parsed.path("technical").asDouble(7.5)));
            metrics.setClarity(clamp(parsed.path("clarity").asDouble(8.0)));
            metrics.setCompleteness(clamp(parsed.path("completeness").asDouble(7.0)));
            metrics.setOverall(clamp(parsed.path("overall").asDouble(
                    (metrics.getTechnical() * 0.45) + (metrics.getClarity() * 0.3) + (metrics.getCompleteness() * 0.25)
            )));
            metrics.setSuggestion(parsed.path("suggestion").asText("Good technical communication; structure complex points systematically."));

            List<String> strengths = new ArrayList<>();
            if (parsed.has("strengths") && parsed.get("strengths").isArray()) {
                parsed.get("strengths").forEach(n -> strengths.add(n.asText()));
            }
            if (strengths.isEmpty()) strengths.addAll(List.of("Direct answer to core question", "Confident delivery"));
            metrics.setStrengths(strengths);

            List<String> improvements = new ArrayList<>();
            if (parsed.has("improvements") && parsed.get("improvements").isArray()) {
                parsed.get("improvements").forEach(n -> improvements.add(n.asText()));
            }
            if (improvements.isEmpty()) improvements.addAll(List.of("Provide concrete architectural tradeoffs", "Detail edge cases and failure modes"));
            metrics.setImprovements(improvements);

            String followUpPrompt = parsed.path("followUpPrompt").asText("How would your approach scale under ten times the expected workload?");
            List<String> followUpPoints = new ArrayList<>();
            if (parsed.has("followUpExpectedPoints") && parsed.get("followUpExpectedPoints").isArray()) {
                parsed.get("followUpExpectedPoints").forEach(n -> followUpPoints.add(n.asText()));
            }
            if (followUpPoints.isEmpty()) followUpPoints.addAll(List.of("Scalability bottlenecks", "Resource consumption"));

            FollowUp followUp = new FollowUp("fu_" + UUID.randomUUID().toString().substring(0, 8), followUpPrompt, followUpPoints);
            return new EvaluationResult(metrics, followUp, "ai_calibrated");
        }

        throw new RuntimeException("Failed AI feedback API call status: " + response.statusCode());
    }

    public EvaluationResult evaluateHeuristically(String role, String question, String answer, List<String> expectedPoints) {
        String trimmed = answer != null ? answer.trim() : "";
        int wordCount = trimmed.isEmpty() ? 0 : trimmed.split("\\s+").length;

        // Heuristic scoring based on length, keyword coverage, and structure
        double baseTech = 5.0;
        double baseClarity = 6.0;
        double baseComp = 5.0;

        int matchedPoints = 0;
        if (expectedPoints != null && !expectedPoints.isEmpty()) {
            String lowerAnswer = trimmed.toLowerCase();
            for (String pt : expectedPoints) {
                String[] tokens = pt.toLowerCase().split("\\s+");
                for (String token : tokens) {
                    if (token.length() > 3 && lowerAnswer.contains(token)) {
                        matchedPoints++;
                        break;
                    }
                }
            }
        }

        double coverageRatio = (expectedPoints != null && !expectedPoints.isEmpty())
                ? (double) matchedPoints / expectedPoints.size()
                : 0.5;

        // Word count bonus
        if (wordCount >= 40) {
            baseTech += 1.5;
            baseComp += 2.0;
            baseClarity += 1.0;
        }
        if (wordCount >= 100) {
            baseTech += 1.0;
            baseComp += 1.5;
        }

        baseTech += (coverageRatio * 2.5);
        baseComp += (coverageRatio * 2.0);

        double technical = clamp(baseTech);
        double clarity = clamp(baseClarity);
        double completeness = clamp(baseComp);
        double overall = clamp((technical * 0.45) + (clarity * 0.3) + (completeness * 0.25));

        FeedbackMetrics metrics = new FeedbackMetrics();
        metrics.setTechnical(technical);
        metrics.setClarity(clarity);
        metrics.setCompleteness(completeness);
        metrics.setOverall(overall);

        if (overall >= 8.0) {
            metrics.setSuggestion("Excellent explanation! You demonstrated solid depth and clear conceptual command.");
            metrics.setStrengths(List.of("Thorough understanding of foundational principles", "Structured, coherent flow"));
            metrics.setImprovements(List.of("Consider quantifying performance impact", "Highlight monitoring and observability"));
        } else if (overall >= 6.0) {
            metrics.setSuggestion("Solid response. Try to elaborate more on concrete production examples and edge cases.");
            metrics.setStrengths(List.of("Correct high-level concepts", "Clear vocabulary"));
            metrics.setImprovements(List.of("Expand on system tradeoffs and downsides", "Detail failure handling"));
        } else {
            metrics.setSuggestion("Answer was brief. Expand with specific technical terminology, code flow, and architectural context.");
            metrics.setStrengths(List.of("Addressed the general topic"));
            metrics.setImprovements(List.of("Provide deeper technical explanations", "Include practical engineering examples"));
        }

        FollowUp followUp = new FollowUp(
                "fu_" + UUID.randomUUID().toString().substring(0, 8),
                "Can you walk through how you would test and monitor this in a distributed production environment?",
                List.of("Unit and integration testing strategies", "Prometheus/Grafana metrics", "Alerting on error budgets")
        );

        return new EvaluationResult(metrics, followUp, "heuristic");
    }

    private double clamp(double val) {
        return Math.round(Math.max(1.0, Math.min(10.0, val)) * 10.0) / 10.0;
    }

    private String extractJson(String text) {
        int firstBrace = text.indexOf('{');
        int lastBrace = text.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return text.substring(firstBrace, lastBrace + 1);
        }
        return text;
    }
}
