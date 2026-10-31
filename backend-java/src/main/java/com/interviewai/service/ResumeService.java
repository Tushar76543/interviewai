package com.interviewai.service;

import com.interviewai.dto.ResumeDtos.ResumeAnalysisResponse;
import com.interviewai.exception.ApiException;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

@Service
public class ResumeService {

    private static final Logger logger = LoggerFactory.getLogger(ResumeService.class);

    private static final List<String> COMMON_SKILLS = List.of(
            "Java", "Spring Boot", "Spring Security", "Microservices", "REST API",
            "JavaScript", "TypeScript", "React", "Node.js", "Express", "Python",
            "SQL", "MongoDB", "PostgreSQL", "Docker", "Kubernetes", "AWS",
            "System Design", "Machine Learning", "Data Structures", "Algorithms", "Git"
    );

    public ResumeAnalysisResponse analyzeResume(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException("No resume uploaded", HttpStatus.BAD_REQUEST);
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase() : "";
        String contentType = file.getContentType() != null ? file.getContentType() : "";

        if (!filename.endsWith(".pdf") && !contentType.equals("application/pdf")) {
            throw new ApiException("Only PDF files are supported", HttpStatus.BAD_REQUEST);
        }

        try (PDDocument document = Loader.loadPDF(file.getBytes())) {
            PDFTextStripper stripper = new PDFTextStripper();
            String rawText = stripper.getText(document);
            String cleanText = rawText.replaceAll("\\s+", " ").trim();

            List<String> matchedSkills = extractSkills(cleanText);
            String preview = cleanText.length() > 300 ? cleanText.substring(0, 300) + "..." : cleanText;

            return new ResumeAnalysisResponse(true, "Resume processed successfully", preview, matchedSkills);
        } catch (IOException e) {
            logger.error("Failed to parse PDF resume: {}", e.getMessage());
            throw new ApiException("Failed to process resume PDF", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private List<String> extractSkills(String text) {
        String lower = text.toLowerCase();
        List<String> found = new ArrayList<>();
        for (String skill : COMMON_SKILLS) {
            if (lower.contains(skill.toLowerCase())) {
                found.add(skill);
                if (found.size() >= 12) break;
            }
        }
        return found;
    }
}
