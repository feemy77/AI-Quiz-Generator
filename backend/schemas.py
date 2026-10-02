"""
Pydantic schemas and request models for AI Quiz Generator API.
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, Dict, List, Any

class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class FirebaseLoginRequest(BaseModel):
    id_token: Optional[str] = None
    email: EmailStr
    name: Optional[str] = "User"
    role: Optional[str] = "student"

class ResetPasswordRequest(BaseModel):
    email: EmailStr
    new_password: str

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

class CompileFromBankRequest(BaseModel):
    bookmark_ids: List[int]
    title: Optional[str] = "Compiled Exam from Question Bank"
    exam_category: Optional[str] = "THEORY"
    academic_tier: Optional[str] = "University"
    time_limit_mins: Optional[int] = 30
