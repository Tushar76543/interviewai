package com.interviewai.dto;

import java.util.ArrayList;
import java.util.List;

public class InterviewDtos {

    public static class StartInterviewRequest {
        private String role = "Software Engineer";
        private String difficulty = "Medium";
        private String category = "Mixed";
        private List<String> previousQuestions = new ArrayList<>();
        private List<String> previousCategories = new ArrayList<>();
        private String sessionId;

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

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
        }

        public List<String> getPreviousQuestions() {
            return previousQuestions;
        }

        public void setPreviousQuestions(List<String> previousQuestions) {
            this.previousQuestions = previousQuestions;
        }

        public List<String> getPreviousCategories() {
            return previousCategories;
        }

        public void setPreviousCategories(List<String> previousCategories) {
            this.previousCategories = previousCategories;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }
    }

    public static class QuestionPayload {
        private String qid;
        private String category;
        private String prompt;
        private List<String> expectedPoints = new ArrayList<>();
        private int timeLimitSec = 180;

        public QuestionPayload() {
        }

        public QuestionPayload(String qid, String category, String prompt, List<String> expectedPoints, int timeLimitSec) {
            this.qid = qid;
            this.category = category;
            this.prompt = prompt;
            this.expectedPoints = expectedPoints;
            this.timeLimitSec = timeLimitSec;
        }

        public String getQid() {
            return qid;
        }

        public void setQid(String qid) {
            this.qid = qid;
        }

        public String getCategory() {
            return category;
        }

        public void setCategory(String category) {
            this.category = category;
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

        public int getTimeLimitSec() {
            return timeLimitSec;
        }

        public void setTimeLimitSec(int timeLimitSec) {
            this.timeLimitSec = timeLimitSec;
        }
    }

    public static class StartInterviewResponse {
        private QuestionPayload question;
        private String sessionId;
        private int questionIndex;

        public StartInterviewResponse(QuestionPayload question, String sessionId, int questionIndex) {
            this.question = question;
            this.sessionId = sessionId;
            this.questionIndex = questionIndex;
        }

        public QuestionPayload getQuestion() {
            return question;
        }

        public void setQuestion(QuestionPayload question) {
            this.question = question;
        }

        public String getSessionId() {
            return sessionId;
        }

        public void setSessionId(String sessionId) {
            this.sessionId = sessionId;
        }

        public int getQuestionIndex() {
            return questionIndex;
        }

        public void setQuestionIndex(int questionIndex) {
            this.questionIndex = questionIndex;
        }
    }
}
