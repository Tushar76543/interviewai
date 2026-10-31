package com.interviewai.repository;

import com.interviewai.model.FeedbackJob;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface FeedbackJobRepository extends MongoRepository<FeedbackJob, String> {
    Optional<FeedbackJob> findByIdAndUserId(String id, String userId);
    List<FeedbackJob> findByStatusOrderByCreatedAtAsc(String status);
    List<FeedbackJob> findByUserIdAndStatus(String userId, String status);
}
