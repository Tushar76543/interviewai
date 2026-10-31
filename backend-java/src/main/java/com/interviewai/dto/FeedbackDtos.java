package com.interviewai.dto;

import com.interviewai.model.FeedbackJob;
import com.interviewai.model.InterviewSession;
import jakarta.validation.constraints.NotBlank;

import java.util.ArrayList;
import java.util.List;

public class FeedbackDtos {

    public static class CreateFeedbackJobRequest {
        private String role = "Software Engineer";

        @NotBlank(message = "Question is required")
        private String question;

        @NotBlank(message = "Answer is required")
        private String answer;

        private List<String> expectedPoints = new ArrayList<>();
        private String speechTranscript;
        private Integer answerDurationSec;
        private String cameraSnapshot;
        private String sessionId;
        private Integer sessionQuestionIndex;

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
    }

    public static class CreateFeedbackJobResponse {
        private boolean success = true;
        private String jobId;
        private String status;
        private InterviewSession.FeedbackMetrics provisionalFeedback;
        private FeedbackJob.FollowUp provisionalFollowUp;

        public CreateFeedbackJobResponse(String jobId, String status, InterviewSession.FeedbackMetrics provisionalFeedback, FeedbackJob.FollowUp provisionalFollowUp) {
            this.jobId = jobId;
            this.status = status;
            this.provisionalFeedback = provisionalFeedback;
            this.provisionalFollowUp = provisionalFollowUp;
        }

        public boolean isSuccess() {
            return success;
        }

        public void setSuccess(boolean success) {
            this.success = success;
        }

        public String getJobId() {
            return jobId;
        }

        public void setJobId(String jobId) {
            this.jobId = jobId;
        }

        public String getStatus() {
            return status;
        }

        public void setStatus(String status) {
            this.status = status;
        }

        public InterviewSession.FeedbackMetrics getProvisionalFeedback() {
            return provisionalFeedback;
        }

        public void setProvisionalFeedback(InterviewSession.FeedbackMetrics provisionalFeedback) {
            this.provisionalFeedback = provisionalFeedback;
        }

        public FeedbackJob.FollowUp getProvisionalFollowUp() {
            return provisionalFollowUp;
        }

        public void setProvisionalFollowUp(FeedbackJob.FollowUp provisionalFollowUp) {
            this.provisionalFollowUp = provisionalFollowUp;
        }
    }

    public static class FeedbackJobStatusResponse {
        private boolean success = true;
        private String jobId;
        private String status;
        private int attempts;
        private InterviewSession.FeedbackMetrics provisionalFeedback;
        private FeedbackJob.FollowUp provisionalFollowUp;
        private FeedbackJob.JobResult result;

        public FeedbackJobStatusResponse(String jobId, String status, int attempts,
                                        InterviewSession.FeedbackMetrics provisionalFeedback,
                                        FeedbackJob.FollowUp provisionalFollowUp,
                                        FeedbackJob.JobResult result) {
            this.jobId = jobId;
            this.status = status;
            this.attempts = attempts;
            this.provisionalFeedback = provisionalFeedback;
            this.provisionalFollowUp = provisionalFollowUp;
            this.result = result;
        }

        public boolean isSuccess() {
            return success;
        }

        public void setSuccess(boolean success) {
            this.success = success;
        }

        public String getJobId() {
            return jobId;
        }

        public void setJobId(String jobId) {
            this.jobId = jobId;
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

        public InterviewSession.FeedbackMetrics getProvisionalFeedback() {
            return provisionalFeedback;
        }

        public void setProvisionalFeedback(InterviewSession.FeedbackMetrics provisionalFeedback) {
            this.provisionalFeedback = provisionalFeedback;
        }

        public FeedbackJob.FollowUp getProvisionalFollowUp() {
            return provisionalFollowUp;
        }

        public void setProvisionalFollowUp(FeedbackJob.FollowUp provisionalFollowUp) {
            this.provisionalFollowUp = provisionalFollowUp;
        }

        public FeedbackJob.JobResult getResult() {
            return result;
        }

        public void setResult(FeedbackJob.JobResult result) {
            this.result = result;
        }
    }
}
