package com.interviewai.dto;

import java.util.ArrayList;
import java.util.List;

public class ResumeDtos {

    public static class ResumeAnalysisResponse {
        private boolean success = true;
        private String message;
        private String textPreview;
        private List<String> skillsFound = new ArrayList<>();

        public ResumeAnalysisResponse(boolean success, String message, String textPreview, List<String> skillsFound) {
            this.success = success;
            this.message = message;
            this.textPreview = textPreview;
            this.skillsFound = skillsFound;
        }

        public boolean isSuccess() {
            return success;
        }

        public void setSuccess(boolean success) {
            this.success = success;
        }

        public String getMessage() {
            return message;
        }

        public void setMessage(String message) {
            this.message = message;
        }

        public String getTextPreview() {
            return textPreview;
        }

        public void setTextPreview(String textPreview) {
            this.textPreview = textPreview;
        }

        public List<String> getSkillsFound() {
            return skillsFound;
        }

        public void setSkillsFound(List<String> skillsFound) {
            this.skillsFound = skillsFound;
        }
    }
}
