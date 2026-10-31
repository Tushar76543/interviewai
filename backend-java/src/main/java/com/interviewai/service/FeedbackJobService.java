package com.interviewai.service;

import com.interviewai.dto.FeedbackDtos.CreateFeedbackJobRequest;
import com.interviewai.dto.FeedbackDtos.CreateFeedbackJobResponse;
import com.interviewai.dto.FeedbackDtos.FeedbackJobStatusResponse;
import com.interviewai.exception.ApiException;
import com.interviewai.model.FeedbackJob;
import com.interviewai.model.FeedbackJob.JobResult;
import com.interviewai.model.InterviewSession;
import com.interviewai.repository.FeedbackJobRepository;
import com.interviewai.repository.InterviewSessionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Optional;

@Service
public class FeedbackJobService {

    private static final Logger logger = LoggerFactory.getLogger(FeedbackJobService.class);

    private final FeedbackJobRepository feedbackJobRepository;
    private final InterviewSessionRepository interviewSessionRepository;
    private final FeedbackService feedbackService;

    public FeedbackJobService(FeedbackJobRepository feedbackJobRepository,
                              InterviewSessionRepository interviewSessionRepository,
                              FeedbackService feedbackService) {
        this.feedbackJobRepository = feedbackJobRepository;
        this.interviewSessionRepository = interviewSessionRepository;
        this.feedbackService = feedbackService;
    }

    public CreateFeedbackJobResponse createJob(String userId, CreateFeedbackJobRequest request) {
        FeedbackJob job = new FeedbackJob();
        job.setUserId(userId);
        job.setSessionId(request.getSessionId());
        job.setSessionQuestionIndex(request.getSessionQuestionIndex());
        job.setRole(request.getRole());
        job.setQuestion(request.getQuestion());
        job.setAnswer(request.getAnswer());
        job.setExpectedPoints(request.getExpectedPoints());
        job.setSpeechTranscript(request.getSpeechTranscript());
        job.setAnswerDurationSec(request.getAnswerDurationSec());
        job.setCameraSnapshot(request.getCameraSnapshot());
        job.setStatus("pending");

        // Calculate provisional feedback immediately for responsive UI
        FeedbackService.EvaluationResult provisional = feedbackService.evaluateHeuristically(
                request.getRole(), request.getQuestion(), request.getAnswer(), request.getExpectedPoints()
        );
        job.setProvisionalFeedback(provisional.metrics());
        job.setProvisionalFollowUp(provisional.followUp());

        FeedbackJob saved = feedbackJobRepository.save(job);

        // Also persist the provisional answer immediately to the session
        persistToSession(userId, request.getSessionId(), request.getSessionQuestionIndex(),
                request.getQuestion(), request.getAnswer(), request.getSpeechTranscript(),
                request.getAnswerDurationSec(), request.getCameraSnapshot(), provisional.metrics());

        return new CreateFeedbackJobResponse(saved.getId(), saved.getStatus(), saved.getProvisionalFeedback(), saved.getProvisionalFollowUp());
    }

    @Async("feedbackTaskExecutor")
    public void processJobAsync(String jobId) {
        Optional<FeedbackJob> optJob = feedbackJobRepository.findById(jobId);
        if (optJob.isEmpty()) return;

        FeedbackJob job = optJob.get();
        job.setStatus("processing");
        job.setProcessingStartedAt(Instant.now());
        job.setAttempts(job.getAttempts() + 1);
        feedbackJobRepository.save(job);

        try {
            FeedbackService.EvaluationResult eval = feedbackService.evaluateAnswer(
                    job.getRole(), job.getQuestion(), job.getAnswer(), job.getExpectedPoints()
            );

            JobResult result = new JobResult(eval.metrics(), eval.followUp(), eval.source());
            job.setResult(result);
            job.setStatus("completed");
            feedbackJobRepository.save(job);

            // Update session with calibrated final feedback
            persistToSession(job.getUserId(), job.getSessionId(), job.getSessionQuestionIndex(),
                    job.getQuestion(), job.getAnswer(), job.getSpeechTranscript(),
                    job.getAnswerDurationSec(), job.getCameraSnapshot(), eval.metrics());

            logger.info("FeedbackJob {} successfully completed via {}", jobId, eval.source());
        } catch (Exception e) {
            logger.error("Error processing feedback job {}: {}", jobId, e.getMessage());
            job.setStatus("failed");
            job.setLastError(e.getMessage());
            feedbackJobRepository.save(job);
        }
    }

    public FeedbackJobStatusResponse getJobStatus(String jobId, String userId) {
        FeedbackJob job = feedbackJobRepository.findById(jobId)
                .orElseThrow(() -> new ApiException("Job not found", HttpStatus.NOT_FOUND));

        if (!job.getUserId().equals(userId)) {
            throw new ApiException("Unauthorized access to job", HttpStatus.FORBIDDEN);
        }

        return new FeedbackJobStatusResponse(
                job.getId(),
                job.getStatus(),
                job.getAttempts(),
                job.getProvisionalFeedback(),
                job.getProvisionalFollowUp(),
                job.getResult()
        );
    }

    public void persistToSession(String userId, String sessionId, Integer questionIndex,
                                 String question, String answer, String speechTranscript,
                                 Integer answerDurationSec, String cameraSnapshot,
                                 InterviewSession.FeedbackMetrics metrics) {
        if (sessionId == null || sessionId.isBlank()) return;

        interviewSessionRepository.findByIdAndUserId(sessionId, userId).ifPresent(session -> {
            var questions = session.getQuestions();

            InterviewSession.QAEntry targetEntry = null;
            if (questionIndex != null && questionIndex >= 0 && questionIndex < questions.size()) {
                targetEntry = questions.get(questionIndex);
            } else {
                // Find matching question or append
                for (var q : questions) {
                    if (q.getQuestion().equals(question)) {
                        targetEntry = q;
                        break;
                    }
                }
            }

            if (targetEntry != null) {
                targetEntry.setAnswer(answer);
                if (speechTranscript != null) targetEntry.setSpeechTranscript(speechTranscript);
                if (answerDurationSec != null) targetEntry.setAnswerDurationSec(answerDurationSec);
                if (cameraSnapshot != null) targetEntry.setCameraSnapshot(cameraSnapshot);
                targetEntry.setFeedback(metrics);
            } else {
                InterviewSession.QAEntry newEntry = new InterviewSession.QAEntry(question, answer, "General");
                newEntry.setSpeechTranscript(speechTranscript);
                newEntry.setAnswerDurationSec(answerDurationSec);
                newEntry.setCameraSnapshot(cameraSnapshot);
                newEntry.setFeedback(metrics);
                questions.add(newEntry);
            }

            session.setLastActivityAt(Instant.now());
            interviewSessionRepository.save(session);
        });
    }
}
