package com.interviewai.model;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "feedbackjobs")
@CompoundIndexes({
    @CompoundIndex(name = "user_created", def = "{'userId': 1, 'createdAt': -1}"),
    @CompoundIndex(name = "user_status_created", def = "{'userId': 1, 'status': 1, 'createdAt': -1}"),
    @CompoundIndex(name = "session_idx_created", def = "{'sessionId': 1, 'sessionQuestionIndex': 1, 'createdAt': -1}")
})
public class FeedbackJob {

    @Id
    private String id;

    @Indexed
    private String userId;

    private String sessionId;

    private Integer sessionQuestionIndex;

    private String role;

    private String question;

    private String answer;

    private List<String> expectedPoints = new ArrayList<>();

    private String speechTranscript;

    private Integer answerDurationSec;

    private String cameraSnapshot;

    @Indexed
    private String status = "pending"; // pending | processing | completed | failed

    private int attempts = 0;

    private Instant processingStartedAt;

    private String lastError;

    private InterviewSession.FeedbackMetrics provisionalFeedback;

    private FollowUp provisionalFollowUp;

    private JobResult result;

    @Indexed(expireAfterSeconds = 0)
    private Instant expiresAt = Instant.now().plus(24, ChronoUnit.HOURS);

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public FeedbackJob() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getSessionId() {
        return sessionId;
    }

    public void setSessionId(String sessionId) {
        this.sessionId = sessionId;
    }

    public Integer getSessionQuestionIndex() {
        return sessionQuestionIndex;
    }

    public void setSessionQuestionIndex(Integer sessionQuestionIndex) {
        this.sessionQuestionIndex = sessionQuestionIndex;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getQuestion() {
        return question;
    }

    public void setQuestion(String question) {
        this.question = question;
    }

    public String getAnswer() {
        return answer;
    }

    public void setAnswer(String answer) {
        this.answer = answer;
    }

    public List<String> getExpectedPoints() {
        return expectedPoints;
    }

    public void setExpectedPoints(List<String> expectedPoints) {
        this.expectedPoints = expectedPoints;
    }

    public String getSpeechTranscript() {
        return speechTranscript;
    }

    public void setSpeechTranscript(String speechTranscript) {
        this.speechTranscript = speechTranscript;
    }

    public Integer getAnswerDurationSec() {
        return answerDurationSec;
    }

    public void setAnswerDurationSec(Integer answerDurationSec) {
        this.answerDurationSec = answerDurationSec;
    }

    public String getCameraSnapshot() {
        return cameraSnapshot;
    }

    public void setCameraSnapshot(String cameraSnapshot) {
        this.cameraSnapshot = cameraSnapshot;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public int getAttempts() {
        return attempts;
    }

    public void setAttempts(int attempts) {
        this.attempts = attempts;
    }

    public Instant getProcessingStartedAt() {
        return processingStartedAt;
    }

    public void setProcessingStartedAt(Instant processingStartedAt) {
        this.processingStartedAt = processingStartedAt;
    }

    public String getLastError() {
        return lastError;
    }

    public void setLastError(String lastError) {
        this.lastError = lastError;
    }

    public InterviewSession.FeedbackMetrics getProvisionalFeedback() {
        return provisionalFeedback;
    }

    public void setProvisionalFeedback(InterviewSession.FeedbackMetrics provisionalFeedback) {
        this.provisionalFeedback = provisionalFeedback;
    }

    public FollowUp getProvisionalFollowUp() {
        return provisionalFollowUp;
    }

    public void setProvisionalFollowUp(FollowUp provisionalFollowUp) {
        this.provisionalFollowUp = provisionalFollowUp;
    }

    public JobResult getResult() {
        return result;
    }

    public void setResult(JobResult result) {
        this.result = result;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public void setExpiresAt(Instant expiresAt) {
        this.expiresAt = expiresAt;
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

    public static class FollowUp {
        private String qid;
        private String prompt;
        private List<String> expectedPoints = new ArrayList<>();

        public FollowUp() {
        }

        public FollowUp(String qid, String prompt, List<String> expectedPoints) {
            this.qid = qid;
            this.prompt = prompt;
            this.expectedPoints = expectedPoints;
        }

        public String getQid() {
            return qid;
        }

        public void setQid(String qid) {
            this.qid = qid;
        }

        public String getPrompt() {
            return prompt;
        }

        public void setPrompt(String prompt) {
            this.prompt = prompt;
        }

        public List<String> getExpectedPoints() {
            return expectedPoints;
        }

        public void setExpectedPoints(List<String> expectedPoints) {
            this.expectedPoints = expectedPoints;
        }
    }

    public static class JobResult {
        private InterviewSession.FeedbackMetrics feedback;
        private FollowUp followUp;
        private String source = "ai_calibrated"; // heuristic | ai_calibrated

        public JobResult() {
        }

        public JobResult(InterviewSession.FeedbackMetrics feedback, FollowUp followUp, String source) {
            this.feedback = feedback;
            this.followUp = followUp;
            this.source = source;
        }

        public InterviewSession.FeedbackMetrics getFeedback() {
            return feedback;
        }

        public void setFeedback(InterviewSession.FeedbackMetrics feedback) {
            this.feedback = feedback;
        }

        public FollowUp getFollowUp() {
            return followUp;
        }

        public void setFollowUp(FollowUp followUp) {
            this.followUp = followUp;
        }

        public String getSource() {
            return source;
        }

        public void setSource(String source) {
            this.source = source;
        }
    }
}
