package com.interviewai.controller;

import com.interviewai.dto.ResumeDtos.ResumeAnalysisResponse;
import com.interviewai.service.ResumeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/resume")
@Tag(name = "Resume", description = "Resume upload, PDF parsing and technical skills extraction")
public class ResumeController {

    private final ResumeService resumeService;

    public ResumeController(ResumeService resumeService) {
        this.resumeService = resumeService;
    }

    @PostMapping(value = "/analyze", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload and parse candidate PDF resume with Apache PDFBox")
    public ResponseEntity<ResumeAnalysisResponse> analyzeResume(@RequestParam("resume") MultipartFile file) {
        ResumeAnalysisResponse response = resumeService.analyzeResume(file);
        return ResponseEntity.ok(response);
    }
}
