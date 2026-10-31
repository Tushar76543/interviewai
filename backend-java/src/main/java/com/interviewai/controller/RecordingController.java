package com.interviewai.controller;

import com.interviewai.exception.ApiException;
import com.interviewai.model.InterviewSession;
import com.interviewai.repository.InterviewSessionRepository;
import com.interviewai.security.JwtUtils;
import com.interviewai.security.UserPrincipal;
import com.interviewai.service.RecordingStorageService;
import com.interviewai.service.RecordingStorageService.SavedRecording;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping("/api/interview/recording")
@Tag(name = "Recording", description = "Video and audio recording upload, signed URLs, and streaming")
public class RecordingController {

    private final RecordingStorageService recordingStorageService;
    private final InterviewSessionRepository interviewSessionRepository;
    private final JwtUtils jwtUtils;

    public RecordingController(RecordingStorageService recordingStorageService,
                               InterviewSessionRepository interviewSessionRepository,
                               JwtUtils jwtUtils) {
        this.recordingStorageService = recordingStorageService;
        this.interviewSessionRepository = interviewSessionRepository;
        this.jwtUtils = jwtUtils;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(summary = "Upload answer video recording file")
    public ResponseEntity<Map<String, Object>> uploadRecording(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestParam("recording") MultipartFile file,
            @RequestParam(value = "sessionId", required = false) String sessionId,
            @RequestParam(value = "questionIndex", required = false) Integer questionIndex
    ) {
        SavedRecording saved = recordingStorageService.saveRecording(file);

        if (sessionId != null && !sessionId.isBlank()) {
            interviewSessionRepository.findByIdAndUserId(sessionId, principal.getId()).ifPresent(session -> {
                if (questionIndex != null && questionIndex >= 0 && questionIndex < session.getQuestions().size()) {
                    InterviewSession.QAEntry entry = session.getQuestions().get(questionIndex);
                    entry.setRecordingFileId(saved.fileId());
                    entry.setRecordingMimeType(saved.mimeType());
                    entry.setRecordingSizeBytes(saved.sizeBytes());
                    interviewSessionRepository.save(session);
                }
            });
        }

        return ResponseEntity.ok(Map.of(
                "success", true,
                "fileId", saved.fileId(),
                "mimeType", saved.mimeType(),
                "sizeBytes", saved.sizeBytes()
        ));
    }

    @PostMapping("/signed-url")
    @Operation(summary = "Generate signed short-lived URL for secure video playback")
    public ResponseEntity<Map<String, Object>> getSignedUrl(
            @AuthenticationPrincipal UserPrincipal principal,
            @RequestBody Map<String, String> body
    ) {
        String fileId = body.get("fileId");
        if (fileId == null || fileId.isBlank()) {
            throw new ApiException("fileId is required", HttpStatus.BAD_REQUEST);
        }

        String signedUrl = recordingStorageService.generateSignedStreamingUrl(fileId, principal.getId());
        return ResponseEntity.ok(Map.of("success", true, "signedUrl", signedUrl));
    }

    @GetMapping("/stream/{token}")
    @Operation(summary = "Stream video media file")
    public ResponseEntity<Resource> streamRecording(
            @PathVariable String token,
            @RequestParam("fileId") String fileId
    ) {
        if (!jwtUtils.validateToken(token)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }

        Resource resource = recordingStorageService.getRecordingResource(fileId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "video/webm")
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .body(resource);
    }
}
