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
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Image as RLImage, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.utils import ImageReader
from reportlab.lib import colors

# NOTE FOR WINDOWS: Point pytesseract to the installed executable
#pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

# Existing modules (UNTOUCHED)
import database
import auth
from document_extractor import get_document_page_count, extract_text_from_document
from youtube_extractor import get_youtube_transcript
import quiz_generator
from quiz_generator import generate_quiz_from_large_text
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

# --- AUTH ENDPOINTS ---
@app.post("/auth/register")
def register(req: RegisterRequest):
    if database.get_user_by_email(req.email):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    password_hash, salt = auth.hash_password(req.password)
    user_id = database.create_user(req.name, req.email, password_hash, salt, "unassigned", "")
    token = auth.generate_token()
    database.create_session(token, user_id)
    return {"token": token, "user_id": user_id, "role": "unassigned", "name": req.name}

@app.post("/auth/login")
def login(req: LoginRequest):
    user = database.get_user_by_email(req.email)
    if not user or not auth.verify_password(req.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = auth.generate_token()
    database.create_session(token, user["id"])
    return {"token": token, "user_id": user["id"], "role": user["role"], "name": user["name"]}

@app.post("/auth/update-profile")
def update_profile(req: UpdateProfileRequest, user=Depends(get_current_user)):
    database.update_user_profile(user["id"], req.role, req.institution_name)
    return {"message": "Profile updated successfully", "role": req.role}

@app.post("/auth/switch-role")
def switch_role(req: SwitchRoleRequest, user=Depends(get_current_user)):
    if req.new_role not in ["student", "teacher"]:
        raise HTTPException(status_code=400, detail="Role must be either 'student' or 'teacher'")
    database.update_user_role(user["id"], req.new_role)
    return {"ok": True, "role": req.new_role, "message": f"Switched to {req.new_role} mode"}

@app.post("/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        auth_token = authorization.removeprefix("Bearer ").strip()
        database.delete_session(auth_token)
    return {"ok": True}

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
        short_ans=num_short, long_ans=num_long, difficulty=difficulty, question_style=f"{effective_style}_{include_comprehension}"
    )

    quiz_data = get_cached_quiz(req_hash)
    if not quiz_data:
        # 🧠 Pass effective_style down to the generator, running in threadpool to prevent blocking the event loop
        quiz_data = await run_in_threadpool(
            generate_quiz_from_large_text,
            raw_text, question_counts, difficulty, question_style=effective_style, include_comprehension=include_comprehension
        )
        save_quiz_to_cache(req_hash, quiz_data)

    calculated_marks = (num_mcq * 1) + (num_fill_blank * 1) + (num_short * 2) + (num_long * 5)
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
        m_val = q.get("marks", 5)
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
        if q.get("marks"):
            marks_str = f"({q['marks']:02d})"
        else:
            marks_str = "(1 + 2 + 2 + 3 + 2)" if (exam_category == "PRACTICAL" or (lq_idx == 0 and len(quiz_data.get("long_questions", [])) == 1)) else f"({8 - (lq_idx * 2):02d})"
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
        m_val = q.get("marks", 5)
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
        if q.get("marks"):
            marks_str = f"({q['marks']:02d})"
        else:
            marks_str = "(1 + 2 + 2 + 3 + 2)" if (exam_category == "PRACTICAL" or (lq_idx == 0 and len(quiz_data.get("long_questions", [])) == 1)) else f"({8 - (lq_idx * 2):02d})"
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

    for i, q in enumerate(quiz_data.get("short_questions", [])):
        student_ans = answers.get(f"short_{i}", "")
        grade = grade_long_answer(q["question_text"], q["correct_answer"], [], student_ans)
        results["short"].append({"question": q["question_text"], "student_answer": student_ans, "model_answer": q["correct_answer"], "score_percent": grade["score_percent"], "feedback": grade["feedback"]})
        results["max_score"] += 2
        results["total_score"] += (grade["score_percent"] / 100) * 2

    for i, q in enumerate(quiz_data.get("long_questions", [])):
        student_ans = answers.get(f"long_{i}", "")
        grade = grade_long_answer(q["question_text"], q["model_answer"], q.get("key_points", []), student_ans)
        results["long"].append({"question": q["question_text"], "student_answer": student_ans, "model_answer": q["model_answer"], "score_percent": grade["score_percent"], "feedback": grade["feedback"]})
        results["max_score"] += 5
        results["total_score"] += (grade["score_percent"] / 100) * 5

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

@app.post("/challenge/create")
def create_challenge(req: ChallengeCreateRequest, user=Depends(get_current_user)):
    quiz = database.get_quiz(req.quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    challenge_id = database.create_challenge(user["id"], req.quiz_id, code)
    return {"challenge_id": challenge_id, "code": code, "share_text": f"Join using code: {code}"}

@app.get("/challenge/{code}")
def get_challenge(code: str, request: Request):
    challenge = database.get_challenge_by_code(code.upper())
    if not challenge: raise HTTPException(status_code=404, detail="Invalid Challenge Code.")
    return get_quiz_for_student(challenge["quiz_id"], request)

@app.get("/challenge/{code}/leaderboard")
def get_challenge_leaderboard(code: str):
    challenge = database.get_challenge_by_code(code.upper())
    if not challenge: raise HTTPException(status_code=404, detail="Invalid Challenge.")
    return {"code": code, "leaderboard": database.get_challenge_leaderboard(challenge["id"])}

@app.get("/user/dashboard")
def get_student_dashboard(user=Depends(get_current_user)):
    return database.get_user_gamification(user["id"])

@app.post("/quiz/{quiz_id}/flashcards")
def create_flashcards(quiz_id: int, user=Depends(get_current_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz: raise HTTPException(status_code=404, detail="Quiz not found.")
    for q in quiz.get("quiz_data", {}).get("mcq_questions", []):
        database.create_flashcard(quiz_id, user["id"], front=q["question_text"], back=q["correct_answer"], q_type="mcq")
    for q in quiz.get("quiz_data", {}).get("short_questions", []):
        database.create_flashcard(quiz_id, user["id"], front=q["question_text"], back=q["correct_answer"], q_type="short")
    return {"message": "Flashcards generated."}

@app.get("/flashcards/due")
def get_due_flashcards(user=Depends(get_current_user)):
    due_cards = database.get_due_flashcards(user["id"])
    return {"due_count": len(due_cards), "flashcards": due_cards}

@app.post("/flashcards/review")
def review_flashcard(req: FlashcardReviewRequest, user=Depends(get_current_user)):
    database.update_flashcard_sm2(user["id"], req.flashcard_id, req.quality)
    return {"message": "Review recorded."}

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

@app.post("/teacher/classrooms")
def create_classroom_api(req: CreateClassroomRequest, user=Depends(require_teacher)):
    join_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=7))
    class_id = database.create_classroom(user["id"], req.name, join_code)
    return {
        "message": "Classroom created successfully", 
        "class_id": class_id, 
        "join_code": join_code,
        "name": req.name
    }

@app.get("/teacher/classrooms")
def get_classrooms_api(user=Depends(require_teacher)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT c.id, c.name, c.join_code, c.created_at, 
               (SELECT COUNT(id) FROM classroom_students WHERE classroom_id = c.id) as student_count
        FROM classrooms c
        WHERE c.teacher_id = ?
        ORDER BY c.created_at DESC
    ''', (user["id"],))
    classes = [dict(row) for row in cursor.fetchall()]
    conn.close()
    for cl in classes:
        cl["assignments"] = database.get_classroom_assignments(cl["id"])
    return {"classes": classes}

@app.post("/student/classrooms/join")
def join_classroom_api(req: JoinClassroomRequest, user=Depends(get_current_user)):
    if user["role"] == "teacher":
        raise HTTPException(status_code=400, detail="Teachers cannot join classes as students.")
    result = database.join_classroom(user["id"], req.join_code.upper())
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"message": "Successfully joined the classroom!", "classroom_id": result["classroom_id"]}

@app.post("/teacher/classrooms/{class_id}/assign")
def assign_quiz_to_classroom_api(class_id: int, req: AssignQuizRequest, user=Depends(require_teacher)):
    """Teacher assigns a quiz to a classroom with an optional due date."""
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM classrooms WHERE id = ? AND teacher_id = ?", (class_id, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Classroom not found or unauthorized.")
    
    cursor.execute("SELECT id FROM quizzes WHERE id = ? AND teacher_id = ?", (req.quiz_id, user["id"]))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Quiz not found or unauthorized.")
    conn.close()

    assignment_id = database.create_assignment(class_id, req.quiz_id, req.due_date or "")
    return {"message": "Quiz assigned successfully!", "assignment_id": assignment_id}

@app.get("/teacher/classrooms/{class_id}/assignments")
def get_classroom_assignments_api(class_id: int, user=Depends(require_teacher)):
    """Fetches all assignments for a specific classroom with submission counts."""
    assignments = database.get_classroom_assignments(class_id)
    return {"assignments": assignments}

@app.get("/teacher/assignments/{assignment_id}/submissions")
def get_assignment_submissions_api(assignment_id: int, user=Depends(require_teacher)):
    """Teacher fetches all student submissions, marks, and answers for a specific classroom assignment."""
    data = database.get_assignment_submissions_for_teacher(assignment_id, user["id"])
    if not data:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized.")
    return data

@app.get("/student/classrooms")
def get_student_classrooms_api(user=Depends(get_current_user)):
    """Returns classrooms joined by the student, along with all active assignments."""
    classes = database.get_student_classrooms_and_assignments(user["id"])
    return {"classrooms": classes}

@app.get("/student/attempts")
def get_student_attempts_api(user=Depends(get_current_user)):
    """Returns historical quiz attempts and scores for the logged in student."""
    attempts = database.get_student_attempts(user_id=user["id"], student_name=user["name"])
    return {"attempts": attempts}

@app.get("/teacher/analytics/recent-attempts")
def get_recent_attempts_api(user=Depends(require_teacher)):
    conn = database.get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT a.id, a.student_name, a.created_at, q.exam_metadata, a.results
        FROM attempts a
        JOIN quizzes q ON a.quiz_id = q.id
        WHERE q.teacher_id = ?
        ORDER BY a.id DESC
        LIMIT 15
    ''', (user["id"],))
    attempts = []
    for row in cursor.fetchall():
        meta = json.loads(row["exam_metadata"])
        res = json.loads(row["results"])
        max_score = res.get("max_score", 0)
        score = res.get("total_score", 0)
        score_pct = round((score / max_score) * 100, 1) if max_score > 0 else 0
        attempts.append({
            "id": row["id"],
            "student_name": row["student_name"],
            "quiz_title": meta.get("exam_title", "Untitled Quiz"),
            "score_percent": score_pct,
            "date": row["created_at"].split(" ")[0]
        })
    conn.close()
    return {"attempts": attempts}

@app.get("/teacher/branding")
def get_branding_api(user=Depends(require_teacher)):
    branding = database.get_teacher_branding(user["id"])
    return branding or {"academy_name": "", "logo_path": ""}

@app.post("/teacher/branding")
def update_branding_api(req: BrandingRequest, user=Depends(require_teacher)):
    database.update_teacher_branding(user["id"], req.academy_name, req.logo_path)
    return {"message": "Academy branding updated successfully!"}