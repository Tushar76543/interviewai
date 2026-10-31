package com.interviewai.model;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "interviewsessions")
@CompoundIndexes({
    @CompoundIndex(name = "user_lastActivity", def = "{'userId': 1, 'lastActivityAt': -1}"),
    @CompoundIndex(name = "user_role_lastActivity", def = "{'userId': 1, 'role': 1, 'lastActivityAt': -1}")
})
public class InterviewSession {

    @Id
    private String id;

    private String userId;

    private String role;

    private String difficulty;

    private List<QAEntry> questions = new ArrayList<>();

    private Instant startedAt = Instant.now();

    private Instant lastActivityAt = Instant.now();

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public InterviewSession() {
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

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public List<QAEntry> getQuestions() {
        return questions;
    }

    public void setQuestions(List<QAEntry> questions) {
        this.questions = questions;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(Instant startedAt) {
        this.startedAt = startedAt;
    }

    public Instant getLastActivityAt() {
        return lastActivityAt;
    }

    public void setLastActivityAt(Instant lastActivityAt) {
        this.lastActivityAt = lastActivityAt;
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

    public static class QAEntry {
        private String question;
        private String answer = "";
        private String category;
        private String speechTranscript;
        private Integer answerDurationSec;
        private String cameraSnapshot;
        private String recordingFileId;
        private String recordingMimeType;
        private Long recordingSizeBytes;
        private FeedbackMetrics feedback;

        public QAEntry() {
        }

        public QAEntry(String question, String answer, String category) {
            this.question = question;
            this.answer = answer;
            this.category = category;
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

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
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

        public String getRecordingFileId() {
            return recordingFileId;
        }

        public void setRecordingFileId(String recordingFileId) {
            this.recordingFileId = recordingFileId;
        }

        public String getRecordingMimeType() {
            return recordingMimeType;
        }

        public void setRecordingMimeType(String recordingMimeType) {
            this.recordingMimeType = recordingMimeType;
        }

        public Long getRecordingSizeBytes() {
            return recordingSizeBytes;
        }

        public void setRecordingSizeBytes(Long recordingSizeBytes) {
            this.recordingSizeBytes = recordingSizeBytes;
        }

        public FeedbackMetrics getFeedback() {
            return feedback;
        }

        public void setFeedback(FeedbackMetrics feedback) {
            this.feedback = feedback;
        }
    }

    public static class FeedbackMetrics {
        private Double technical;
        private Double clarity;
        private Double completeness;
        private Double overall;
        private String suggestion;
        private List<String> strengths = new ArrayList<>();
        private List<String> improvements = new ArrayList<>();

        public FeedbackMetrics() {
        }

        public Double getTechnical() {
            return technical;
        }

        public void setTechnical(Double technical) {
            this.technical = technical;
        }

        public Double getClarity() {
            return clarity;
        }

        public void setClarity(Double clarity) {
            this.clarity = clarity;
        }

        public Double getCompleteness() {
            return completeness;
        }

        public void setCompleteness(Double completeness) {
            this.completeness = completeness;
        }

        public Double getOverall() {
            return overall;
        }

        public void setOverall(Double overall) {
            this.overall = overall;
        }

        public String getSuggestion() {
            return suggestion;
        }

        public void setSuggestion(String suggestion) {
            this.suggestion = suggestion;
        }

        public List<String> getStrengths() {
            return strengths;
        }

        public void setStrengths(List<String> strengths) {
            this.strengths = strengths;
        }

        public List<String> getImprovements() {
            return improvements;
        }

        public void setImprovements(List<String> improvements) {
            this.improvements = improvements;
        }
    }
}
