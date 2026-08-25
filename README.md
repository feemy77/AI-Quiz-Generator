# 🧠 AI Quiz Generator

An intelligent, automated platform designed to instantly generate quizzes and flashcards using Artificial Intelligence. Built with a robust full-stack architecture, this application serves both web and native Android environments, offering dedicated portals for students and teachers.

## 🚀 Live Demo
- **Web Application:** [Live on Vercel](https://frontend-azure-alpha-7697p12113.vercel.app)
- **Mobile Application:** Native Android APK (Built via Capacitor)
- **Backend API:** [Live on FastAPI Cloud](https://backend-e6ec5652.fastapicloud.dev)

## ✨ Key Features
- **AI-Powered Generation:** Instantly create relevant quizzes and flashcards based on input data.
- **Role-Based Dashboards:** Separate, intuitive interfaces for Students and Teachers.
- **Cross-Platform Support:** Seamlessly works on web browsers and natively on Android devices.
- **Secure Authentication:** Robust user login and registration system.

## 🛠️ Tech Stack
**Frontend:**
- Next.js (React)
- Capacitor (for Native Android APK export)
- Vercel (Deployment)

**Backend:**
- FastAPI (Python)
- Uvicorn (ASGI Server)
- FastAPI Cloud (Deployment)

## ⚙️ Local Development Setup

### 1. Clone the Repository
\`\`\`bash
git clone https://github.com/feemy77/ai-quiz-generator.git
cd ai-quiz-generator
\`\`\`

### 2. Backend Setup (FastAPI)
Navigate to the backend directory and run the server:
\`\`\`bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
\`\`\`

### 3. Frontend Setup (Next.js)
Navigate to the frontend directory and start the development server:
\`\`\`bash
cd frontend
npm install
# Ensure NEXT_PUBLIC_API_URL is set in your .env.local file
npm run dev
\`\`\`

### 4. Android Build (Capacitor)
To sync web assets and build the Android APK:
\`\`\`bash
cd frontend
npm run build
npx cap sync
\`\`\`
Open the project in Android Studio to generate the final APK.

## 👤 Author
**Faheem Mushtaq** 
- AI Engineer & Developer
- GitHub: [@feemy77](https://github.com/feemy77)
- Email: Malikfeemy@gmail.com
