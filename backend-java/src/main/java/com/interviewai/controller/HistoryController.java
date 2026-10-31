package com.interviewai.controller;

import com.interviewai.exception.ApiException;
import com.interviewai.model.InterviewSession;
import com.interviewai.repository.InterviewSessionRepository;
import com.interviewai.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/history")
@Tag(name = "History", description = "Interview session history and performance tracking")
public class HistoryController {

    private final InterviewSessionRepository interviewSessionRepository;

    public HistoryController(InterviewSessionRepository interviewSessionRepository) {
        this.interviewSessionRepository = interviewSessionRepository;
    }

    @GetMapping
    @Operation(summary = "List all past interview sessions for authenticated user")
    public ResponseEntity<Map<String, Object>> getHistory(@AuthenticationPrincipal UserPrincipal principal) {
        List<InterviewSession> sessions = interviewSessionRepository.findByUserIdOrderByLastActivityAtDesc(principal.getId());
        return ResponseEntity.ok(Map.of("sessions", sessions));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Get detailed session summary by session ID")
    public ResponseEntity<Map<String, Object>> getSessionDetail(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String id
    ) {
        InterviewSession session = interviewSessionRepository.findByIdAndUserId(id, principal.getId())
                .orElseThrow(() -> new ApiException("Session not found", HttpStatus.NOT_FOUND));

        return ResponseEntity.ok(Map.of("session", session));
    }
}
