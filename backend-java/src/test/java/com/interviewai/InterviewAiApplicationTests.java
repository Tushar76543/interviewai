package com.interviewai;

import com.interviewai.dto.InterviewDtos.QuestionPayload;
import com.interviewai.service.FeedbackService;
import com.interviewai.service.OpenAiService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@TestPropertySource(properties = {
    "spring.data.mongodb.uri=mongodb://localhost:27017/test_interviewai"
})
class InterviewAiApplicationTests {

    @Autowired
    private OpenAiService openAiService;

    @Autowired
    private FeedbackService feedbackService;

    @Test
    void testQuestionGenerationFallback() {
        QuestionPayload question = openAiService.generateCuratedQuestion("Software Engineer", "Medium", "System Design", List.of());
        assertNotNull(question);
        assertNotNull(question.getPrompt());
        assertFalse(question.getPrompt().isBlank());
        assertFalse(question.getExpectedPoints().isEmpty());
    }

    @Test
    void testHeuristicFeedbackEvaluation() {
        var eval = feedbackService.evaluateHeuristically(
                "Software Engineer",
                "Explain how HashMap works internally in Java.",
                "HashMap uses an array of buckets and hashes the key. When collisions occur, it chains using linked lists and converts to red-black trees if threshold reaches 8.",
                List.of("Array of buckets", "Collision chaining", "Red-black tree threshold")
        );

        assertNotNull(eval);
        assertNotNull(eval.metrics());
        assertTrue(eval.metrics().getTechnical() >= 5.0);
        assertTrue(eval.metrics().getOverall() >= 5.0);
        assertNotNull(eval.followUp());
    }
}
