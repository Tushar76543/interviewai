# ☕ Interview AI - Spring Boot 3 & Java 21 Backend

A high-performance, enterprise-grade Full-Stack Java backend for the **Interview AI** technical interview preparation platform.

---

## 🚀 Key Resume Highlights & Architecture

- **Runtime & Framework**: **Java 21 (LTS)** with **Spring Boot 3.3.4**.
- **Security**: **Spring Security 6** stateless authentication with **JWT (JJWT 0.12.6)**, BCrypt password hashing, and CORS protection.
- **Data Persistence**: **Spring Data MongoDB** with indexed models (`User`, `InterviewSession`, `FeedbackJob`).
- **Asynchronous Processing**: Non-blocking AI evaluation pipeline using **Spring `@Async`** and tuned **`ThreadPoolTaskExecutor`** (decouples heavy LLM response generation from HTTP client roundtrips).
- **Generative AI Integration**: Resilient LLM orchestration with OpenRouter / OpenAI API, automatic timeout handling, and deterministic heuristic fallback grading.
- **Resume Parsing**: Automated PDF technical skill extraction using **Apache PDFBox 3.x**.
- **Interactive Documentation**: **SpringDoc OpenAPI 3 (Swagger UI)** at `/swagger-ui.html`.
- **Production Observability**: Health checks, readiness probes, and runtime metric tracking via **Spring Boot Actuator** and custom `/api/health` and `/api/ready` endpoints.

---

## 🛠️ Tech Stack

| Technology | Purpose |
| :--- | :--- |
| **Java 21 (LTS)** | Core programming language (Virtual Threads, Records, Pattern Matching) |
| **Spring Boot 3.3** | Web REST framework & DI container |
| **Spring Security 6** | Stateless authentication, authorization & filters |
| **Spring Data MongoDB** | Document mapping & Mongo repository layer |
| **Apache PDFBox 3.0** | PDF text extraction and skill keyword parsing |
| **JJWT 0.12** | Secure JSON Web Token generation & validation |
| **Swagger / OpenAPI 3** | Interactive API documentation |
| **Maven 3.9** | Build automation and dependency management |

---

## 📋 API Endpoints Overview

### 🔐 Authentication (`/api/auth`)
- `GET  /api/auth/csrf` — Generates CSRF token & sets cookie
- `POST /api/auth/signup` — Registers new candidate (hashes password with BCrypt)
- `POST /api/auth/login` — Authenticates candidate and issues JWT access token
- `POST /api/auth/google` — Authenticates candidate via Google credential
- `GET  /api/auth/me` — Fetches current authenticated session
- `POST /api/auth/logout` — Revokes authentication cookies
- `POST /api/auth/refresh` — Refreshes JWT credentials

### 🎙️ Technical Interview (`/api/interview`)
- `POST /api/interview/start` — Generates next interview question and starts/resumes session

### ⚡ Evaluation & Async Jobs (`/api/interview/feedback`)
- `POST /api/interview/feedback/jobs` — Enqueues candidate answer for background AI grading
- `GET  /api/interview/feedback/jobs/{jobId}` — Polls job status (`pending` ➔ `processing` ➔ `completed`)
- `POST /api/interview/feedback` — Synchronous answer evaluation

### 📜 Session History (`/api/history`)
- `GET  /api/history` — Lists past interview sessions
- `GET  /api/history/{id}` — Retrieves detailed session scorecard and questions

### 📄 Resume Parsing (`/api/resume`)
- `POST /api/resume/analyze` — Multipart PDF upload; extracts technical skills

### 📹 Video Recording (`/api/interview/recording`)
- `POST /api/interview/recording` — Uploads answer video file
- `POST /api/interview/recording/signed-url` — Generates signed playback URL
- `GET  /api/interview/recording/stream/{token}` — Streams media chunk

### 🩺 Health & Ops (`/api/health`, `/api/ready`, `/swagger-ui.html`)
- `GET  /api/health` — Liveness check
- `GET  /api/ready` — MongoDB readiness probe
- `GET  /swagger-ui.html` — Interactive Swagger UI testing dashboard

---

## 🏃 Running Locally

### 1. Prerequisites
- **JDK 21** (`C:\Program Files\Java\jdk-21`)
- **MongoDB** running locally or a MongoDB Atlas connection string.

### 2. Start the Backend
From the root directory:
```bash
npm run start:java
```
Or directly from `backend-java`:
```bash
.\mvnw.cmd spring-boot:run
```
Or using the built JAR:
```bash
java -jar target/interviewai-backend-1.0.0.jar
```

### 3. Start Frontend & Java Backend Together
```bash
npm run dev:java
```

The Spring Boot backend will run on `http://localhost:5000` (so the React Vite frontend proxies to it seamlessly without needing any frontend changes).
Access Swagger UI at: `http://localhost:5000/swagger-ui.html`
