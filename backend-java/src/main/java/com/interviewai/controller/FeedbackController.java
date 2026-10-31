package com.interviewai.controller;

import com.interviewai.dto.FeedbackDtos.CreateFeedbackJobRequest;
import com.interviewai.dto.FeedbackDtos.CreateFeedbackJobResponse;
import com.interviewai.dto.FeedbackDtos.FeedbackJobStatusResponse;
import com.interviewai.security.UserPrincipal;
import com.interviewai.service.FeedbackJobService;
import com.interviewai.service.FeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/interview/feedback")
@Tag(name = "Feedback", description = "Endpoints for answer evaluation and background feedback jobs")
public class FeedbackController {

    private final FeedbackJobService feedbackJobService;
    private final FeedbackService feedbackService;

    public FeedbackController(FeedbackJobService feedbackJobService, FeedbackService feedbackService) {
        this.feedbackJobService = feedbackJobService;
        this.feedbackService = feedbackService;
    }

    @PostMapping("/jobs")
    @Operation(summary = "Submit an answer for background asynchronous AI grading")
    public ResponseEntity<CreateFeedbackJobResponse> createFeedbackJob(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateFeedbackJobRequest request
    ) {
        CreateFeedbackJobResponse response = feedbackJobService.createJob(principal.getId(), request);

        // Dispatch background processing to thread pool
        feedbackJobService.processJobAsync(response.getJobId());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/jobs/{jobId}")
    @Operation(summary = "Poll feedback job status and retrieve final evaluation results")
    public ResponseEntity<FeedbackJobStatusResponse> getJobStatus(
            @AuthenticationPrincipal UserPrincipal principal,
            @PathVariable String jobId
    ) {
        FeedbackJobStatusResponse response = feedbackJobService.getJobStatus(jobId, principal.getId());
        return ResponseEntity.ok(response);
    }

    @PostMapping
    @Operation(summary = "Synchronously evaluate candidate answer")
    public ResponseEntity<Map<String, Object>> evaluateSynchronously(
            @AuthenticationPrincipal UserPrincipal principal,
            @Valid @RequestBody CreateFeedbackJobRequest request
    ) {
        FeedbackService.EvaluationResult result = feedbackService.evaluateAnswer(
                request.getRole(), request.getQuestion(), request.getAnswer(), request.getExpectedPoints()
        );

        feedbackJobService.persistToSession(principal.getId(), request.getSessionId(), request.getSessionQuestionIndex(),
                request.getQuestion(), request.getAnswer(), request.getSpeechTranscript(),
                request.getAnswerDurationSec(), request.getCameraSnapshot(), result.metrics());

        return ResponseEntity.ok(Map.of(
                "success", true,
                "feedback", result.metrics(),
                "followUp", result.followUp(),
                "source", result.source()
        ));
    }
}
