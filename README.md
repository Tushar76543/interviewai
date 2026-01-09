# 🧠 Interview AI - AI-Powered Interview Coach

An intelligent interview preparation platform that helps you practice technical interviews with real-time AI feedback, voice recognition, and personalized coaching.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-404D59?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white)

## ✨ Features

### 🎯 Core Capabilities
- **AI-Powered Questions**: Generate role-specific interview questions tailored to your target position
- **Real-Time Feedback**: Get instant, detailed feedback on your answers with scoring metrics
- **Voice Recognition**: Answer questions using speech-to-text technology (Chrome supported)
- **Text-to-Speech**: Listen to questions and feedback read aloud
- **Smart Follow-ups**: Receive contextual follow-up questions based on your answers
- **Progress Tracking**: Track your interview history and performance over time

### 💼 Supported Roles
- AI Engineer
- Data Scientist
- Web Developer
- Software Engineer

### 📊 Difficulty Levels
- **Easy**: Entry-level questions for beginners
- **Medium**: Intermediate questions for experienced developers
- **FAANG**: Advanced questions for top-tier tech companies

### 🎓 Feedback Metrics
Each answer is evaluated across three dimensions:
- **Technical Accuracy** (0-10): Correctness of technical concepts
- **Clarity** (0-10): Communication and explanation quality
- **Completeness** (0-10): Depth and thoroughness of the answer

## 🏗️ Tech Stack

### Frontend
- **React 19** with TypeScript
- **Vite** for blazing-fast development
- **React Router** for navigation
- **React Speech Recognition** for voice input
- **Axios** for API communication

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **MongoDB** with Mongoose for data persistence
- **OpenAI API** (via OpenRouter) for AI-powered features
- **JWT** for secure authentication
- **bcrypt** for password hashing

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- MongoDB database (local or cloud)
- OpenRouter API key ([Get one here](https://openrouter.ai/))

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/Tushar76543/interviewai.git
cd interviewai
```

2. **Install dependencies**
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. **Configure environment variables**

Create a `.env` file in the `backend` directory:
```env
MONGO_URI=your_mongodb_connection_string
OPENROUTER_API_KEY=your_openrouter_api_key
JWT_SECRET=your_jwt_secret_key
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
PORT=5000
```

Create a `.env.local` file in the `frontend` directory:
```env
VITE_API_URL=http://localhost:5000
```

4. **Start the development servers**

```bash
# Terminal 1 - Start backend
cd backend
npm run dev

# Terminal 2 - Start frontend
cd frontend
npm run dev
```

5. **Open your browser**
Navigate to `http://localhost:5173` and start practicing!

## 📁 Project Structure

```
interviewai/
├── backend/                 # Express backend server
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── models/         # MongoDB schemas
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── middleware/     # Auth & validation
│   │   ├── lib/           # Database connection
│   │   └── app.ts         # Express app setup
│   └── package.json
│
├── frontend/               # React frontend
│   ├── src/
│   │   ├── pages/         # Route components
│   │   ├── auth/          # Authentication logic
│   │   ├── services/      # API client
│   │   └── App.tsx        # Main app component
│   └── package.json
│
└── README.md
```

## 🔐 Authentication

The app uses JWT-based authentication with the following features:
- Secure user registration and login
- Password hashing with bcrypt
- Protected routes requiring authentication
- Token-based session management

## 🌐 API Endpoints

### Authentication
- `POST /auth/signup` - Register a new user
- `POST /auth/login` - Login and receive JWT token

### Interview
- `POST /interview/start` - Generate a new interview question
- `POST /interview/feedback` - Submit answer and get feedback

## 🎤 Voice Features

The application includes advanced voice capabilities:
- **Speech-to-Text**: Convert your spoken answers to text using Web Speech API
- **Text-to-Speech**: Listen to questions and feedback read aloud
- **Browser Support**: Best experience on Chrome (required for speech recognition)

## 🚢 Deployment

### Frontend (Vercel)
1. Push your code to GitHub
2. Import project in Vercel
3. Set environment variable:
   - `VITE_API_URL`: Your backend URL

### Backend (Render)
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set environment variables:
   - `MONGO_URI`
   - `OPENROUTER_API_KEY`
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `NODE_ENV=production`
4. Deploy!

For detailed deployment instructions, see [ENV_SETUP.md](./ENV_SETUP.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- OpenAI for providing the AI capabilities
- React Speech Recognition library
- The open-source community

## 📧 Contact

Tushar - [@Tushar76543](https://github.com/Tushar76543)

Project Link: [https://github.com/Tushar76543/interviewai](https://github.com/Tushar76543/interviewai)

---

<div align="center">
  <strong>Built with ❤️ for aspiring developers</strong>
</div>
