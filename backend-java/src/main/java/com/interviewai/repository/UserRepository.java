package com.interviewai.repository;

import com.interviewai.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserRepository extends MongoRepository<User, String> {
    Optional<User> findByEmail(String email);
    Optional<User> findByGoogleId(String googleId);
    Optional<User> findByPasswordResetTokenHash(String passwordResetTokenHash);
    boolean existsByEmail(String email);
}
