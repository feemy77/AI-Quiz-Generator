"""
FastAPI backend for the AI Quiz Generator.
"""
import time
import uuid
import logging
import hashlib
import io
import random
import string
import json
import base64
import os
import re
import tempfile
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Header, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, List, Any
from concurrent.futures import ThreadPoolExecutor

# Image & OCR Libraries
import copy
from PIL import Image
import pytesseract

# Word Document Export Library
from docx import Document
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

# NEW: PDF Export Libraries
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image as RLImage, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Register TrueType fonts for Unicode & Urdu support safely
for font_cand in [('Arial', 'C:/Windows/Fonts/arial.ttf'), ('Tahoma', 'C:/Windows/Fonts/tahoma.ttf')]:
    try:
        if os.path.exists(font_cand[1]):
            pdfmetrics.registerFont(TTFont(font_cand[0], font_cand[1]))
    except Exception:
        pass

def format_urdu_pdf_text(text: str) -> str:
    """Reshapes Arabic/Urdu characters and handles BiDi directional rendering for PDF."""
    if not text:
        return ""
    try:
        import arabic_reshaper
        from bidi.algorithm import get_display
        return get_display(arabic_reshaper.reshape(str(text)))
    except Exception:
        return str(text)

# NOTE FOR WINDOWS: Point pytesseract to the installed executable
#pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Existing modules (UNTOUCHED)
import database
import auth
from document_extractor import get_document_page_count, extract_text_from_document
from youtube_extractor import get_youtube_transcript
import quiz_generator
from quiz_generator import generate_quiz_from_large_text, determine_long_question_marks
from grading_engine import check_mcq, check_fill_blank, grade_long_answer
from cache_manager import generate_hash, get_cached_quiz, save_quiz_to_cache

# ==========================================
# 📋 SYSTEM LOGGING SETUP
# ==========================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("app_system.log"), 
        logging.StreamHandler()                
    ]
)
logger = logging.getLogger(__name__)

app = FastAPI(title="AI Quiz Generator API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Yeh har jagah se aane wali request ko allow karega
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

database.init_db()

# 🪄 Create Bookmarks table dynamically if it doesn't exist (Zero manual DB changes needed)
conn = database.get_db_connection()
conn.execute('''CREATE TABLE IF NOT EXISTS bookmarked_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    quiz_id INTEGER,
    question_type TEXT,
    question_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)''')
conn.commit()
conn.close()

# ==========================================
# 🛡️ MIDDLEWARE: Request Tracking ID
# ==========================================
@app.middleware("http")
async def log_requests(request: Request, call_next):
    req_id = str(uuid.uuid4())[:8]
    request.state.req_id = req_id 
    logger.info(f"[ReqID: {req_id}] STARTED: {request.method} {request.url.path}")
    start_time = time.time()
    try:
        response = await call_next(request)
        process_time = time.time() - start_time
        logger.info(f"[ReqID: {req_id}] COMPLETED: Status {response.status_code} in {process_time:.2f}s")
        response.headers["X-Request-ID"] = req_id
        return response
    except Exception as e:
        logger.error(f"[ReqID: {req_id}] CRASHED: {str(e)}")
        raise e

# --- SCHEMAS ---
class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateProfileRequest(BaseModel):
    role: str
    institution_name: str

class SwitchRoleRequest(BaseModel):
    new_role: str

class SubmitAttemptRequest(BaseModel):
    student_name: str
    answers: Dict[str, str] 
    challenge_code: Optional[str] = None
    assignment_id: Optional[int] = None

class ChallengeCreateRequest(BaseModel):
    quiz_id: int

class FlashcardReviewRequest(BaseModel):
    flashcard_id: int
    quality: int

class ExportQuizRequest(BaseModel):
    include_answer_key: bool = False
    institution_name: Optional[str] = ""
    department_name: Optional[str] = ""
    exam_title: Optional[str] = ""
    exam_category: Optional[str] = "THEORY"  # "THEORY", "PRACTICAL", "MID-TERM", "FINAL-TERM"
    course_code: Optional[str] = ""
    subject: Optional[str] = ""
    class_name: Optional[str] = ""
    teacher_name: Optional[str] = ""
    duration_minutes: Optional[int] = None
    total_marks: Optional[int] = None
    exam_set: str = "Standard" # "Standard", "Set A", "Set B"
    include_instructions: bool = True
    include_clo: bool = True
    academic_tier: Optional[str] = None
    paper_type: Optional[str] = None
    quiz_number: Optional[str] = None

class CreateClassroomRequest(BaseModel):
    name: str

class JoinClassroomRequest(BaseModel):
    join_code: str

class AssignQuizRequest(BaseModel):
    quiz_id: int
    due_date: Optional[str] = ""

class ExplainQuestionRequest(BaseModel):
    question: str
    question_type: str
    student_answer: Optional[str] = ""
    correct_answer: Optional[str] = ""
    explanation: Optional[str] = ""

class BrandingRequest(BaseModel):
    academy_name: str
    logo_path: str = ""

# 🪄 PHASE 1 NEW SCHEMAS (For Editing & Smart Questions)
class UpdateQuizRequest(BaseModel):
    quiz_data: Dict[str, Any]
    exam_metadata: Dict[str, Any]

class RegenerateQuestionRequest(BaseModel):
    question_type: str # 'mcq', 'fill_blank', 'short_answer', 'long_answer'
    difficulty: str
    question_style: str = "Auto"

class SwapQuestionRequest(BaseModel):
    section: str # 'mcq', 'blank', 'short', 'long'
    index: int
    action: str = "select_alternative" # 'select_alternative' or 'generate_new'
    alternative_index: Optional[int] = None
    target_style: Optional[str] = "conceptual" # 'conceptual', 'coding', 'scenario', 'difference', 'definition'
    difficulty: Optional[str] = "Medium"

class BookmarkRequest(BaseModel):
    quiz_id: int
    question_type: str
    question_data: Dict[str, Any]

# --- AUTH DEPENDENCIES ---
def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.removeprefix("Bearer ").strip()
    user_id = database.get_user_id_for_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired session token.")
    user = database.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user

def get_optional_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    user_id = database.get_user_id_for_token(token)
    if user_id:
        return database.get_user_by_id(user_id)
    return None

def require_teacher(user=Depends(get_current_user)):
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(status_code=403, detail="Only teachers/admins can perform this action.")
    return user

# --- MODULAR ROUTERS ---
from routers.auth import router as auth_router
from routers.classrooms import router as classrooms_router
from routers.gamification import router as gamification_router

app.include_router(auth_router)
app.include_router(classrooms_router)
app.include_router(gamification_router)

@app.post("/quiz/analyze-document")
async def analyze_document(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        total_pages = get_document_page_count(file_bytes, file.filename)
        return {"total_pages": total_pages}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def _has_programming_content(text: str) -> bool:
    """
    Checks whether text contains programming syntax, code keywords, or algorithmic concepts.
    """
    code_indicators = [
        r"\b(def|class|function|var|let|const|import|include|return|public|private|void|int|float|string|boolean|cout|cin|printf|scanf|malloc|nullptr|lambda)\b",
        r"[{}();=<>\[\]]{3,}",
        r"\b(python|javascript|typescript|java|c\+\+|c#|html|css|sql|react|node|algorithm|recursion|pointer|array|linked list|binary tree|stack|queue|loop|if-else)\b",
        r"```",
        r"\b(oop|polymorphism|inheritance|encapsulation|database|query|api|backend|frontend|compiler|interpreter)\b",
    ]
    text_lower = text.lower()
    matches = 0
    for pattern in code_indicators:
        if re.search(pattern, text_lower):
            matches += 1
    return matches >= 2

# ==========================================
# 📸 MULTI-SOURCE QUIZ INTEGRATED ENDPOINT (UPDATED)
# ==========================================
@app.post("/quiz/generate")
async def generate_quiz(
    request: Request,
    file: Optional[UploadFile] = File(None), 
    files: Optional[List[UploadFile]] = File(None), 
    file_ranges: Optional[str] = Form(None), 
    youtube_url: str = Form(""),
    yt_start_min: int = Form(0),    
    yt_end_min: int = Form(0),      
    num_mcq: int = Form(0),
    num_fill_blank: int = Form(0),
    num_short: int = Form(0),
    num_long: int = Form(0),
    difficulty: str = Form("Medium"),
    question_style: str = Form("Auto"),  # 🧠 Smart Question Style parameter
    academic_tier: str = Form("University"),  # 🎓 Academic Tier: University, College, School
    exam_track: str = Form("Theory"),        # 📝 Exam Track: Theory, Practical, Standard, Comprehension
    include_comprehension: bool = Form(False), # 📖 College comprehension passage toggle
    start_page: int = Form(1),      
    end_page: int = Form(1000),     
    institution_name: str = Form(""),
    department: str = Form(""),
    subject: str = Form(""),
    class_name: str = Form(""),
    teacher_name: str = Form(""),
    exam_title: str = Form(""),
    course_code: str = Form(""),
    paper_type: str = Form("exam"),
    quiz_number: str = Form(""),
    language: str = Form("English"),
    user=Depends(get_current_user), 
):
    req_id = getattr(request.state, "req_id", "Unknown")
    
    if num_mcq + num_fill_blank + num_short + num_long <= 0:
        raise HTTPException(status_code=400, detail="Request at least 1 question.")

    raw_text = ""
    source_identifiers = []

    all_uploaded_files = []
    if file:
        all_uploaded_files.append(file)
    if files:
        all_uploaded_files.extend(files)

    parsed_ranges = {}
    if file_ranges:
        try:
            ranges_list = json.loads(file_ranges)
            for r in ranges_list:
                parsed_ranges[r.get("filename", "")] = r
        except Exception as e:
            logger.error(f"Failed to parse file_ranges JSON: {e}")

    if youtube_url.strip():
        source_identifiers.append(f"{youtube_url.strip()}_{yt_start_min}_{yt_end_min}")
        raw_text = get_youtube_transcript(youtube_url.strip(), start_min=yt_start_min, end_min=yt_end_min)
        
    elif all_uploaded_files:
        for f in all_uploaded_files:
            if not f.filename: continue
            
            f_bytes = await f.read()
            f_start = parsed_ranges.get(f.filename, {}).get("start", start_page)
            f_end = parsed_ranges.get(f.filename, {}).get("end", end_page)

            if f.content_type.startswith('image/'):
                try:
                    image = Image.open(io.BytesIO(f_bytes))
                    if image.mode != 'RGB': image = image.convert('RGB')
                    extracted = pytesseract.image_to_string(image)
                    if len(extracted.strip()) < 50:
                        raise HTTPException(status_code=422, detail=f"Text unreadable in image: {f.filename}")
                    raw_text += extracted + "\n\n"
                    source_identifiers.append(hashlib.md5(f_bytes).hexdigest())
                except Exception as e:
                    raise HTTPException(status_code=422, detail=f"Image processing failed for {f.filename}")
            else:
                try:
                    extracted = extract_text_from_document(f_bytes, f.filename, start_page=f_start, end_page=f_end)
                    if extracted.startswith("Error"):
                        raise HTTPException(status_code=422, detail=extracted)
                    raw_text += extracted + "\n\n"
                    source_identifiers.append(hashlib.md5(f_bytes).hexdigest())
                except Exception as e:
                    raise HTTPException(status_code=422, detail=f"Failed to process {f.filename}")
    else:
        raise HTTPException(status_code=400, detail="Provide either Document(s), Image(s), or a YouTube URL.")

    if not raw_text.strip() or raw_text.startswith("Error"):
        raise HTTPException(status_code=422, detail="Combined text extraction failed. Content might be too short.")

    # 🎓 Intelligent Academic Tier and Exam Track Resolution
    effective_style = question_style
    tier_lower = academic_tier.lower().strip()
    track_lower = exam_track.lower().strip()

    if question_style.lower() in ("auto", "exam"):
        if tier_lower == "university":
            if track_lower in ("practical", "lab"):
                effective_style = "university_practical"
            else:
                effective_style = "university_theory"
        elif tier_lower in ("college", "intermediate", "board"):
            effective_style = "college_board"
        elif tier_lower in ("school", "secondary"):
            effective_style = "school_standard"
    elif question_style.lower() in ("practical", "lab_exam"):
        effective_style = "university_practical"

    # 🧠 Early validation: Prevent generating coding questions on non-programming documents
    if effective_style.lower() in ("programming", "coding", "university_practical") and not _has_programming_content(raw_text):
        if effective_style.lower() == "university_practical":
            # For practical exams on non-code documents, fall back to high-rigor scenario/theory
            effective_style = "university_theory"
        else:
            raise HTTPException(
                status_code=400,
                detail="The uploaded material does not appear to contain programming code or technical algorithms. Please choose 'Conceptual', 'Comprehension', or 'Auto', or upload material containing code."
            )

    question_counts = {
        "mcq": num_mcq, "fill_blank": num_fill_blank, "short_answer": num_short, "long_answer": num_long
    }

    combined_identifier = "_".join(source_identifiers)
    req_hash = generate_hash(
        source_identifier=combined_identifier, mcq=num_mcq, fill_blank=num_fill_blank,
        short_ans=num_short, long_ans=num_long, difficulty=difficulty, question_style=f"{effective_style}_{include_comprehension}_{language}"
    )

    quiz_data = get_cached_quiz(req_hash)
    if not quiz_data:
        # 🧠 Pass effective_style and language down to the generator, running in threadpool to prevent blocking the event loop
        quiz_data = await run_in_threadpool(
            generate_quiz_from_large_text,
            raw_text, question_counts, difficulty, question_style=effective_style, include_comprehension=include_comprehension, language=language
        )
        save_quiz_to_cache(req_hash, quiz_data)

    # Calculate accurate total marks strictly based on question contents:
    # MCQs: 1 mark, Blanks: 1 mark, Shorts: 2 marks, Longs: 10 marks (if graph/diagram/tree/DSA/visual) else 6 marks
    calculated_marks = 0
    for q in quiz_data.get("mcq_questions", []):
        calculated_marks += q.get("marks", 1)
    for q in quiz_data.get("fill_blank_questions", []):
        calculated_marks += q.get("marks", 1)
    for q in quiz_data.get("short_questions", []):
        calculated_marks += q.get("marks", 2)
    for q in quiz_data.get("long_questions", []):
        calculated_marks += q.get("marks") if q.get("marks") else determine_long_question_marks(q)
    if calculated_marks <= 0:
        calculated_marks = (num_mcq * 1) + (num_fill_blank * 1) + (num_short * 2) + (num_long * 6)

    calculated_duration = (num_mcq * 1) + (num_fill_blank * 1) + (num_short * 3) + (num_long * 8)
    if calculated_duration < 15: calculated_duration = 15

    # Auto-resolve teacher branding if institution name is empty or default
    teacher_branding = database.get_teacher_branding(user["id"])
    if teacher_branding and teacher_branding.get("academy_name") and (not institution_name.strip() or institution_name.strip() == "Academic Examination Department"):
        institution_name = teacher_branding["academy_name"]

    is_university = tier_lower == "university"
    final_course_code = course_code.strip() if is_university else ""

    # Clean and resolve exam title to eliminate repetition and handle Quiz vs Term Exam
    clean_title = exam_title.strip()
    is_quiz = (paper_type.lower().strip() == "quiz") or ("quiz" in clean_title.lower())
    q_num = ""
    if is_quiz:
        q_num = quiz_number.strip()
        if not q_num:
            match = re.search(r"quiz\s*(?:no\.?|#)?\s*(\d+)", clean_title, re.IGNORECASE)
            q_num = match.group(1).zfill(2) if match else "01"
        else:
            q_num = str(q_num).zfill(2)
        clean_title = f"Quiz No. {q_num}"
    else:
        if re.search(r"mid\s*term.*mid\s*term", clean_title, re.IGNORECASE) or re.search(r"midterm.*midterm", clean_title, re.IGNORECASE) or (clean_title.lower() in ("midterm", "mid term", "mid-term")):
            clean_title = "Mid Term Examination (Fall-2026)"
        elif re.search(r"final\s*term.*final\s*term", clean_title, re.IGNORECASE) or re.search(r"final.*final", clean_title, re.IGNORECASE) or (clean_title.lower() in ("final", "final term", "finalterm", "final-term")):
            clean_title = "Final Term Examination (Fall-2026)"
        elif not clean_title or clean_title.lower() == "assessment examination":
            clean_title = "Mid Term Examination (Fall-2026)"

    is_practical_exam = (track_lower in ("practical", "lab") or "practical" in effective_style.lower())
    is_self_study = (user.get("role") == "student")

    exam_metadata = {
        "institution_name": institution_name.strip() or "Academic Examination Department",
        "department": department.strip() or "Examination Branch", 
        "subject": subject.strip() or "General Course", 
        "class_name": class_name.strip(),
        "teacher_name": teacher_name.strip() or user["name"], 
        "exam_title": clean_title,
        "course_code": final_course_code,
        "paper_type": "quiz" if is_quiz else "exam",
        "quiz_number": q_num if is_quiz else "",
        "duration_minutes": calculated_duration, 
        "total_marks": calculated_marks,
        "academic_tier": academic_tier,
        "exam_track": exam_track,
        "exam_category": "PRACTICAL" if is_practical_exam else "THEORY",
        "question_style": effective_style,
        "include_comprehension": include_comprehension,
        "is_self_study": is_self_study,
        "language": "Urdu" if str(language).lower() in ("urdu", "اردو") else "English",
        "source_text_context": raw_text[:25000] # 🧠 Save context for Phase 1 Regeneration & Alternative Generation securely
    }

    quiz_id = database.create_quiz(user["id"], exam_metadata, quiz_data)
    return {"quiz_id": quiz_id, "exam_metadata": exam_metadata, "quiz_data": quiz_data}


# ==========================================
# 🪄 PHASE 1 NEW APIS: EDITOR & REGENERATION
# ==========================================
@app.get("/teacher/quiz/{quiz_id}")
def get_quiz_for_teacher_api(quiz_id: int, user=Depends(require_teacher)):
    """Returns complete quiz data with correct answers, model answers, and explanations for teacher editing."""
    quiz = database.get_quiz_for_teacher(quiz_id, user["id"])
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found or unauthorized.")
    return quiz

@app.put("/quiz/{quiz_id}")
def update_quiz_data(quiz_id: int, req: UpdateQuizRequest, user=Depends(get_current_user)):
    """Updates edited quiz data manually (Reorder, Edit, Add, Delete) directly in DB."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    # Check ownership
    cursor.execute("SELECT id FROM quizzes WHERE id = ? AND teacher_id = ?", (quiz_id, user["id"]))
    if not cursor.fetchone(): 
        conn.close()
        raise HTTPException(status_code=403, detail="Unauthorized or Quiz not found.")
    
    cursor.execute("UPDATE quizzes SET quiz_data = ?, exam_metadata = ? WHERE id = ?", 
                  (json.dumps(req.quiz_data), json.dumps(req.exam_metadata), quiz_id))
    conn.commit()
    conn.close()
    return {"message": "Quiz updated successfully."}

@app.post("/quiz/{quiz_id}/regenerate-question")
async def regenerate_single_question(quiz_id: int, req: RegenerateQuestionRequest, user=Depends(get_current_user)):
    """Re-uses existing AI pipeline to fetch exactly ONE new question of requested type without blocking event loop."""
    quiz = database.get_quiz(quiz_id)
    if not quiz or quiz["teacher_id"] != user["id"]: 
        raise HTTPException(status_code=403, detail="Unauthorized.")
    
    context = quiz["exam_metadata"].get("source_text_context", "")
    if not context: 
        raise HTTPException(status_code=400, detail="Original context not found. Cannot regenerate.")

    q_counts = {"mcq": 0, "fill_blank": 0, "short_answer": 0, "long_answer": 0}
    if req.question_type in q_counts:
        q_counts[req.question_type] = 1
    
    # Run in threadpool so single-threaded event loop is never frozen
    new_data = await run_in_threadpool(
        generate_quiz_from_large_text,
        context, q_counts, req.difficulty, question_style=req.question_style
    )
    
    key_map = {"mcq": "mcq_questions", "fill_blank": "fill_blank_questions", "short_answer": "short_questions", "long_answer": "long_questions"}
    target_key = key_map.get(req.question_type)
    
    if new_data and target_key and new_data.get(target_key) and len(new_data[target_key]) > 0:
        return {"new_question": new_data[target_key][0]}
    else:
        raise HTTPException(status_code=500, detail="AI Engine failed to regenerate question.")

@app.post("/quiz/{quiz_id}/swap-question")
async def swap_question_endpoint(quiz_id: int, req: SwapQuestionRequest, user=Depends(get_current_user)):
    """
    Allows instructors and self-study students to either:
    1. 'select_alternative': Swap an active question with one of its pre-generated alternatives.
    2. 'generate_new': Dynamically generate a fresh alternative question with a specific requested style
       (e.g., conceptual, coding, scenario, difference, definition).
    The previous active question is preserved in the alternatives list so no work is ever lost.
    """
    quiz = database.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")

    is_owner = (quiz["teacher_id"] == user["id"])
    is_student = (user.get("role") == "student")
    is_self_study = quiz.get("exam_metadata", {}).get("is_self_study", False)
    if not is_owner and not (is_student and is_self_study):
        raise HTTPException(status_code=403, detail="Unauthorized to modify questions for this quiz.")

    sec_map = {
        "mcq": "mcq_questions",
        "mcq_questions": "mcq_questions",
        "blank": "fill_blank_questions",
        "fill_blank": "fill_blank_questions",
        "fill_blank_questions": "fill_blank_questions",
        "short": "short_questions",
        "short_answer": "short_questions",
        "short_questions": "short_questions",
        "long": "long_questions",
        "long_answer": "long_questions",
        "long_questions": "long_questions"
    }
    arr_key = sec_map.get(req.section.lower().strip())
    if not arr_key or arr_key not in quiz["quiz_data"]:
        raise HTTPException(status_code=400, detail=f"Invalid question section: {req.section}")

    questions_list = quiz["quiz_data"][arr_key]
    if req.index < 0 or req.index >= len(questions_list):
        raise HTTPException(status_code=400, detail="Question index out of bounds.")

    current_q = questions_list[req.index]
    if not isinstance(current_q, dict):
        raise HTTPException(status_code=400, detail="Invalid question format.")

    if "alternatives" not in current_q or not isinstance(current_q.get("alternatives"), list):
        current_q["alternatives"] = []

    if req.action == "select_alternative":
        if req.alternative_index is None or req.alternative_index < 0 or req.alternative_index >= len(current_q["alternatives"]):
            raise HTTPException(status_code=400, detail="Invalid alternative index.")

        # Extract selected alternative
        chosen = current_q["alternatives"].pop(req.alternative_index)

        # Move previous active question to alternatives list
        old_active = {k: v for k, v in current_q.items() if k != "alternatives"}
        chosen_alts = current_q["alternatives"]
        chosen_alts.append(old_active)
        chosen["alternatives"] = chosen_alts

        # Preserve clo and marks if missing
        if "clo" in current_q and "clo" not in chosen:
            chosen["clo"] = current_q["clo"]
        if "marks" in current_q and "marks" not in chosen:
            chosen["marks"] = current_q["marks"]

        questions_list[req.index] = chosen

    elif req.action == "generate_new":
        context = quiz["exam_metadata"].get("source_text_context", "")
        if not context:
            raise HTTPException(status_code=400, detail="Original document context is missing. Cannot generate new alternative.")

        target_style = req.target_style or "conceptual"
        difficulty = req.difficulty or "Medium"

        new_q = await run_in_threadpool(
            quiz_generator.generate_alternative_question,
            context,
            req.section,
            target_style,
            difficulty
        )

        if not new_q or not new_q.get("question_text"):
            raise HTTPException(status_code=500, detail="AI generation failed to produce an alternative question.")

        # Preserve clo and marks
        if "clo" in current_q and "clo" not in new_q:
            new_q["clo"] = current_q["clo"]
        if "marks" in current_q and "marks" not in new_q:
            new_q["marks"] = current_q["marks"]

        # Move current active question into alternatives
        old_active = {k: v for k, v in current_q.items() if k != "alternatives"}
        existing_alts = current_q.get("alternatives", [])
        new_q["alternatives"] = existing_alts + [old_active]
        questions_list[req.index] = new_q
    else:
        raise HTTPException(status_code=400, detail=f"Unknown action: {req.action}")

    # Persist updated quiz_data to database
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE quizzes SET quiz_data = ? WHERE id = ?",
                   (json.dumps(quiz["quiz_data"]), quiz_id))
    conn.commit()
    conn.close()

    return {
        "success": True,
        "active_question": questions_list[req.index],
        "quiz_data": quiz["quiz_data"],
        "message": "Question swapped successfully!"
    }

@app.post("/bookmarks")
def save_bookmark(req: BookmarkRequest, user=Depends(get_current_user)):
    """Saves a specific question to the user's bookmarks."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO bookmarked_questions (user_id, quiz_id, question_type, question_data) VALUES (?, ?, ?, ?)",
                   (user["id"], req.quiz_id, req.question_type, json.dumps(req.question_data)))
    conn.commit()
    conn.close()
    return {"message": "Question bookmarked successfully!"}

@app.get("/bookmarks")
def get_bookmarks(user=Depends(get_current_user)):
    """Fetches all saved questions."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM bookmarked_questions WHERE user_id = ? ORDER BY created_at DESC", (user["id"],))
    bookmarks = []
    for row in cursor.fetchall():
        bookmarks.append({
            "id": row["id"], "quiz_id": row["quiz_id"], 
            "question_type": row["question_type"], "question_data": json.loads(row["question_data"]),
            "date": row["created_at"]
        })
    conn.close()
    return {"bookmarks": bookmarks}

@app.delete("/bookmarks/{bookmark_id}")
def delete_bookmark_api(bookmark_id: int, user=Depends(get_current_user)):
    """Deletes a saved question from the user's bookmarks."""
    deleted = database.delete_bookmark(bookmark_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Bookmark not found.")
    return {"message": "Bookmark removed successfully."}


# ==========================================
# 🖨️ TEACHER EXPORT ENGINE (DOCX & PDF VIP LAYOUT)
# ==========================================
def process_base64_logo_safe(branding):
    """Safely converts Base64 logo to a temporary physical file for bulletproof PDF/Word embedding."""
    if not branding or not branding.get("logo_path") or not branding["logo_path"].startswith("data:image"):
        return None
    try:
        b64_data = branding["logo_path"].split(",")[1]
        img_data = base64.b64decode(b64_data)
        pil_img = Image.open(io.BytesIO(img_data))
        
        if pil_img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", pil_img.size, (255, 255, 255))
            if 'A' in pil_img.getbands():
                background.paste(pil_img, mask=pil_img.split()[-1])
            else:
                background.paste(pil_img)
            pil_img = background
        elif pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
            
        fd, path = tempfile.mkstemp(suffix=".jpg")
        with os.fdopen(fd, 'wb') as f:
            pil_img.save(f, format="JPEG", quality=95)
        return path
    except Exception as e:
        logger.error(f"Logo processing error: {e}")
        return None

def set_docx_cell_shading(cell, color_hex="F8FAFC"):
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shd)

def prepare_exam_data(quiz_data: dict, exam_set: str = "Standard") -> dict:
    """Prepares exam data, deterministically shuffling questions and options for Set B while preserving answer keys."""
    if exam_set != "Set B":
        return quiz_data

    rng = random.Random(42)
    set_b = copy.deepcopy(quiz_data)

    if set_b.get("mcq_questions"):
        mcqs = set_b["mcq_questions"][::-1]
        for q in mcqs:
            opts = list(q.get("options", []))
            rng.shuffle(opts)
            q["options"] = opts
        set_b["mcq_questions"] = mcqs

    if set_b.get("fill_blank_questions"):
        set_b["fill_blank_questions"] = set_b["fill_blank_questions"][::-1]

    if set_b.get("short_questions"):
        set_b["short_questions"] = set_b["short_questions"][::-1]

    if set_b.get("long_questions"):
        set_b["long_questions"] = set_b["long_questions"][::-1]

    return set_b

@app.post("/quiz/{quiz_id}/export/docx")
def export_quiz_docx(quiz_id: int, req: ExportQuizRequest, user=Depends(get_current_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")

    # If the user is a student and this quiz is an assigned classroom examination, deny confidential answer key
    if user.get("role") != "teacher":
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT a.id FROM assignments a
            JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
            WHERE a.quiz_id = ? AND cs.student_id = ?
        ''', (quiz_id, user["id"]))
        if cursor.fetchone():
            req.include_answer_key = False
        conn.close()

    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.5)
        section.bottom_margin = Inches(0.5)
        section.left_margin = Inches(0.6)
        section.right_margin = Inches(0.6)

    # Set Times New Roman as document font
    style_normal = doc.styles['Normal']
    font = style_normal.font
    font.name = 'Times New Roman'
    font.size = Pt(10)
    font.color.rgb = RGBColor(0, 0, 0)

    meta = quiz["exam_metadata"]
    raw_quiz_data = quiz["quiz_data"]
    quiz_data = prepare_exam_data(raw_quiz_data, req.exam_set)

    branding = database.get_teacher_branding(quiz.get("teacher_id") or user["id"])
    inst_name = req.institution_name.strip()
    if not inst_name or inst_name == "Academic Examination Department":
        if branding and branding.get("academy_name"):
            inst_name = branding["academy_name"]
        else:
            inst_name = meta.get("institution_name", "Academic Examination Department")
    dept_name = req.department_name.strip() or meta.get("department_name") or meta.get("department", "Examination Branch")

    academic_tier = (req.academic_tier or meta.get("academic_tier", "University")).strip()
    is_university = academic_tier.lower() == "university"

    raw_exam_title = req.exam_title.strip() or meta.get("exam_title", "")
    paper_type = (req.paper_type or meta.get("paper_type", "")).strip().lower()
    quiz_num = (req.quiz_number or meta.get("quiz_number", "")).strip()

    is_quiz = (paper_type == "quiz") or ("quiz" in raw_exam_title.lower())
    if is_quiz:
        if not quiz_num:
            match = re.search(r"quiz\s*(?:no\.?|#)?\s*(\d+)", raw_exam_title, re.IGNORECASE)
            quiz_num = match.group(1).zfill(2) if match else "01"
        else:
            quiz_num = str(quiz_num).zfill(2)
        exam_title = f"Quiz No. {quiz_num}"
    else:
        exam_title = raw_exam_title
        if re.search(r"mid\s*term.*mid\s*term", exam_title, re.IGNORECASE) or re.search(r"midterm.*midterm", exam_title, re.IGNORECASE) or (exam_title.lower() in ("midterm", "mid term", "mid-term")):
            exam_title = "Mid Term Examination (Fall-2026)"
        elif re.search(r"final\s*term.*final\s*term", exam_title, re.IGNORECASE) or re.search(r"final.*final", exam_title, re.IGNORECASE) or (exam_title.lower() in ("final", "final term", "finalterm", "final-term")):
            exam_title = "Final Term Examination (Fall-2026)"
        elif not exam_title or exam_title.lower() == "assessment examination":
            exam_title = "Mid Term Examination (Fall-2026)"

    exam_category = (req.exam_category.strip() if req.exam_category else "THEORY").upper()

    # Course Code: STRICTLY UNIVERSITY ONLY
    if is_university:
        course_code = req.course_code.strip() or meta.get("course_code", "")
    else:
        course_code = ""

    subject_val = req.subject.strip() or meta.get("subject", "General Subject")
    course_str = f"{subject_val} ({course_code})" if course_code else subject_val

    class_val = req.class_name.strip() or meta.get("class_name", "")
    if not class_val:
        class_val = "BSCS - 5th" if is_university else "10th" if academic_tier.lower() == "school" else "1st Year"

    class_label = "Semester" if is_university else "Class"
    t_name = req.teacher_name.strip() or meta.get('teacher_name', user['name'])
    dur = req.duration_minutes if req.duration_minutes is not None else meta.get("duration_minutes", (20 if is_quiz else 90))

    # Compute accurate total marks strictly based on question contents:
    # MCQs: 1 mark, Blanks: 1 mark, Shorts: 2 marks, Longs: 10 marks (if graph/diagram/tree/DSA/visual) else 6 marks
    computed_total_marks = 0
    if quiz_data.get("mcq_questions"):
        computed_total_marks += len(quiz_data["mcq_questions"]) * 1
    if quiz_data.get("fill_blank_questions"):
        computed_total_marks += len(quiz_data["fill_blank_questions"]) * 1
    if quiz_data.get("short_questions"):
        short_qs_all = quiz_data["short_questions"]
        if quiz_data.get("reading_passage"):
            computed_total_marks += 4  # 4 marks for comprehension passage
            computed_total_marks += sum(sq.get("marks", 2) for sq in short_qs_all[4:])
        else:
            computed_total_marks += sum(sq.get("marks", 2) for sq in short_qs_all)
    if quiz_data.get("long_questions"):
        for lq in quiz_data["long_questions"]:
            lq_m = lq.get("marks")
            if not lq_m or not isinstance(lq_m, (int, float)):
                lq_m = determine_long_question_marks(lq)
            computed_total_marks += int(lq_m)

    if computed_total_marks > 0:
        if req.total_marks is not None and req.total_marks > 0 and req.total_marks not in (20, 50, 10):
            marks = req.total_marks
        else:
            marks = computed_total_marks
    else:
        marks = req.total_marks if req.total_marks is not None else meta.get("total_marks", (10 if is_quiz else 20))

    set_label = req.exam_set.upper()
    include_clo = req.include_clo

    logo_path = process_base64_logo_safe(branding)

    # 1. UNIVERSITY / INSTITUTION HEADER (Centered, Exact University Style)
    if logo_path and os.path.exists(logo_path):
        header_table = doc.add_table(rows=1, cols=2)
        header_table.columns[0].width = Inches(1.0)
        header_table.columns[1].width = Inches(6.3)
        try:
            p_logo = header_table.cell(0, 0).paragraphs[0]
            p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_logo.add_run().add_picture(logo_path, width=Inches(0.9))
        except Exception as e:
            logger.error(f"Failed to add logo to DOCX: {e}")
        p_title = header_table.cell(0, 1).paragraphs[0]
    else:
        p_title = doc.add_paragraph()

    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_after = Pt(2)
    
    r_inst = p_title.add_run(f"{inst_name}\n")
    r_inst.bold = True
    r_inst.font.name = "Times New Roman"
    r_inst.font.size = Pt(14.5)

    r_dept = p_title.add_run(f"{dept_name}\n")
    r_dept.font.name = "Times New Roman"
    r_dept.font.size = Pt(11)

    r_exam = p_title.add_run(f"{exam_title}\n")
    r_exam.bold = True
    r_exam.font.name = "Times New Roman"
    r_exam.font.size = Pt(11)

    r_cat = p_title.add_run(f"{exam_category}")
    r_cat.bold = True
    r_cat.underline = True
    r_cat.font.name = "Times New Roman"
    r_cat.font.size = Pt(11)

    # 2. METADATA LEFT & RIGHT (Clean borderless layout matching Arid Paper)
    t_meta = doc.add_table(rows=1, cols=2)
    t_meta.autofit = False
    t_meta.columns[0].width = Inches(3.7)
    t_meta.columns[1].width = Inches(3.6)

    c_left = t_meta.cell(0, 0).paragraphs[0]
    c_left.paragraph_format.space_after = Pt(1)
    r_cl1 = c_left.add_run(f"{class_label}: {class_val}\n")
    r_cl1.font.name = "Times New Roman"
    r_cl1.font.size = Pt(9.5)
    r_cl1.bold = True

    r_cl2 = c_left.add_run(f"{course_str}")
    r_cl2.font.name = "Times New Roman"
    r_cl2.font.size = Pt(9.5)
    r_cl2.bold = True

    c_right = t_meta.cell(0, 1).paragraphs[0]
    c_right.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    c_right.paragraph_format.space_after = Pt(1)

    dur_text = f"{dur} Min" if dur < 60 else f"{dur // 60} Hour{'s' if dur >= 120 else ''} {dur % 60} Min" if dur % 60 else f"{dur // 60} Hours" if dur > 60 else "1.5 Hours" if dur == 90 else "1 Hour"
    r_cr1 = c_right.add_run(f"Time Allowed: {dur_text}\n")
    r_cr1.font.name = "Times New Roman"
    r_cr1.font.size = Pt(9.5)
    r_cr1.bold = True

    set_suffix = f"  [{set_label}]" if set_label != "STANDARD" else ""
    r_cr2 = c_right.add_run(f"Maximum Points: {marks}{set_suffix}")
    r_cr2.font.name = "Times New Roman"
    r_cr2.font.size = Pt(9.5)
    r_cr2.bold = True

    # 3. STUDENT REGISTRATION & NAME LINE (Matching Photo 2)
    p_reg = doc.add_paragraph()
    p_reg.paragraph_format.space_before = Pt(3)
    p_reg.paragraph_format.space_after = Pt(2)
    r_reg = p_reg.add_run("Registration No. __________________                Student Name: __________________")
    r_reg.font.name = "Times New Roman"
    r_reg.font.size = Pt(9)
    r_reg.bold = True

    # 4. HORIZONTAL DASHED DIVIDER (Matching Photo 1 & 3)
    p_sep = doc.add_paragraph()
    p_sep.paragraph_format.space_after = Pt(3)
    r_sep = p_sep.add_run("----------------------------------------------------------------------------------------------------------------------------------")
    r_sep.font.name = "Times New Roman"
    r_sep.font.size = Pt(8)
    r_sep.font.color.rgb = RGBColor(100, 116, 139)

    # 5. NOTE / INSTRUCTIONS SECTION (Matching Photos 1 & 3)
    if req.include_instructions:
        p_note = doc.add_paragraph()
        p_note.paragraph_format.space_after = Pt(6)
        r_nh = p_note.add_run("Note:   Solve all the questions.\n")
        r_nh.bold = True
        r_nh.font.name = "Times New Roman"
        r_nh.font.size = Pt(9)
        
        r_nb = p_note.add_run(
            "        Support your answer with mathematical equations and graphs where applicable.\n"
            "        Provide code examples where necessary.\n"
            "        All electronic devices, smartwatches, and programmable calculators are strictly prohibited."
        )
        r_nb.font.name = "Times New Roman"
        r_nb.font.size = Pt(8.5)

    # 6. QUESTIONS GENERATION WITH CLO CODES
    q_counter = 1

    # (A) Reading Comprehension / Case Study (Matching Photo 2)
    if quiz_data.get("reading_passage"):
        passage_text = str(quiz_data["reading_passage"])
        clo_tag = "(CLO - 02)  (04)" if include_clo else "(04 Marks)"
        
        t_qh = doc.add_table(rows=1, cols=2)
        t_qh.autofit = False
        t_qh.columns[0].width = Inches(5.5)
        t_qh.columns[1].width = Inches(1.8)
        
        c_l = t_qh.cell(0, 0).paragraphs[0]
        c_l.paragraph_format.space_after = Pt(2)
        r_ql = c_l.add_run(f"Question {q_counter:02d}: Write short and to the point answers to the questions given below from the following Reading Comprehension passage:")
        r_ql.bold = True
        r_ql.font.name = "Times New Roman"
        r_ql.font.size = Pt(10)

        c_r = t_qh.cell(0, 1).paragraphs[0]
        c_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        c_r.paragraph_format.space_after = Pt(2)
        r_qr = c_r.add_run(clo_tag)
        r_qr.bold = True
        r_qr.font.name = "Times New Roman"
        r_qr.font.size = Pt(10)

        p_cp = doc.add_paragraph()
        p_cp.paragraph_format.space_before = Pt(3)
        p_cp.paragraph_format.space_after = Pt(2)
        r_cp = p_cp.add_run("Comprehension passage:")
        r_cp.bold = True
        r_cp.font.name = "Times New Roman"
        r_cp.font.size = Pt(9.5)

        for para in passage_text.split("\n"):
            if para.strip():
                p_p = doc.add_paragraph(para.strip())
                p_p.paragraph_format.left_indent = Inches(0.2)
                p_p.paragraph_format.space_after = Pt(2)
                p_p.runs[0].font.name = "Times New Roman"
                p_p.runs[0].font.size = Pt(9)
                p_p.runs[0].font.italic = True

        p_cq = doc.add_paragraph()
        p_cq.paragraph_format.space_before = Pt(2)
        p_cq.paragraph_format.space_after = Pt(2)
        r_cq = p_cq.add_run("Questions:")
        r_cq.bold = True
        r_cq.font.name = "Times New Roman"
        r_cq.font.size = Pt(9.5)

        comp_questions = quiz_data.get("short_questions", [])[:4]
        for sub_idx, sq in enumerate(comp_questions):
            p_subq = doc.add_paragraph(f"{chr(97 + sub_idx)}) {sq.get('question_text')}")
            p_subq.paragraph_format.left_indent = Inches(0.25)
            p_subq.paragraph_format.space_after = Pt(1.5)
            p_subq.runs[0].font.name = "Times New Roman"
            p_subq.runs[0].font.size = Pt(9)

        doc.add_paragraph().paragraph_format.space_after = Pt(4)
        q_counter += 1

    # (B) Multiple Choice Questions (If present)
    if quiz_data.get("mcq_questions"):
        mcq_count = len(quiz_data["mcq_questions"])
        clo_tag = f"(CLO - 01)  ({mcq_count:02d})" if include_clo else f"({mcq_count} Marks)"

        t_qh = doc.add_table(rows=1, cols=2)
        t_qh.autofit = False
        t_qh.columns[0].width = Inches(5.5)
        t_qh.columns[1].width = Inches(1.8)

        c_l = t_qh.cell(0, 0).paragraphs[0]
        c_l.paragraph_format.space_after = Pt(2)
        r_ql = c_l.add_run(f"Question {q_counter:02d}: Multiple Choice Questions (Select the most appropriate option):")
        r_ql.bold = True
        r_ql.font.name = "Times New Roman"
        r_ql.font.size = Pt(10)

        c_r = t_qh.cell(0, 1).paragraphs[0]
        c_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        c_r.paragraph_format.space_after = Pt(2)
        r_qr = c_r.add_run(clo_tag)
        r_qr.bold = True
        r_qr.font.name = "Times New Roman"
        r_qr.font.size = Pt(10)

        for m_idx, q in enumerate(quiz_data["mcq_questions"], 1):
            p_m = doc.add_paragraph()
            p_m.paragraph_format.left_indent = Inches(0.2)
            p_m.paragraph_format.space_after = Pt(1)
            r_mn = p_m.add_run(f"{m_idx}. {q['question_text']}")
            r_mn.font.name = "Times New Roman"
            r_mn.font.size = Pt(9.5)

            opts = q.get('options', [])
            if len(opts) >= 4:
                t_opt = doc.add_table(rows=2, cols=2)
                t_opt.columns[0].width = Inches(3.5)
                t_opt.columns[1].width = Inches(3.5)
                pairs = [(f"a) {opts[0]}", f"b) {opts[1]}"), (f"c) {opts[2]}", f"d) {opts[3]}")]
                for r_i, (o1, o2) in enumerate(pairs):
                    c1 = t_opt.cell(r_i, 0).paragraphs[0]
                    c1.paragraph_format.left_indent = Inches(0.35)
                    c1.paragraph_format.space_after = Pt(1)
                    r1 = c1.add_run(o1)
                    r1.font.name = "Times New Roman"
                    r1.font.size = Pt(9)

                    c2 = t_opt.cell(r_i, 1).paragraphs[0]
                    c2.paragraph_format.left_indent = Inches(0.2)
                    c2.paragraph_format.space_after = Pt(1)
                    r2 = c2.add_run(o2)
                    r2.font.name = "Times New Roman"
                    r2.font.size = Pt(9)
            else:
                for j, opt in enumerate(opts):
                    p_opt = doc.add_paragraph(f"   {chr(97+j)}) {opt}")
                    p_opt.paragraph_format.left_indent = Inches(0.35)
                    p_opt.paragraph_format.space_after = Pt(1)
                    p_opt.runs[0].font.name = "Times New Roman"
                    p_opt.runs[0].font.size = Pt(9)

            doc.add_paragraph().paragraph_format.space_after = Pt(2)

        q_counter += 1

    # (C) Fill in the Blanks (If present)
    if quiz_data.get("fill_blank_questions"):
        fb_count = len(quiz_data["fill_blank_questions"])
        clo_tag = f"(CLO - 01)  ({fb_count:02d})" if include_clo else f"({fb_count} Marks)"

        t_qh = doc.add_table(rows=1, cols=2)
        t_qh.autofit = False
        t_qh.columns[0].width = Inches(5.5)
        t_qh.columns[1].width = Inches(1.8)

        c_l = t_qh.cell(0, 0).paragraphs[0]
        c_l.paragraph_format.space_after = Pt(2)
        r_ql = c_l.add_run(f"Question {q_counter:02d}: Fill in the blanks with appropriate technical terms:")
        r_ql.bold = True
        r_ql.font.name = "Times New Roman"
        r_ql.font.size = Pt(10)

        c_r = t_qh.cell(0, 1).paragraphs[0]
        c_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        c_r.paragraph_format.space_after = Pt(2)
        r_qr = c_r.add_run(clo_tag)
        r_qr.bold = True
        r_qr.font.name = "Times New Roman"
        r_qr.font.size = Pt(10)

        for fb_idx, q in enumerate(quiz_data["fill_blank_questions"], 1):
            p_fb = doc.add_paragraph()
            p_fb.paragraph_format.left_indent = Inches(0.2)
            p_fb.paragraph_format.space_after = Pt(3)
            r_fbt = p_fb.add_run(f"{fb_idx}. {q['question_text']}")
            r_fbt.font.name = "Times New Roman"
            r_fbt.font.size = Pt(9.5)

        q_counter += 1

    # (D) Short / Conceptual Questions (Matching Photos 1, 2, 3)
    short_qs = quiz_data.get("short_questions", [])
    if quiz_data.get("reading_passage"):
        short_qs = short_qs[4:]

    for sq_idx, q in enumerate(short_qs):
        clo_num = f"0{(sq_idx % 3) + 1}"
        clo_val = q.get("clo") or f"CLO - {clo_num}"
        m_val = q.get("marks", 2)
        clo_tag = f"({clo_val})  ({m_val:02d})" if include_clo else f"({m_val:02d} Marks)"

        t_qh = doc.add_table(rows=1, cols=2)
        t_qh.autofit = False
        t_qh.columns[0].width = Inches(5.5)
        t_qh.columns[1].width = Inches(1.8)

        c_l = t_qh.cell(0, 0).paragraphs[0]
        c_l.paragraph_format.space_after = Pt(2)
        r_ql = c_l.add_run(f"Question {q_counter:02d}:")
        r_ql.bold = True
        r_ql.font.name = "Times New Roman"
        r_ql.font.size = Pt(10.5)

        c_r = t_qh.cell(0, 1).paragraphs[0]
        c_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        c_r.paragraph_format.space_after = Pt(2)
        r_qr = c_r.add_run(clo_tag)
        r_qr.bold = True
        r_qr.font.name = "Times New Roman"
        r_qr.font.size = Pt(10.5)

        p_qt = doc.add_paragraph(q['question_text'])
        p_qt.paragraph_format.space_after = Pt(5)
        p_qt.runs[0].font.name = "Times New Roman"
        p_qt.runs[0].font.size = Pt(10)

        q_counter += 1

    # (E) Descriptive / Long / Practical Questions (Matching Photo 1 & 3)
    for lq_idx, q in enumerate(quiz_data.get("long_questions", [])):
        clo_num = f"0{(lq_idx % 2) + 2}"
        clo_val = q.get("clo") or f"CLO - {clo_num}"
        lq_m = q.get("marks")
        if not lq_m or not isinstance(lq_m, (int, float)):
            lq_m = determine_long_question_marks(q)
        else:
            lq_m = int(lq_m)
        marks_str = f"({lq_m:02d})"
        clo_tag = f"({clo_val})  {marks_str}" if include_clo else f"{marks_str}"

        t_qh = doc.add_table(rows=1, cols=2)
        t_qh.autofit = False
        t_qh.columns[0].width = Inches(5.2)
        t_qh.columns[1].width = Inches(2.1)

        c_l = t_qh.cell(0, 0).paragraphs[0]
        c_l.paragraph_format.space_after = Pt(2)
        r_ql = c_l.add_run(f"Question {q_counter:02d}:")
        r_ql.bold = True
        r_ql.font.name = "Times New Roman"
        r_ql.font.size = Pt(10.5)

        c_r = t_qh.cell(0, 1).paragraphs[0]
        c_r.alignment = WD_ALIGN_PARAGRAPH.RIGHT
        c_r.paragraph_format.space_after = Pt(2)
        r_qr = c_r.add_run(clo_tag)
        r_qr.bold = True
        r_qr.font.name = "Times New Roman"
        r_qr.font.size = Pt(10.5)

        p_qt = doc.add_paragraph(q['question_text'])
        p_qt.paragraph_format.space_after = Pt(6)
        p_qt.runs[0].font.name = "Times New Roman"
        p_qt.runs[0].font.size = Pt(10)

        q_counter += 1

    # 7. SIGNATURE FOOTER (Exact Match to Photo 1 & Photo 3)
    p_luck = doc.add_paragraph()
    p_luck.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_luck.paragraph_format.space_before = Pt(18)
    p_luck.paragraph_format.space_after = Pt(6)
    r_luck = p_luck.add_run("*****Good Luck*****")
    r_luck.bold = True
    r_luck.font.name = "Times New Roman"
    r_luck.font.size = Pt(10)

    # 8. CONFIDENTIAL TEACHER MARKING SCHEME
    if req.include_answer_key:
        doc.add_page_break()
        p_mh = doc.add_paragraph()
        p_mh.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_mh.paragraph_format.space_after = Pt(2)
        r_mh = p_mh.add_run("CONFIDENTIAL — INSTRUCTOR MARKING SCHEME & RUBRICS\n")
        r_mh.bold = True
        r_mh.font.name = "Times New Roman"
        r_mh.font.size = Pt(13)
        r_mh.font.color.rgb = RGBColor(185, 28, 28)

        r_subm = p_mh.add_run(f"EXAMINATION SET: {set_label} • EVALUATION GUIDE ONLY")
        r_subm.bold = True
        r_subm.font.name = "Times New Roman"
        r_subm.font.size = Pt(9.5)
        r_subm.font.color.rgb = RGBColor(71, 85, 105)

        doc.add_paragraph().paragraph_format.space_after = Pt(4)

        for sec_name, sec_key in [
            ("Objective Answer Key", "mcq_questions"),
            ("Fill in the Blanks Key", "fill_blank_questions"),
            ("Short Questions Model Points", "short_questions"),
            ("Descriptive Questions Evaluation Guide", "long_questions")
        ]:
            if quiz_data.get(sec_key):
                p_sh = doc.add_paragraph()
                p_sh.paragraph_format.space_after = Pt(2)
                r_sh = p_sh.add_run(sec_name)
                r_sh.bold = True
                r_sh.font.name = "Times New Roman"
                r_sh.font.size = Pt(10.5)

                for k, q in enumerate(quiz_data[sec_key], 1):
                    ans = q.get('correct_answer') or q.get('model_answer') or ""
                    expl = q.get('explanation') or ""
                    p_a = doc.add_paragraph()
                    p_a.paragraph_format.space_after = Pt(2)
                    r_ak = p_a.add_run(f"Q{k}. ")
                    r_ak.bold = True
                    r_ak.font.name = "Times New Roman"
                    r_ak.font.size = Pt(9)

                    r_at = p_a.add_run(f"Answer: {ans}")
                    r_at.font.name = "Times New Roman"
                    r_at.font.size = Pt(9)

                    if expl:
                        p_e = doc.add_paragraph(f"     Explanation / Rubric: {expl}")
                        p_e.paragraph_format.space_after = Pt(3)
                        p_e.runs[0].font.name = "Times New Roman"
                        p_e.runs[0].font.size = Pt(8.5)
                        p_e.runs[0].font.italic = True
                        p_e.runs[0].font.color.rgb = RGBColor(71, 85, 105)

                doc.add_paragraph().paragraph_format.space_after = Pt(4)

    if logo_path and os.path.exists(logo_path):
        os.remove(logo_path)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    safe_fn = re.sub(r'[^a-zA-Z0-9_-]', '_', f"{subject_val}_{exam_title}_{req.exam_set}")[:45]
    return StreamingResponse(buffer, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": f"attachment; filename=Exam_{safe_fn}.docx"})

@app.post("/quiz/{quiz_id}/export/pdf")
def export_quiz_pdf(quiz_id: int, req: ExportQuizRequest, user=Depends(get_current_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")

    # If the user is a student and this quiz is an assigned classroom examination, deny confidential answer key
    if user.get("role") != "teacher":
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT a.id FROM assignments a
            JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
            WHERE a.quiz_id = ? AND cs.student_id = ?
        ''', (quiz_id, user["id"]))
        if cursor.fetchone():
            req.include_answer_key = False
        conn.close()

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    meta = quiz["exam_metadata"]
    raw_quiz_data = quiz["quiz_data"]
    quiz_data = prepare_exam_data(raw_quiz_data, req.exam_set)

    branding = database.get_teacher_branding(quiz.get("teacher_id") or user["id"])
    inst_name = req.institution_name.strip()
    if not inst_name or inst_name == "Academic Examination Department":
        if branding and branding.get("academy_name"):
            inst_name = branding["academy_name"]
        else:
            inst_name = meta.get("institution_name", "Academic Examination Department")
    dept_name = req.department_name.strip() or meta.get("department_name") or meta.get("department", "Examination Branch")

    academic_tier = (req.academic_tier or meta.get("academic_tier", "University")).strip()
    is_university = academic_tier.lower() == "university"

    raw_exam_title = req.exam_title.strip() or meta.get("exam_title", "")
    paper_type = (req.paper_type or meta.get("paper_type", "")).strip().lower()
    quiz_num = (req.quiz_number or meta.get("quiz_number", "")).strip()

    is_quiz = (paper_type == "quiz") or ("quiz" in raw_exam_title.lower())
    if is_quiz:
        if not quiz_num:
            match = re.search(r"quiz\s*(?:no\.?|#)?\s*(\d+)", raw_exam_title, re.IGNORECASE)
            quiz_num = match.group(1).zfill(2) if match else "01"
        else:
            quiz_num = str(quiz_num).zfill(2)
        exam_title = f"Quiz No. {quiz_num}"
    else:
        exam_title = raw_exam_title
        if re.search(r"mid\s*term.*mid\s*term", exam_title, re.IGNORECASE) or re.search(r"midterm.*midterm", exam_title, re.IGNORECASE) or (exam_title.lower() in ("midterm", "mid term", "mid-term")):
            exam_title = "Mid Term Examination (Fall-2026)"
        elif re.search(r"final\s*term.*final\s*term", exam_title, re.IGNORECASE) or re.search(r"final.*final", exam_title, re.IGNORECASE) or (exam_title.lower() in ("final", "final term", "finalterm", "final-term")):
            exam_title = "Final Term Examination (Fall-2026)"
        elif not exam_title or exam_title.lower() == "assessment examination":
            exam_title = "Mid Term Examination (Fall-2026)"

    exam_category = (req.exam_category.strip() if req.exam_category else "THEORY").upper()

    # Course Code: STRICTLY UNIVERSITY ONLY
    if is_university:
        course_code = req.course_code.strip() or meta.get("course_code", "")
    else:
        course_code = ""

    subject_val = req.subject.strip() or meta.get("subject", "General Subject")
    course_str = f"{subject_val} ({course_code})" if course_code else subject_val

    class_val = req.class_name.strip() or meta.get("class_name", "")
    if not class_val:
        class_val = "BSCS - 5th" if is_university else "10th" if academic_tier.lower() == "school" else "1st Year"

    class_label = "Semester" if is_university else "Class"
    t_name = req.teacher_name.strip() or meta.get('teacher_name', user['name'])
    dur = req.duration_minutes if req.duration_minutes is not None else meta.get("duration_minutes", (20 if is_quiz else 90))

    # Compute accurate total marks strictly based on question contents:
    computed_total_marks = 0
    if quiz_data.get("mcq_questions"):
        computed_total_marks += len(quiz_data["mcq_questions"]) * 1
    if quiz_data.get("fill_blank_questions"):
        computed_total_marks += len(quiz_data["fill_blank_questions"]) * 1
    if quiz_data.get("short_questions"):
        short_qs_all = quiz_data["short_questions"]
        if quiz_data.get("reading_passage"):
            computed_total_marks += 4  # 4 marks for comprehension passage
            computed_total_marks += sum(sq.get("marks", 2) for sq in short_qs_all[4:])
        else:
            computed_total_marks += sum(sq.get("marks", 2) for sq in short_qs_all)
    if quiz_data.get("long_questions"):
        for lq in quiz_data["long_questions"]:
            lq_m = lq.get("marks")
            if not lq_m or not isinstance(lq_m, (int, float)):
                lq_m = determine_long_question_marks(lq)
            computed_total_marks += int(lq_m)

    if computed_total_marks > 0:
        if req.total_marks is not None and req.total_marks > 0 and req.total_marks not in (20, 50, 10):
            marks = req.total_marks
        else:
            marks = computed_total_marks
    else:
        marks = req.total_marks if req.total_marks is not None else meta.get("total_marks", (10 if is_quiz else 20))

    set_label = req.exam_set.upper()
    include_clo = req.include_clo

    logo_path = process_base64_logo_safe(branding)
    logo_img = None
    if logo_path and os.path.exists(logo_path):
        try:
            logo_img = RLImage(logo_path, width=0.9 * 72, height=0.9 * 72, kind='proportional')
        except Exception as e:
            logger.error(f"Failed to add logo to PDF: {e}")

    # Custom ReportLab Typography styles (Times New Roman / Times-Roman)
    styles.add(ParagraphStyle(name='AridInst', fontName='Times-Bold', fontSize=14.5, leading=17, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name='AridDept', fontName='Times-Roman', fontSize=11, leading=14, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name='AridExam', fontName='Times-Bold', fontSize=11, leading=14, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name='AridCat', fontName='Times-Bold', fontSize=11, leading=14, alignment=TA_CENTER))
    styles.add(ParagraphStyle(name='AridMetaL', fontName='Times-Bold', fontSize=9.5, leading=12, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='AridMetaR', fontName='Times-Bold', fontSize=9.5, leading=12, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name='AridReg', fontName='Times-Bold', fontSize=9, leading=12, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='AridNoteH', fontName='Times-Bold', fontSize=9, leading=12, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='AridNoteB', fontName='Times-Roman', fontSize=8.5, leading=11.5, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='AridQL', fontName='Times-Bold', fontSize=10.5, leading=13, alignment=TA_LEFT))
    styles.add(ParagraphStyle(name='AridQR', fontName='Times-Bold', fontSize=10.5, leading=13, alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name='AridQBody', fontName='Times-Roman', fontSize=10, leading=13.5, alignment=TA_LEFT, spaceAfter=4))
    styles.add(ParagraphStyle(name='AridGoodLuck', fontName='Times-Bold', fontSize=10, leading=13, alignment=TA_CENTER, spaceBefore=16, spaceAfter=6))

    elements = []

    # 1. HEADER (Centered, Times-Roman)
    p_header = Paragraph(f"""
        <para align='center'>
            <font size='14.5' face='Times-Bold'><b>{inst_name}</b></font><br/>
            <font size='11' face='Times-Roman'>{dept_name}</font><br/>
            <font size='11' face='Times-Bold'><b>{exam_title}</b></font><br/>
            <font size='11' face='Times-Bold'><u><b>{exam_category}</b></u></font>
        </para>
    """, styles['Normal'])

    if logo_img:
        header_table = Table([[logo_img, p_header]], colWidths=[1.0 * 72, 6.4 * 72])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (0, 0), (0, 0), 'CENTER'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER')
        ]))
    else:
        header_table = Table([[p_header]], colWidths=[7.4 * 72])
        header_table.setStyle(TableStyle([('ALIGN', (0, 0), (-1, -1), 'CENTER')]))
    
    elements.append(header_table)
    elements.append(Spacer(1, 4))

    # 2. METADATA LEFT & RIGHT ROW
    dur_text = f"{dur} Min" if dur < 60 else f"{dur // 60} Hour{'s' if dur >= 120 else ''} {dur % 60} Min" if dur % 60 else f"{dur // 60} Hours" if dur > 60 else "1.5 Hours" if dur == 90 else "1 Hour"
    set_suffix = f" &nbsp; [{set_label}]" if set_label != "STANDARD" else ""
    
    p_metal = Paragraph(f"<b>{class_label}:</b> {class_val}<br/><b>{course_str}</b>", styles['AridMetaL'])
    p_metar = Paragraph(f"<b>Time Allowed:</b> {dur_text}<br/><b>Maximum Points:</b> {marks}{set_suffix}", styles['AridMetaR'])
    t_meta = Table([[p_metal, p_metar]], colWidths=[3.7 * 72, 3.7 * 72])
    t_meta.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('PADDING', (0, 0), (-1, -1), 0),
    ]))
    elements.append(t_meta)
    elements.append(Spacer(1, 4))

    # 3. REGISTRATION LINE
    elements.append(Paragraph("<b>Registration No.</b> __________________ &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <b>Students Name:</b> __________________", styles['AridReg']))
    elements.append(Spacer(1, 2))

    # 4. DASHED SEPARATOR LINE
    elements.append(Paragraph("<font color='#64748b' size='8'>----------------------------------------------------------------------------------------------------------------------------------</font>", styles['Normal']))
    elements.append(Spacer(1, 3))

    # 5. NOTE / INSTRUCTIONS SECTION
    if req.include_instructions:
        elements.append(Paragraph("<b>Note: &nbsp; Solve all the questions.</b>", styles['AridNoteH']))
        elements.append(Paragraph("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Support your answer with mathematical equations and graphs where applicable.<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Provide code examples where necessary.<br/>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;All electronic devices, smartwatches, and programmable calculators are strictly prohibited.", styles['AridNoteB']))
        elements.append(Spacer(1, 6))

    # 6. QUESTIONS
    q_counter = 1

    # (A) Reading Comprehension (Matching Photo 2)
    if quiz_data.get("reading_passage"):
        passage_text = str(quiz_data["reading_passage"])
        clo_tag = "(CLO - 02) &nbsp;(04)" if include_clo else "(04 Marks)"
        
        p_ql = Paragraph(f"<b>Question {q_counter:02d}:</b> Write short and to the point answers to the questions given below from the following Reading Comprehension passage:", styles['AridQL'])
        p_qr = Paragraph(f"<b>{clo_tag}</b>", styles['AridQR'])
        t_qh = Table([[p_ql, p_qr]], colWidths=[5.6 * 72, 1.8 * 72])
        t_qh.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 0)]))
        elements.append(t_qh)
        elements.append(Spacer(1, 2))

        elements.append(Paragraph("<b>Comprehension passage:</b>", styles['AridReg']))
        for para in passage_text.split("\n"):
            if para.strip():
                elements.append(Paragraph(f"<i>&nbsp;&nbsp;&nbsp;&nbsp;{para.strip()}</i>", styles['AridNoteB']))
                elements.append(Spacer(1, 2))

        elements.append(Paragraph("<b>Questions:</b>", styles['AridReg']))
        comp_questions = quiz_data.get("short_questions", [])[:4]
        for sub_idx, sq in enumerate(comp_questions):
            elements.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;<b>{chr(97 + sub_idx)})</b> {sq.get('question_text')}", styles['AridQBody']))
        elements.append(Spacer(1, 4))
        q_counter += 1

    # (B) Multiple Choice Questions
    if quiz_data.get("mcq_questions"):
        mcq_count = len(quiz_data["mcq_questions"])
        clo_tag = f"(CLO - 01) &nbsp;({mcq_count:02d})" if include_clo else f"({mcq_count} Marks)"

        p_ql = Paragraph(f"<b>Question {q_counter:02d}:</b> Multiple Choice Questions (Select the most appropriate option):", styles['AridQL'])
        p_qr = Paragraph(f"<b>{clo_tag}</b>", styles['AridQR'])
        t_qh = Table([[p_ql, p_qr]], colWidths=[5.6 * 72, 1.8 * 72])
        t_qh.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 0)]))
        elements.append(t_qh)
        elements.append(Spacer(1, 3))

        for m_idx, q in enumerate(quiz_data["mcq_questions"], 1):
            elements.append(Paragraph(f"<b>{m_idx}.</b> {q['question_text']}", styles['AridQBody']))
            opts = q.get('options', [])
            if len(opts) >= 4:
                opts_data = [
                    [Paragraph(f"a) {opts[0]}", styles['AridNoteB']), Paragraph(f"b) {opts[1]}", styles['AridNoteB'])],
                    [Paragraph(f"c) {opts[2]}", styles['AridNoteB']), Paragraph(f"d) {opts[3]}", styles['AridNoteB'])]
                ]
                t_o = Table(opts_data, colWidths=[3.7 * 72, 3.7 * 72])
                t_o.setStyle(TableStyle([('PADDING', (0, 0), (-1, -1), 1), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
                elements.append(t_o)
            else:
                for j, opt in enumerate(opts):
                    elements.append(Paragraph(f"&nbsp;&nbsp;&nbsp;&nbsp;{chr(97+j)}) {opt}", styles['AridNoteB']))
            elements.append(Spacer(1, 3))

        q_counter += 1

    # (C) Fill in the Blanks
    if quiz_data.get("fill_blank_questions"):
        fb_count = len(quiz_data["fill_blank_questions"])
        clo_tag = f"(CLO - 01) &nbsp;({fb_count:02d})" if include_clo else f"({fb_count} Marks)"

        p_ql = Paragraph(f"<b>Question {q_counter:02d}:</b> Fill in the blanks with appropriate technical terms:", styles['AridQL'])
        p_qr = Paragraph(f"<b>{clo_tag}</b>", styles['AridQR'])
        t_qh = Table([[p_ql, p_qr]], colWidths=[5.6 * 72, 1.8 * 72])
        t_qh.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 0)]))
        elements.append(t_qh)
        elements.append(Spacer(1, 3))

        for fb_idx, q in enumerate(quiz_data["fill_blank_questions"], 1):
            elements.append(Paragraph(f"<b>{fb_idx}.</b> {q['question_text']}", styles['AridQBody']))
            elements.append(Spacer(1, 2))

        q_counter += 1

    # (D) Short Questions
    short_qs = quiz_data.get("short_questions", [])
    if quiz_data.get("reading_passage"):
        short_qs = short_qs[4:]

    for sq_idx, q in enumerate(short_qs):
        clo_num = f"0{(sq_idx % 3) + 1}"
        clo_val = q.get("clo") or f"CLO - {clo_num}"
        m_val = q.get("marks", 2)
        clo_tag = f"({clo_val}) &nbsp;({m_val:02d})" if include_clo else f"({m_val:02d} Marks)"

        p_ql = Paragraph(f"<b>Question {q_counter:02d}:</b>", styles['AridQL'])
        p_qr = Paragraph(f"<b>{clo_tag}</b>", styles['AridQR'])
        t_qh = Table([[p_ql, p_qr]], colWidths=[5.6 * 72, 1.8 * 72])
        t_qh.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 0)]))
        elements.append(t_qh)
        elements.append(Spacer(1, 2))

        elements.append(Paragraph(q['question_text'], styles['AridQBody']))
        elements.append(Spacer(1, 4))
        q_counter += 1

    # (E) Long / Practical Questions (Matching Photos 1 & 3)
    for lq_idx, q in enumerate(quiz_data.get("long_questions", [])):
        clo_num = f"0{(lq_idx % 2) + 2}"
        clo_val = q.get("clo") or f"CLO - {clo_num}"
        lq_m = q.get("marks")
        if not lq_m or not isinstance(lq_m, (int, float)):
            lq_m = determine_long_question_marks(q)
        else:
            lq_m = int(lq_m)
        marks_str = f"({lq_m:02d})"
        clo_tag = f"({clo_val}) &nbsp;{marks_str}" if include_clo else f"{marks_str}"

        p_ql = Paragraph(f"<b>Question {q_counter:02d}:</b>", styles['AridQL'])
        p_qr = Paragraph(f"<b>{clo_tag}</b>", styles['AridQR'])
        t_qh = Table([[p_ql, p_qr]], colWidths=[5.4 * 72, 2.0 * 72])
        t_qh.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('PADDING', (0, 0), (-1, -1), 0)]))
        elements.append(t_qh)
        elements.append(Spacer(1, 2))

        elements.append(Paragraph(q['question_text'], styles['AridQBody']))
        elements.append(Spacer(1, 5))
        q_counter += 1

    # 7. SIGNATURE FOOTER (Matching Photos 1 & 3)
    elements.append(Paragraph("*****Good Luck*****", styles['AridGoodLuck']))

    # 8. CONFIDENTIAL MARKING SCHEME
    if req.include_answer_key:
        elements.append(PageBreak())
        elements.append(Paragraph(f"""
            <para align='center'>
                <font size='13' face='Times-Bold' color='#b91c1c'><b>CONFIDENTIAL — INSTRUCTOR MARKING SCHEME & RUBRICS</b></font><br/>
                <font size='9.5' face='Times-Bold' color='#475569'><b>EXAMINATION SET: {set_label} • EVALUATION GUIDE ONLY</b></font>
            </para>
        """, styles['Normal']))
        elements.append(Spacer(1, 8))

        for sec_name, sec_key in [
            ("Objective Answer Key", "mcq_questions"),
            ("Fill in the Blanks Key", "fill_blank_questions"),
            ("Short Questions Model Points", "short_questions"),
            ("Descriptive Questions Evaluation Guide", "long_questions")
        ]:
            if quiz_data.get(sec_key):
                elements.append(Paragraph(f"<font size='10.5' face='Times-Bold' color='#1e3a8a'><b>{sec_name}</b></font>", styles['Normal']))
                elements.append(Spacer(1, 3))
                for k, q in enumerate(quiz_data[sec_key], 1):
                    ans = q.get('correct_answer') or q.get('model_answer') or ""
                    expl = q.get('explanation') or ""
                    elements.append(Paragraph(f"<font size='9' face='Times-Roman'><b>Q{k}. Answer:</b> {ans}</font>", styles['Normal']))
                    if expl:
                        elements.append(Paragraph(f"<font size='8.5' face='Times-Italic' color='#475569'>&nbsp;&nbsp;&nbsp;&nbsp;Explanation: {expl}</font>", styles['Normal']))
                    elements.append(Spacer(1, 2))
                elements.append(Spacer(1, 6))

    doc.build(elements)
    buffer.seek(0)

    if logo_path and os.path.exists(logo_path):
        os.remove(logo_path)

    safe_fn = re.sub(r'[^a-zA-Z0-9_-]', '_', f"{subject_val}_{exam_title}_{req.exam_set}")[:45]
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Exam_{safe_fn}.pdf"})

# ==========================================
# Baqi Code (Teacher Quizzes, Classes, Submissions, Analytics, Branding waghaira)
# ==========================================
@app.get("/quiz/{quiz_id}")
def get_quiz_for_student(
    quiz_id: int, 
    request: Request, 
    assignment_id: Optional[int] = None,
    user=Depends(get_optional_user)
):
    quiz = database.get_quiz(quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")

    # Check if this quiz is an assignment for the student
    is_assignment = False
    has_submitted = False
    classroom_name = None
    teacher_name = None
    asgn_id_resolved = assignment_id

    if user:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        
        # Look up if this quiz is assigned to any classroom the student is enrolled in
        if asgn_id_resolved:
            cursor.execute('''
                SELECT a.id, c.name as classroom_name, u.name as teacher_name
                FROM assignments a
                JOIN classrooms c ON a.classroom_id = c.id
                JOIN classroom_students cs ON cs.classroom_id = c.id
                JOIN users u ON c.teacher_id = u.id
                WHERE a.id = ? AND cs.student_id = ?
            ''', (asgn_id_resolved, user["id"]))
        else:
            cursor.execute('''
                SELECT a.id, c.name as classroom_name, u.name as teacher_name
                FROM assignments a
                JOIN classrooms c ON a.classroom_id = c.id
                JOIN classroom_students cs ON cs.classroom_id = c.id
                JOIN users u ON c.teacher_id = u.id
                WHERE a.quiz_id = ? AND cs.student_id = ?
                ORDER BY a.id DESC LIMIT 1
            ''', (quiz_id, user["id"]))
        
        asgn_match = cursor.fetchone()
        if asgn_match:
            is_assignment = True
            asgn_id_resolved = asgn_match["id"]
            classroom_name = asgn_match["classroom_name"]
            teacher_name = asgn_match["teacher_name"]

            # Check if this student has already submitted
            cursor.execute('''
                SELECT id FROM attempts
                WHERE user_id = ? AND (assignment_id = ? OR quiz_id = ?)
                ORDER BY id DESC LIMIT 1
            ''', (user["id"], asgn_id_resolved, quiz_id))
            if cursor.fetchone():
                has_submitted = True
        
        conn.close()

    quiz_data = quiz["quiz_data"]
    safe_quiz_data = {
        "mcq_questions": [{"question_text": q["question_text"], "options": q["options"]} for q in quiz_data.get("mcq_questions", [])],
        "fill_blank_questions": [{"question_text": q["question_text"]} for q in quiz_data.get("fill_blank_questions", [])],
        "short_questions": [{"question_text": q["question_text"]} for q in quiz_data.get("short_questions", [])],
        "long_questions": [{"question_text": q["question_text"]} for q in quiz_data.get("long_questions", [])],
    }
    if "reading_passage" in quiz_data:
        safe_quiz_data["reading_passage"] = quiz_data["reading_passage"]
    return {
        "quiz_id": quiz_id, 
        "exam_metadata": quiz["exam_metadata"], 
        "quiz_data": safe_quiz_data,
        "is_assignment": is_assignment,
        "has_submitted": has_submitted,
        "assignment_id": asgn_id_resolved,
        "classroom_name": classroom_name,
        "teacher_name": teacher_name
    }

@app.get("/quiz/{quiz_id}/study-mode")
def get_quiz_for_study(quiz_id: int, user=Depends(get_optional_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found.")
    
    # If the user is a student and this quiz is an assigned classroom examination, deny study mode
    if user:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT a.id FROM assignments a
            JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
            WHERE a.quiz_id = ? AND cs.student_id = ?
        ''', (quiz_id, user["id"]))
        if cursor.fetchone():
            conn.close()
            raise HTTPException(
                status_code=403, 
                detail="Study mode with answer key is disabled for assigned classroom examinations."
            )
        conn.close()

    import copy
    quiz_data = copy.deepcopy(quiz["quiz_data"])
    for q in quiz_data.get("short_questions", []):
        if isinstance(q, dict):
            ans = q.get("model_answer") or q.get("correct_answer") or q.get("explanation") or ""
            q["model_answer"] = ans
            q["correct_answer"] = ans
    for q in quiz_data.get("long_questions", []):
        if isinstance(q, dict):
            ans = q.get("model_answer") or q.get("correct_answer") or ""
            q["model_answer"] = ans
            q["correct_answer"] = ans

    return {
        "quiz_id": quiz_id,
        "exam_metadata": quiz["exam_metadata"],
        "quiz_data": quiz_data,
    }

@app.post("/quiz/{quiz_id}/submit")
def submit_attempt(quiz_id: int, req: SubmitAttemptRequest, request: Request, user=Depends(get_optional_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")

    # Determine if this attempt is for an assigned classroom quiz
    is_assignment = False
    asgn_id = req.assignment_id

    if user:
        conn = database.get_db_connection()
        cursor = conn.cursor()
        if asgn_id:
            cursor.execute('''
                SELECT a.id FROM assignments a
                JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
                WHERE a.id = ? AND cs.student_id = ?
            ''', (asgn_id, user["id"]))
        else:
            cursor.execute('''
                SELECT a.id FROM assignments a
                JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
                WHERE a.quiz_id = ? AND cs.student_id = ?
                ORDER BY a.id DESC LIMIT 1
            ''', (quiz_id, user["id"]))
        asgn_match = cursor.fetchone()
        if asgn_match:
            is_assignment = True
            asgn_id = asgn_match["id"]

            # Check if student already submitted this assignment
            cursor.execute('''
                SELECT id FROM attempts
                WHERE user_id = ? AND (assignment_id = ? OR quiz_id = ?)
            ''', (user["id"], asgn_id, quiz_id))
            if cursor.fetchone():
                conn.close()
                raise HTTPException(
                    status_code=400,
                    detail="You have already submitted this assignment. Multiple attempts are not permitted."
                )
        conn.close()

    quiz_data = quiz["quiz_data"]
    answers = req.answers
    results = {"mcq": [], "fill_blank": [], "short": [], "long": [], "total_score": 0.0, "max_score": 0}

    for i, q in enumerate(quiz_data.get("mcq_questions", [])):
        selected = answers.get(f"mcq_{i}")
        is_correct = check_mcq(selected, q["correct_answer"])
        results["mcq"].append({"question": q["question_text"], "selected": selected, "correct_answer": q["correct_answer"], "is_correct": is_correct, "explanation": q["explanation"]})
        results["max_score"] += 1
        results["total_score"] += 1 if is_correct else 0

    for i, q in enumerate(quiz_data.get("fill_blank_questions", [])):
        student_ans = answers.get(f"fb_{i}", "")
        is_correct = check_fill_blank(student_ans, q["correct_answer"])
        results["fill_blank"].append({"question": q["question_text"], "student_answer": student_ans, "correct_answer": q["correct_answer"], "is_correct": is_correct, "explanation": q["explanation"]})
        results["max_score"] += 1
        results["total_score"] += 1 if is_correct else 0

    short_questions = quiz_data.get("short_questions", [])
    long_questions = quiz_data.get("long_questions", [])

    def grade_sq_item(idx, q_item):
        student_ans = answers.get(f"short_{idx}", "")
        try:
            grade = grade_long_answer(q_item["question_text"], q_item.get("correct_answer", ""), [], student_ans)
        except Exception:
            grade = {"score_percent": 50.0, "feedback": "Evaluation completed.", "strengths": [], "missed_points": []}
        return (idx, {
            "question": q_item["question_text"],
            "student_answer": student_ans,
            "model_answer": q_item.get("correct_answer", ""),
            "score_percent": grade["score_percent"],
            "feedback": grade["feedback"],
            "strengths": grade.get("strengths", []),
            "missed_points": grade.get("missed_points", [])
        })

    def grade_lq_item(idx, q_item):
        student_ans = answers.get(f"long_{idx}", "")
        try:
            grade = grade_long_answer(q_item["question_text"], q_item.get("model_answer", ""), q_item.get("key_points", []), student_ans)
        except Exception:
            grade = {"score_percent": 50.0, "feedback": "Evaluation completed.", "strengths": [], "missed_points": []}
        lq_marks = q_item.get("marks")
        if not lq_marks or not isinstance(lq_marks, (int, float)):
            lq_marks = determine_long_question_marks(q_item)
        else:
            lq_marks = int(lq_marks)
        return (idx, {
            "question": q_item["question_text"],
            "student_answer": student_ans,
            "model_answer": q_item.get("model_answer", ""),
            "score_percent": grade["score_percent"],
            "feedback": grade["feedback"],
            "marks": lq_marks,
            "strengths": grade.get("strengths", []),
            "missed_points": grade.get("missed_points", [])
        }, lq_marks)

    # ⚡ Run all subjective evaluations concurrently in parallel threads (reduces latency by up to 85%)
    if short_questions or long_questions:
        with ThreadPoolExecutor(max_workers=min(8, len(short_questions) + len(long_questions) or 1)) as executor:
            sq_futures = [executor.submit(grade_sq_item, i, q) for i, q in enumerate(short_questions)]
            lq_futures = [executor.submit(grade_lq_item, i, q) for i, q in enumerate(long_questions)]

            sq_results = [f.result() for f in sq_futures]
            lq_results = [f.result() for f in lq_futures]

        sq_results.sort(key=lambda x: x[0])
        for _, sq_res in sq_results:
            results["short"].append(sq_res)
            results["max_score"] += 2
            results["total_score"] += (sq_res["score_percent"] / 100) * 2

        lq_results.sort(key=lambda x: x[0])
        for _, lq_res, lq_marks in lq_results:
            results["long"].append(lq_res)
            results["max_score"] += lq_marks
            results["total_score"] += (lq_res["score_percent"] / 100) * lq_marks

    results["total_score"] = round(results["total_score"], 2)

    attempt_id = database.save_attempt(
        quiz_id, 
        req.student_name, 
        answers, 
        results, 
        user_id=user["id"] if user else None,
        assignment_id=asgn_id if is_assignment else None
    )
    
    if user: database.update_streak_and_badges(user["id"])
    if user and req.challenge_code:
        challenge = database.get_challenge_by_code(req.challenge_code)
        if challenge: database.record_challenge_participant(challenge["id"], user["id"], attempt_id)

    if is_assignment:
        # Confidentiality: conceal marks and answer key from student on classroom assignment submission
        return {
            "attempt_id": attempt_id, 
            "is_assignment": True, 
            "message": "Assignment submitted successfully and delivered to your instructor.",
            "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

    return {"attempt_id": attempt_id, "is_assignment": False, "results": results}


@app.get("/quiz/attempt/{attempt_id}/status")
def get_attempt_status(attempt_id: int):
    """Returns status and detailed results for a specific quiz submission attempt."""
    attempt = database.get_attempt_detail(attempt_id)
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt record not found.")
    return {
        "attempt_id": attempt_id,
        "is_assignment": bool(attempt.get("assignment_id")),
        "results": attempt.get("results", {})
    }

@app.get("/challenge/{code}")
def get_challenge(code: str, request: Request):
    challenge = database.get_challenge_by_code(code.upper())
    if not challenge: raise HTTPException(status_code=404, detail="Invalid Challenge Code.")
    return get_quiz_for_student(challenge["quiz_id"], request)

@app.get("/teacher/quizzes")
def get_teacher_quizzes_api(user=Depends(require_teacher)):
    quizzes = database.get_quizzes_for_teacher(user["id"])
    formatted_quizzes = []
    for q in quizzes:
        formatted_quizzes.append({
            "id": q["id"],
            "title": q["exam_metadata"].get("exam_title", "Assessment Examination"),
            "subject": q["exam_metadata"].get("subject", "Not Specified"),
            "date": q["created_at"].split(" ")[0] 
        })
    return {"quizzes": formatted_quizzes}

@app.delete("/quiz/{quiz_id}")
def delete_quiz_api(quiz_id: int, user=Depends(require_teacher)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM quizzes WHERE id = ? AND teacher_id = ?", (quiz_id, user["id"]))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    if not deleted: raise HTTPException(status_code=404, detail="Quiz not found or unauthorized.")
    return {"message": "Quiz deleted successfully"}

@app.get("/teacher/overview")
def get_teacher_overview(user=Depends(require_teacher)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(id) as count FROM quizzes WHERE teacher_id = ?", (user["id"],))
    total_quizzes = cursor.fetchone()["count"]
    cursor.execute("SELECT COUNT(id) as count FROM classrooms WHERE teacher_id = ?", (user["id"],))
    total_classes = cursor.fetchone()["count"]
    cursor.execute('''
        SELECT COUNT(a.id) as attempt_count, 
               AVG(CAST(json_extract(a.results, '$.total_score') AS REAL) / 
                   CAST(json_extract(a.results, '$.max_score') AS REAL)) * 100 as avg_score
        FROM attempts a
        JOIN quizzes q ON a.quiz_id = q.id
        WHERE q.teacher_id = ? AND json_extract(a.results, '$.max_score') > 0
    ''', (user["id"],))
    stats = cursor.fetchone()
    total_attempts = stats["attempt_count"] if stats["attempt_count"] else 0
    avg_score = round(stats["avg_score"] or 0, 1)
    conn.close()
    return {
        "total_quizzes": total_quizzes,
        "total_classes": total_classes,
        "total_attempts": total_attempts,
        "avg_score": avg_score
    }


@app.post("/quiz/explain-question")
async def explain_question_api(req: ExplainQuestionRequest):
    """Provides instant AI Mentor pedagogical explanations for any question and candidate answer."""
    from grading_engine import explain_question_with_ai
    result = await run_in_threadpool(
        explain_question_with_ai,
        question=req.question,
        question_type=req.question_type,
        student_answer=req.student_answer or "",
        correct_answer=req.correct_answer or "",
        explanation=req.explanation or ""
    )
    return result

@app.get("/teacher/analytics/detailed")
def get_detailed_teacher_analytics_api(quiz_id: Optional[int] = None, user=Depends(require_teacher)):
    """Computes comprehensive class performance, question difficulty heatmap, and at-risk students."""
    return database.get_teacher_detailed_analytics(user["id"], quiz_id=quiz_id)

@app.get("/teacher/attempt/{attempt_id}")
def get_attempt_detail_for_teacher_api(attempt_id: int, user=Depends(require_teacher)):
    """Allows teachers to inspect the full evaluation of any specific student attempt."""
    detail = database.get_attempt_detail(attempt_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Attempt submission not found.")
    quiz = database.get_quiz(detail["quiz_id"])
    if not quiz or quiz["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Unauthorized access to this attempt.")
    return {"attempt": detail, "exam_metadata": quiz["exam_metadata"]}


# ==========================================
# 📊 TEACHER CLASS ANALYTICS EXPORT ENGINE (DOCX & PDF)
# ==========================================
def build_analytics_docx(analytics_data: dict, institution: str, teacher_name: str, quiz_title: str) -> io.BytesIO:
    """Generates an executive-grade Word (.docx) Class Performance Analytics & Gradebook Report."""
    doc = Document()
    for section in doc.sections:
        section.top_margin = Inches(0.6)
        section.bottom_margin = Inches(0.6)
        section.left_margin = Inches(0.6)
        section.right_margin = Inches(0.6)

    # 1. Header
    p_inst = doc.add_paragraph()
    p_inst.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_inst = p_inst.add_run(institution.upper())
    r_inst.bold = True
    r_inst.font.size = Pt(14)
    r_inst.font.color.rgb = RGBColor(30, 58, 138)

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_title = p_title.add_run("CLASS PERFORMANCE ANALYTICS & GRADEBOOK REPORT")
    r_title.bold = True
    r_title.font.size = Pt(12)
    r_title.font.color.rgb = RGBColor(15, 23, 42)

    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_meta = p_meta.add_run(f"Instructor: {teacher_name}  |  Assessment Scope: {quiz_title}  |  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    r_meta.font.size = Pt(9)
    r_meta.font.color.rgb = RGBColor(100, 116, 139)

    doc.add_paragraph()  # spacer

    # 2. Executive KPIs
    ov = analytics_data.get("overview", {})
    p_kpi = doc.add_paragraph()
    r_kpi_head = p_kpi.add_run("1. EXECUTIVE SUMMARY & CLASS PERFORMANCE KPIS")
    r_kpi_head.bold = True
    r_kpi_head.font.size = Pt(11)
    r_kpi_head.font.color.rgb = RGBColor(30, 58, 138)

    table_kpi = doc.add_table(rows=2, cols=4)
    table_kpi.autofit = True
    kpi_headers = ["Total Submissions", "Class Average", "Pass Rate", "Score Range"]
    kpi_vals = [
        str(ov.get("total_attempts", 0)),
        f"{ov.get('avg_score', 0)}%",
        f"{ov.get('pass_rate', 0)}%",
        f"{ov.get('lowest_score', 0)}% - {ov.get('highest_score', 0)}%"
    ]
    for c_idx, head in enumerate(kpi_headers):
        cell = table_kpi.cell(0, c_idx)
        set_docx_cell_shading(cell, "EFF6FF")
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(head)
        r.bold = True
        r.font.size = Pt(9)
        r.font.color.rgb = RGBColor(30, 58, 138)

        v_cell = table_kpi.cell(1, c_idx)
        set_docx_cell_shading(v_cell, "F8FAFC")
        vp = v_cell.paragraphs[0]
        vp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        vr = vp.add_run(kpi_vals[c_idx])
        vr.bold = True
        vr.font.size = Pt(12)
        vr.font.color.rgb = RGBColor(15, 23, 42)

    doc.add_paragraph()

    # 3. Score Distribution
    p_dist = doc.add_paragraph()
    r_dist = p_dist.add_run("2. SCORE DISTRIBUTION BREAKDOWN")
    r_dist.bold = True
    r_dist.font.size = Pt(11)
    r_dist.font.color.rgb = RGBColor(30, 58, 138)

    dist = analytics_data.get("score_distribution", {})
    tot = max(1, ov.get("total_attempts", 1))
    dist_table = doc.add_table(rows=5, cols=3)
    dist_table.autofit = True
    headers = ["Mastery Tier", "Student Count", "Class Percentage"]
    for i, h in enumerate(headers):
        cell = dist_table.cell(0, i)
        set_docx_cell_shading(cell, "F1F5F9")
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if i == 0 else WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(h)
        r.bold = True
        r.font.size = Pt(9)

    tiers = [
        ("Mastery (90% - 100%)", dist.get("mastery", 0), f"{round(dist.get('mastery', 0)/tot*100, 1)}%"),
        ("Proficient (75% - 89%)", dist.get("proficient", 0), f"{round(dist.get('proficient', 0)/tot*100, 1)}%"),
        ("Passing (50% - 74%)", dist.get("passing", 0), f"{round(dist.get('passing', 0)/tot*100, 1)}%"),
        ("Needs Attention (< 50%)", dist.get("needs_help", 0), f"{round(dist.get('needs_help', 0)/tot*100, 1)}%")
    ]
    for row_idx, (t_name, count, pct) in enumerate(tiers, start=1):
        c0 = dist_table.cell(row_idx, 0)
        c0.paragraphs[0].add_run(t_name).font.size = Pt(9)
        c1 = dist_table.cell(row_idx, 1)
        p1 = c1.paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p1.add_run(str(count)).font.size = Pt(9)
        c2 = dist_table.cell(row_idx, 2)
        p2 = c2.paragraphs[0]
        p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p2.add_run(pct).font.size = Pt(9)

    doc.add_paragraph()

    # 4. At-Risk Students Early Warning
    at_risk = analytics_data.get("at_risk_students", [])
    if at_risk:
        p_risk = doc.add_paragraph()
        r_risk = p_risk.add_run("3. AT-RISK STUDENTS EARLY WARNING (< 50%)")
        r_risk.bold = True
        r_risk.font.size = Pt(11)
        r_risk.font.color.rgb = RGBColor(190, 18, 60)

        risk_table = doc.add_table(rows=len(at_risk) + 1, cols=5)
        risk_table.autofit = True
        r_heads = ["Student Name", "Assessment", "Score", "Percentage", "Intervention Status"]
        for i, h in enumerate(r_heads):
            cell = risk_table.cell(0, i)
            set_docx_cell_shading(cell, "FFF1F2")
            p = cell.paragraphs[0]
            r = p.add_run(h)
            r.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(190, 18, 60)
        for row_idx, st in enumerate(at_risk, start=1):
            risk_table.cell(row_idx, 0).paragraphs[0].add_run(st.get("student_name", "")).font.size = Pt(9)
            risk_table.cell(row_idx, 1).paragraphs[0].add_run(st.get("quiz_title", "")).font.size = Pt(9)
            risk_table.cell(row_idx, 2).paragraphs[0].add_run(f"{st.get('total_score',0)}/{st.get('max_score',0)}").font.size = Pt(9)
            p_p = risk_table.cell(row_idx, 3).paragraphs[0]
            p_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_p.add_run(f"{st.get('score_percent', 0)}%").font.size = Pt(9)
            risk_table.cell(row_idx, 4).paragraphs[0].add_run("Needs Remedial Review").font.size = Pt(9)
        doc.add_paragraph()

    # 5. Hardest Questions Heatmap
    hq = analytics_data.get("hardest_questions", [])
    if hq:
        p_hq = doc.add_paragraph()
        r_hq = p_hq.add_run("4. QUESTION DIFFICULTY & CONCEPT GAP HEATMAP")
        r_hq.bold = True
        r_hq.font.size = Pt(11)
        r_hq.font.color.rgb = RGBColor(180, 83, 9)

        hq_table = doc.add_table(rows=len(hq) + 1, cols=4)
        hq_table.autofit = True
        hq_heads = ["Question Description", "Type", "Error Rate", "Missed / Total"]
        for i, h in enumerate(hq_heads):
            cell = hq_table.cell(0, i)
            set_docx_cell_shading(cell, "FFFBEB")
            p = cell.paragraphs[0]
            r = p.add_run(h)
            r.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(180, 83, 9)
        for row_idx, q in enumerate(hq, start=1):
            q_desc = q.get("question", "")
            if len(q_desc) > 85:
                q_desc = q_desc[:85] + "..."
            hq_table.cell(row_idx, 0).paragraphs[0].add_run(q_desc).font.size = Pt(8.5)
            hq_table.cell(row_idx, 1).paragraphs[0].add_run(q.get("type", "")).font.size = Pt(8.5)
            p_err = hq_table.cell(row_idx, 2).paragraphs[0]
            p_err.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_err.add_run(f"{q.get('error_rate', 0)}%").font.size = Pt(8.5)
            p_tot = hq_table.cell(row_idx, 3).paragraphs[0]
            p_tot.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_tot.add_run(f"{q.get('incorrect_count', 0)} / {q.get('total_attempts', 0)}").font.size = Pt(8.5)
        doc.add_paragraph()

    # 6. Student Gradebook Roster
    attempts = analytics_data.get("recent_attempts", [])
    if attempts:
        p_gb = doc.add_paragraph()
        r_gb = p_gb.add_run("5. COMPLETE STUDENT GRADEBOOK ROSTER")
        r_gb.bold = True
        r_gb.font.size = Pt(11)
        r_gb.font.color.rgb = RGBColor(30, 58, 138)

        gb_table = doc.add_table(rows=len(attempts) + 1, cols=6)
        gb_table.autofit = True
        gb_heads = ["#", "Student Name", "Assessment Title", "Score", "Percentage", "Date"]
        for i, h in enumerate(gb_heads):
            cell = gb_table.cell(0, i)
            set_docx_cell_shading(cell, "EFF6FF")
            p = cell.paragraphs[0]
            r = p.add_run(h)
            r.bold = True
            r.font.size = Pt(9)
            r.font.color.rgb = RGBColor(30, 58, 138)
        for row_idx, a in enumerate(attempts, start=1):
            gb_table.cell(row_idx, 0).paragraphs[0].add_run(str(row_idx)).font.size = Pt(8.5)
            gb_table.cell(row_idx, 1).paragraphs[0].add_run(a.get("student_name", "")).font.size = Pt(8.5)
            gb_table.cell(row_idx, 2).paragraphs[0].add_run(a.get("quiz_title", "")).font.size = Pt(8.5)
            p_s = gb_table.cell(row_idx, 3).paragraphs[0]
            p_s.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_s.add_run(f"{a.get('total_score',0)} / {a.get('max_score',0)}").font.size = Pt(8.5)
            p_pct = gb_table.cell(row_idx, 4).paragraphs[0]
            p_pct.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_pct.add_run(f"{a.get('score_percent',0)}%").font.size = Pt(8.5)
            p_d = gb_table.cell(row_idx, 5).paragraphs[0]
            p_d.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_d.add_run(f"{a.get('date', '')}").font.size = Pt(8.5)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)
    return buffer


def build_analytics_pdf(analytics_data: dict, institution: str, teacher_name: str, quiz_title: str) -> io.BytesIO:
    """Generates a professional PDF Class Performance Analytics & Gradebook Report via ReportLab."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=36, leftMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=18,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1E3A8A')
    )
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#0F172A')
    )
    meta_style = ParagraphStyle(
        'DocMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=11,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#64748B')
    )
    sec_style = ParagraphStyle(
        'SecHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10.5,
        leading=14,
        textColor=colors.HexColor('#1E3A8A')
    )
    cell_style = ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=10
    )
    cell_center = ParagraphStyle(
        'CellCenter',
        parent=cell_style,
        alignment=TA_CENTER
    )
    cell_bold_center = ParagraphStyle(
        'CellBoldCenter',
        parent=cell_style,
        fontName='Helvetica-Bold',
        alignment=TA_CENTER
    )

    story = []
    story.append(Paragraph(institution.upper(), title_style))
    story.append(Spacer(1, 3))
    story.append(Paragraph("CLASS PERFORMANCE ANALYTICS & GRADEBOOK REPORT", subtitle_style))
    story.append(Spacer(1, 3))
    story.append(Paragraph(f"Instructor: {teacher_name}  |  Assessment Scope: {quiz_title}  |  Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", meta_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#CBD5E1"), spaceAfter=10))

    # 1. KPIs
    ov = analytics_data.get("overview", {})
    story.append(Paragraph("1. EXECUTIVE SUMMARY & CLASS PERFORMANCE KPIS", sec_style))
    story.append(Spacer(1, 6))

    kpi_data = [
        [
            Paragraph("<b>Total Submissions</b>", cell_bold_center),
            Paragraph("<b>Class Average</b>", cell_bold_center),
            Paragraph("<b>Pass Rate</b>", cell_bold_center),
            Paragraph("<b>Score Range</b>", cell_bold_center)
        ],
        [
            Paragraph(f"<font size=12><b>{ov.get('total_attempts', 0)}</b></font>", cell_center),
            Paragraph(f"<font size=12 color='#2563EB'><b>{ov.get('avg_score', 0)}%</b></font>", cell_center),
            Paragraph(f"<font size=12 color='#16A34A'><b>{ov.get('pass_rate', 0)}%</b></font>", cell_center),
            Paragraph(f"<font size=10><b>{ov.get('lowest_score', 0)}% - {ov.get('highest_score', 0)}%</b></font>", cell_center)
        ]
    ]
    t_kpi = Table(kpi_data, colWidths=[135, 135, 135, 135])
    t_kpi.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
        ('BACKGROUND', (0, 1), (-1, 1), colors.HexColor('#F8FAFC')),
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#BFDBFE')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(t_kpi)
    story.append(Spacer(1, 12))

    # 2. Distribution
    dist = analytics_data.get("score_distribution", {})
    tot = max(1, ov.get("total_attempts", 1))
    story.append(Paragraph("2. SCORE DISTRIBUTION BREAKDOWN", sec_style))
    story.append(Spacer(1, 6))
    dist_data = [
        [Paragraph("<b>Performance Tier</b>", cell_style), Paragraph("<b>Student Count</b>", cell_center), Paragraph("<b>Percentage of Class</b>", cell_center)],
        [Paragraph("Mastery (90% - 100%)", cell_style), Paragraph(str(dist.get("mastery", 0)), cell_center), Paragraph(f"{round(dist.get('mastery', 0)/tot*100, 1)}%", cell_center)],
        [Paragraph("Proficient (75% - 89%)", cell_style), Paragraph(str(dist.get("proficient", 0)), cell_center), Paragraph(f"{round(dist.get('proficient', 0)/tot*100, 1)}%", cell_center)],
        [Paragraph("Passing (50% - 74%)", cell_style), Paragraph(str(dist.get("passing", 0)), cell_center), Paragraph(f"{round(dist.get('passing', 0)/tot*100, 1)}%", cell_center)],
        [Paragraph("Needs Attention (< 50%)", cell_style), Paragraph(str(dist.get("needs_help", 0)), cell_center), Paragraph(f"{round(dist.get('needs_help', 0)/tot*100, 1)}%", cell_center)]
    ]
    t_dist = Table(dist_data, colWidths=[240, 150, 150])
    t_dist.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F1F5F9')),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
        ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(t_dist)
    story.append(Spacer(1, 12))

    # 3. At-Risk Students
    at_risk = analytics_data.get("at_risk_students", [])
    if at_risk:
        risk_sec_style = ParagraphStyle('RiskSec', parent=sec_style, textColor=colors.HexColor('#BE123C'))
        story.append(Paragraph("3. AT-RISK STUDENTS EARLY WARNING (< 50%)", risk_sec_style))
        story.append(Spacer(1, 6))
        r_rows = [[
            Paragraph("<b>Student Name</b>", cell_style),
            Paragraph("<b>Assessment Title</b>", cell_style),
            Paragraph("<b>Score</b>", cell_center),
            Paragraph("<b>Percentage</b>", cell_center),
            Paragraph("<b>Intervention Status</b>", cell_center)
        ]]
        for st in at_risk:
            r_rows.append([
                Paragraph(st.get("student_name", ""), cell_style),
                Paragraph(st.get("quiz_title", ""), cell_style),
                Paragraph(f"{st.get('total_score',0)}/{st.get('max_score',0)}", cell_center),
                Paragraph(f"<font color='#BE123C'><b>{st.get('score_percent',0)}%</b></font>", cell_center),
                Paragraph("<font color='#BE123C'>Needs Remedial Review</font>", cell_center)
            ])
        t_risk = Table(r_rows, colWidths=[120, 170, 70, 70, 110])
        t_risk.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFF1F2')),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#FECDD3')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#FFE4E6')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_risk)
        story.append(Spacer(1, 12))

    # 4. Hardest Questions
    hq = analytics_data.get("hardest_questions", [])
    if hq:
        hq_sec_style = ParagraphStyle('HqSec', parent=sec_style, textColor=colors.HexColor('#B45309'))
        story.append(Paragraph("4. QUESTION DIFFICULTY & CONCEPT GAP HEATMAP", hq_sec_style))
        story.append(Spacer(1, 6))
        hq_rows = [[
            Paragraph("<b>Question Description</b>", cell_style),
            Paragraph("<b>Type</b>", cell_center),
            Paragraph("<b>Error Rate</b>", cell_center),
            Paragraph("<b>Missed / Total</b>", cell_center)
        ]]
        for q in hq:
            desc = q.get("question", "")
            if len(desc) > 85:
                desc = desc[:85] + "..."
            hq_rows.append([
                Paragraph(desc, cell_style),
                Paragraph(q.get("type", ""), cell_center),
                Paragraph(f"<font color='#B45309'><b>{q.get('error_rate',0)}%</b></font>", cell_center),
                Paragraph(f"{q.get('incorrect_count',0)} / {q.get('total_attempts',0)}", cell_center)
            ])
        t_hq = Table(hq_rows, colWidths=[270, 90, 90, 90])
        t_hq.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#FFFBEB')),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#FDE68A')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#FEF3C7')),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        story.append(t_hq)
        story.append(Spacer(1, 12))

    # 5. Student Gradebook Roster
    attempts = analytics_data.get("recent_attempts", [])
    if attempts:
        story.append(Paragraph("5. COMPLETE STUDENT GRADEBOOK ROSTER", sec_style))
        story.append(Spacer(1, 6))
        gb_rows = [[
            Paragraph("<b>#</b>", cell_center),
            Paragraph("<b>Student Name</b>", cell_style),
            Paragraph("<b>Assessment Title</b>", cell_style),
            Paragraph("<b>Score</b>", cell_center),
            Paragraph("<b>Percentage</b>", cell_center),
            Paragraph("<b>Date</b>", cell_center)
        ]]
        for idx, a in enumerate(attempts, start=1):
            gb_rows.append([
                Paragraph(str(idx), cell_center),
                Paragraph(a.get("student_name", ""), cell_style),
                Paragraph(a.get("quiz_title", ""), cell_style),
                Paragraph(f"{a.get('total_score',0)}/{a.get('max_score',0)}", cell_center),
                Paragraph(f"<b>{a.get('score_percent',0)}%</b>", cell_center),
                Paragraph(a.get("date", ""), cell_center)
            ])
        t_gb = Table(gb_rows, colWidths=[30, 130, 190, 60, 60, 70])
        t_gb.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EFF6FF')),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#CBD5E1')),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        story.append(t_gb)

    doc.build(story)
    buffer.seek(0)
    return buffer


@app.get("/teacher/analytics/export/docx")
def export_teacher_analytics_docx(quiz_id: Optional[int] = None, user=Depends(require_teacher)):
    """Exports class performance analytics and student gradebook to a formatted Word (.docx) document."""
    analytics_data = database.get_teacher_detailed_analytics(user["id"], quiz_id=quiz_id)
    branding = database.get_teacher_branding(user["id"])
    inst_name = branding.get("academy_name") if (branding and branding.get("academy_name")) else "Academic Examination Department"
    teacher_name = branding.get("teacher_name") if (branding and branding.get("teacher_name")) else user.get("name", "Instructor")
    quiz_title = "All Assessments Combined"
    if quiz_id:
        quiz = database.get_quiz(quiz_id)
        if quiz and quiz.get("exam_metadata"):
            quiz_title = quiz["exam_metadata"].get("exam_title", f"Quiz #{quiz_id}")

    buffer = build_analytics_docx(analytics_data, inst_name, teacher_name, quiz_title)
    safe_fn = re.sub(r'[^a-zA-Z0-9_-]', '_', f"Analytics_{quiz_title}")[:40]
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename=Class_Analytics_{safe_fn}.docx"}
    )


@app.get("/teacher/analytics/export/pdf")
def export_teacher_analytics_pdf(quiz_id: Optional[int] = None, user=Depends(require_teacher)):
    """Exports class performance analytics and student gradebook to a formatted PDF document."""
    analytics_data = database.get_teacher_detailed_analytics(user["id"], quiz_id=quiz_id)
    branding = database.get_teacher_branding(user["id"])
    inst_name = branding.get("academy_name") if (branding and branding.get("academy_name")) else "Academic Examination Department"
    teacher_name = branding.get("teacher_name") if (branding and branding.get("teacher_name")) else user.get("name", "Instructor")
    quiz_title = "All Assessments Combined"
    if quiz_id:
        quiz = database.get_quiz(quiz_id)
        if quiz and quiz.get("exam_metadata"):
            quiz_title = quiz["exam_metadata"].get("exam_title", f"Quiz #{quiz_id}")

    buffer = build_analytics_pdf(analytics_data, inst_name, teacher_name, quiz_title)
    safe_fn = re.sub(r'[^a-zA-Z0-9_-]', '_', f"Analytics_{quiz_title}")[:40]
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=Class_Analytics_{safe_fn}.pdf"}
    )


# ==========================================
# 📚 QUESTION BANK COMPILER (ASSEMBLE QUIZ FROM BOOKMARKS)
# ==========================================
class CompileFromBankRequest(BaseModel):
    title: str = "Assembled Question Bank Exam"
    subject: str = "General Subject"
    class_name: str = ""
    academic_tier: str = "University"
    paper_type: str = "exam"
    language: str = "English"
    bookmark_ids: List[int]


@app.post("/teacher/quiz/compile-from-bank")
def compile_quiz_from_bank(req: CompileFromBankRequest, user=Depends(require_teacher)):
    """Assembles a new examination quiz directly from selected Question Bank bookmarks."""
    if not req.bookmark_ids:
        raise HTTPException(status_code=400, detail="Please select at least one question from your Question Bank.")

    conn = database.get_db_connection()
    cursor = conn.cursor()
    placeholders = ",".join("?" for _ in req.bookmark_ids)
    cursor.execute(
        f"SELECT * FROM bookmarked_questions WHERE user_id = ? AND id IN ({placeholders})",
        [user["id"]] + req.bookmark_ids
    )
    rows = cursor.fetchall()
    conn.close()

    if not rows:
        raise HTTPException(status_code=404, detail="No matching bookmarks found in your question bank.")

    mcqs = []
    blanks = []
    shorts = []
    longs = []

    for r in rows:
        try:
            q_data = json.loads(r["question_data"])
        except Exception:
            continue
        q_type = r["question_type"]
        if q_type == "mcq":
            mcqs.append(q_data)
        elif q_type == "fill_blank":
            blanks.append(q_data)
        elif q_type == "short_answer":
            shorts.append(q_data)
        elif q_type == "long_answer":
            longs.append(q_data)

    quiz_data = {
        "mcq_questions": mcqs,
        "fill_blank_questions": blanks,
        "short_questions": shorts,
        "long_questions": longs,
        "language": req.language
    }

    # Compute accurate total marks
    calc_marks = (len(mcqs) * 1) + (len(blanks) * 1) + (len(shorts) * 2)
    for lq in longs:
        calc_marks += lq.get("marks", 6)
    if calc_marks <= 0:
        calc_marks = 20

    duration = (len(mcqs) * 1) + (len(blanks) * 1) + (len(shorts) * 3) + (len(longs) * 8)
    duration = max(15, duration)

    branding = database.get_teacher_branding(user["id"])
    inst_name = branding.get("academy_name") if (branding and branding.get("academy_name")) else "Academic Examination Department"

    exam_metadata = {
        "institution_name": inst_name,
        "department": "Examination Branch",
        "subject": req.subject.strip() or "General Subject",
        "class_name": req.class_name.strip(),
        "teacher_name": branding.get("teacher_name") if (branding and branding.get("teacher_name")) else user["name"],
        "exam_title": req.title.strip() or "Assembled Question Bank Exam",
        "course_code": "",
        "paper_type": req.paper_type,
        "quiz_number": "01",
        "duration_minutes": duration,
        "total_marks": calc_marks,
        "academic_tier": req.academic_tier,
        "exam_track": "Standard",
        "exam_category": "THEORY",
        "question_style": "Auto",
        "include_comprehension": False,
        "is_self_study": False,
        "language": req.language
    }

    quiz_id = database.create_quiz(user["id"], exam_metadata, quiz_data)
    return {"quiz_id": quiz_id, "message": "Quiz compiled successfully from Question Bank!"}
