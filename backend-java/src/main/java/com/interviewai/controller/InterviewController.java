package com.interviewai.controller;

import com.interviewai.dto.InterviewDtos.QuestionPayload;
import com.interviewai.dto.InterviewDtos.StartInterviewRequest;
import com.interviewai.dto.InterviewDtos.StartInterviewResponse;
import com.interviewai.exception.ApiException;
import com.interviewai.model.InterviewSession;
import com.interviewai.repository.InterviewSessionRepository;
import com.interviewai.security.UserPrincipal;
import com.interviewai.service.OpenAiService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.ArrayList;

@RestController
@RequestMapping("/api/interview")
@Tag(name = "Interview", description = "Interview lifecycle management and question generation")
public class InterviewController {

    private final OpenAiService openAiService;
    private final InterviewSessionRepository interviewSessionRepository;

    public InterviewController(OpenAiService openAiService, InterviewSessionRepository interviewSessionRepository) {
        this.openAiService = openAiService;
        this.interviewSessionRepository = interviewSessionRepository;
    }

    @PostMapping("/start")
    @Operation(summary = "Generate next interview question and start or resume session")
    public ResponseEntity<StartInterviewResponse> startInterview(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody StartInterviewRequest request
    ) {
        String role = request.getRole() != null && !request.getRole().isBlank() ? request.getRole() : "Software Engineer";
        String difficulty = request.getDifficulty() != null && !request.getDifficulty().isBlank() ? request.getDifficulty() : "Medium";
        String category = request.getCategory() != null && !request.getCategory().isBlank() ? request.getCategory() : "Mixed";

        QuestionPayload question = openAiService.generateQuestion(
                role, difficulty, request.getPreviousQuestions(), category
        );

        InterviewSession session;
        if (request.getSessionId() != null && !request.getSessionId().isBlank()) {
            session = interviewSessionRepository.findByIdAndUserId(request.getSessionId(), principal.getId())
                    .orElseThrow(() -> new ApiException("Session not found", HttpStatus.NOT_FOUND));

            session.getQuestions().add(new InterviewSession.QAEntry(question.getPrompt(), "", question.getCategory()));
            session.setLastActivityAt(Instant.now());
            session = interviewSessionRepository.save(session);
        } else {
            session = new InterviewSession();
            session.setUserId(principal.getId());
            session.setRole(role);
            session.setDifficulty(difficulty);
            session.setQuestions(new ArrayList<>());
            session.getQuestions().add(new InterviewSession.QAEntry(question.getPrompt(), "", question.getCategory()));
            session.setStartedAt(Instant.now());
            session.setLastActivityAt(Instant.now());
            session = interviewSessionRepository.save(session);
        }

        int questionIndex = Math.max(0, session.getQuestions().size() - 1);
        return ResponseEntity.ok(new StartInterviewResponse(question, session.getId(), questionIndex));
    }
}
