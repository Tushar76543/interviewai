package com.interviewai.service;

import com.interviewai.exception.ApiException;
import com.interviewai.security.JwtUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

@Service
public class RecordingStorageService {

    private static final Logger logger = LoggerFactory.getLogger(RecordingStorageService.class);
    private final Path storageDirectory;
    private final JwtUtils jwtUtils;

    public RecordingStorageService(JwtUtils jwtUtils) {
        this.jwtUtils = jwtUtils;
        this.storageDirectory = Paths.get(System.getProperty("user.dir"), "uploads", "recordings");
        try {
            Files.createDirectories(storageDirectory);
        } catch (IOException e) {
            logger.error("Could not initialize recording storage directory", e);
        }
    }

    public record SavedRecording(String fileId, String mimeType, long sizeBytes) {}

    public SavedRecording saveRecording(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException("Recording file is empty", HttpStatus.BAD_REQUEST);
        }

        String fileId = UUID.randomUUID().toString();
        String originalName = file.getOriginalFilename();
        String extension = ".webm";
        if (originalName != null && originalName.contains(".")) {
            extension = originalName.substring(originalName.lastIndexOf('.'));
        }

        Path target = storageDirectory.resolve(fileId + extension);
        try {
            file.transferTo(target.toFile());
            return new SavedRecording(fileId + extension, file.getContentType() != null ? file.getContentType() : "video/webm", file.getSize());
        } catch (IOException e) {
            logger.error("Failed to save recording file: {}", e.getMessage());
            throw new ApiException("Failed to save recording", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    public String generateSignedStreamingUrl(String fileId, String userId) {
        String token = jwtUtils.generateAccessToken(userId, "recording_" + fileId);
        return "/api/interview/recording/stream/" + token + "?fileId=" + fileId;
    }

    public Resource getRecordingResource(String fileId) {
        Path filePath = storageDirectory.resolve(fileId).normalize();
        File file = filePath.toFile();
        if (!file.exists() || !file.isFile()) {
            throw new ApiException("Recording not found", HttpStatus.NOT_FOUND);
        }
        return new FileSystemResource(file);
    }
}
