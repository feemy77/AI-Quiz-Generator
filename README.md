# 🧠 AI Quiz Generator (v2.0 PRO)

An intelligent, full-stack automated assessment and learning platform powered by modern Multimodal AI. Transform any PDF (with scanned OCR), Word document, plain text notes, or YouTube video into high-impact interactive quizzes, timed exams, and spaced-repetition flashcards.

Features dedicated **Student Hub** and **Educator Pro Workspace** portals with instant 1-click **Dynamic Role Switching**, live auto-submitting countdown timers, automated AI grading with deep feedback, classroom assignment distribution, and printable official report cards.

---

## 🚀 Key Highlights & Features

- **Multimodal Source Ingestion:**
  - 📄 **PDFs with Scanned OCR:** Smart text extraction with automatic high-resolution Tesseract OCR fallback for scanned/image documents.
  - 📝 **MS Word (.docx) & Plain Text (.txt):** Instant parsing.
  - 🎥 **YouTube Video Ingestion:** Audio transcription and chunking from video lessons.
- **Dynamic Multi-Type Question Architect:**
  - Multiple Choice Questions (MCQs) with options & explanations.
  - Fill-in-the-Blank questions with fuzzy normalized matching.
  - Short Conceptual & Deep Long Essay questions with official model answers and key rubrics.
- **Live Exam Experience:**
  - Sticky live countdown timer based on exam duration with automated submission when time expires.
  - Non-blocking question inputs (students can skip and review questions freely).
  - Detailed post-submission review: Selected vs Correct answers, explanations, and AI examiner grading feedback.
  - **Printable Official Report Card 🖨️:** One-click clean print scorecard with academy branding.
- **Dynamic Role Switcher (Student ↔ Educator Mode):**
  - Seamlessly switch between Student Learning Hub and Teacher Dashboard anytime with a single click from the navigation header.
- **Classrooms & Assignments:**
  - Educators can create classes, generate 6-digit join codes, and assign quizzes with due dates.
  - Students join classrooms and take assigned quizzes directly from their dashboard.
- **Educator Question Bank / Bookmarks:**
  - Save standout questions into a searchable question bank with filter pills and one-click copy.
- **Spaced-Repetition Flashcards:**
  - Automated flashcard decks generated from quizzes with SuperMemo-style spaced repetition review.
- **Sleek Designer UI/UX:**
  - Dual-pane SaaS hero showcase with ambient glow effects.
  - Custom slim scrollbars, Next.js Geist typography, and rich floating toast notifications (`sonner`).
  - 1-Click Quick Demo Login credentials for instant testing.

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** Next.js 16 (React 19), TypeScript, Tailwind CSS, Lucide Icons, Sonner Toasts, Capacitor (Android APK).
- **Backend:** FastAPI, Python 3.10+, Uvicorn, LangChain, Pydantic v2.
- **Database:** SQLite with Write-Ahead Logging (`WAL` mode), Foreign Keys enabled, and 30s concurrency timeout.
- **AI Models:** Groq LLaMA & Google Gemini.
- **Document Processing:** `pdfplumber`, `pytesseract`, `python-docx`, `yt-dlp`.

---

## ⚡ How to Run the Project (Step-by-Step)

### Prerequisites
- **Python 3.10+** installed ([python.org](https://www.python.org/downloads/))
- **Node.js 18+** installed ([nodejs.org](https://nodejs.org/))
- (Optional) **Tesseract-OCR** for Windows if you wish to extract scanned image PDFs.

---

### Step 1: Clone or Open the Workspace

Open your terminal or PowerShell in the root directory:
```bash
cd "d:\All AI,ML Projects\AI-Quiz-Generator"
```

---

### Step 2: Set Up Backend Environment Variables

1. Go to the `backend/` directory:
   ```bash
   cd backend
   ```
2. Create a `.env` file (you can copy `.env.example`):
   ```bash
   cp .env.example .env
   ```
3. Open `backend/.env` in your editor and add your API keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

---

### Step 3: Run the FastAPI Backend Server

In your first terminal:
```powershell
cd "d:\All AI,ML Projects\AI-Quiz-Generator\backend"

# (Optional: If using a virtual environment)
# python -m venv venv
# .\venv\Scripts\activate

# Install requirements (first time only)
pip install -r requirements.txt

# Start the FastAPI server (works on all Windows/Mac/Linux systems)
python -m uvicorn main:app --reload --port 8000
```

> **Verification:** Open [http://localhost:8000/docs](http://localhost:8000/docs) in your browser. You should see the interactive Swagger API documentation.

---

### Step 4: Run the Next.js Frontend

Open a **second terminal window**:
```powershell
cd "d:\All AI,ML Projects\AI-Quiz-Generator\frontend"

# Install dependencies (first time only)
npm install

# Start the development server
npm run dev
```

> **Access Application:** Open [http://localhost:3000](http://localhost:3000) in your web browser!

---

## 🎮 Quick Demo Testing

On the landing page (`http://localhost:3000`), you can use the **⚡ Quick Demo One-Click Fill** buttons:
- **Educator Demo:** Pre-fills `teacher@demo.com` / `teacher123`
- **Student Demo:** Pre-fills `student@demo.com` / `student123`

Or click **Create Account** to register a new account with your own email and name.

---

## 📱 Mobile App Build (Capacitor Android APK)

To sync web assets and build the native Android APK:
```powershell
cd frontend
npm run build
npx cap sync
npx cap open android
```
This opens the project in Android Studio where you can click **Build > Build APK**.

---

## 📁 Project Directory Structure

```
AI-Quiz-Generator/
├── backend/
│   ├── main.py                 # FastAPI endpoints & async routers
│   ├── database.py             # SQLite DB queries, WAL mode & migrations
│   ├── quiz_generator.py       # LangChain Groq/Gemini AI pipelines
│   ├── document_extractor.py   # PDF, DOCX, TXT & Tesseract OCR engine
│   ├── grading_engine.py       # Smart AI & normalized grading algorithms
│   ├── cache_manager.py        # Hash-keyed quiz response caching
│   ├── youtube_extractor.py    # YouTube audio transcription
│   ├── requirements.txt        # Python backend dependencies
│   └── Dockerfile              # Production container recipe with ffmpeg
├── frontend/
│   ├── app/
│   │   ├── page.tsx            # SaaS Dual-Pane Landing & Auth Page
│   │   ├── student-dashboard/  # Student Learning Hub (History, Classrooms, Generator)
│   │   ├── teacher-dashboard/  # Teacher Pro Workspace (Editor, Question Bank, Assign)
│   │   ├── quiz/[quiz_id]/     # Exam Client with Countdown Timer & Printable Review
│   │   ├── flashcards/         # Spaced-repetition memory review
│   │   └── setup/              # Workspace onboarding
│   ├── lib/
│   │   └── api.ts              # Centralized API client & Role Switcher utility
│   ├── package.json            # Node.js dependencies
│   └── capacitor.config.ts     # Mobile packaging configuration
└── legacy_streamlit/           # Archived legacy Streamlit prototypes
```

---

## 👤 Author
**Faheem Mushtaq**  
AI Engineer & Full-Stack Developer  
- GitHub: [@feemy77](https://github.com/feemy77)  
- Email: Malikfeemy@gmail.com
