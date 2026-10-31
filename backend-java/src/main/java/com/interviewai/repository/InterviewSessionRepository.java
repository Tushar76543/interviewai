package com.interviewai.repository;

import com.interviewai.model.InterviewSession;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface InterviewSessionRepository extends MongoRepository<InterviewSession, String> {
    List<InterviewSession> findByUserIdOrderByLastActivityAtDesc(String userId);
    Optional<InterviewSession> findByIdAndUserId(String id, String userId);
}
