package com.interviewai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@ConfigurationPropertiesScan
@EnableAsync
@EnableScheduling
public class InterviewAiApplication {

    public static void main(String[] args) {
        SpringApplication.run(InterviewAiApplication.class, args);
    }
}
