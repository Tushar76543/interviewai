package com.interviewai.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.Map;

@RestController
@Tag(name = "Operations & Health", description = "System health, readiness and metrics endpoints")
public class OpsController {

    private final MongoTemplate mongoTemplate;

    public OpsController(MongoTemplate mongoTemplate) {
        this.mongoTemplate = mongoTemplate;
    }

    @GetMapping({"/api/health", "/health"})
    @Operation(summary = "Liveness probe")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
                "status", "ok",
                "uptime", ManagementFactory.getRuntimeMXBean().getUptime() / 1000,
                "timestamp", Instant.now().toString(),
                "service", "interviewai-spring-boot"
        ));
    }

    @GetMapping({"/api/ready", "/ready"})
    @Operation(summary = "Readiness probe verifying database connectivity")
    public ResponseEntity<Map<String, Object>> readiness() {
        try {
            mongoTemplate.getDb().runCommand(new org.bson.Document("ping", 1));
            return ResponseEntity.ok(Map.of(
                    "status", "ready",
                    "dbState", 1,
                    "timestamp", Instant.now().toString()
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "status", "degraded",
                    "error", e.getMessage(),
                    "timestamp", Instant.now().toString()
            ));
        }
    }

    @GetMapping("/api/metrics")
    @Operation(summary = "Basic performance metrics")
    public ResponseEntity<Map<String, Object>> metrics() {
        Runtime runtime = Runtime.getRuntime();
        long totalMemory = runtime.totalMemory();
        long freeMemory = runtime.freeMemory();
        long usedMemory = totalMemory - freeMemory;

        return ResponseEntity.ok(Map.of(
                "uptimeSec", ManagementFactory.getRuntimeMXBean().getUptime() / 1000,
                "usedMemoryBytes", usedMemory,
                "totalMemoryBytes", totalMemory,
                "availableProcessors", runtime.availableProcessors()
        ));
    }
}
