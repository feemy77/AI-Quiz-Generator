"""
Classroom, Assignment, and Branding router for Teachers and Students.
"""
import json
import random
import string
from fastapi import APIRouter, HTTPException, Depends
import database
from schemas import CreateClassroomRequest, JoinClassroomRequest, AssignQuizRequest, BrandingRequest
from dependencies import get_current_user, require_teacher

router = APIRouter(tags=["Classrooms & Assignments"])

@router.post("/teacher/classrooms")
def create_classroom_api(req: CreateClassroomRequest, user=Depends(require_teacher)):
    join_code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=7))
    class_id = database.create_classroom(user["id"], req.name, join_code)
    return {
        "message": "Classroom created successfully", 
        "class_id": class_id, 
        "join_code": join_code,
        "name": req.name
    }

@router.get("/teacher/classrooms")
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

@router.post("/student/classrooms/join")
def join_classroom_api(req: JoinClassroomRequest, user=Depends(get_current_user)):
    if user["role"] == "teacher":
        raise HTTPException(status_code=400, detail="Teachers cannot join classes as students.")
    result = database.join_classroom(user["id"], req.join_code.upper())
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return {"message": "Successfully joined the classroom!", "classroom_id": result["classroom_id"]}

@router.post("/teacher/classrooms/{class_id}/assign")
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

@router.get("/teacher/classrooms/{class_id}/assignments")
def get_classroom_assignments_api(class_id: int, user=Depends(require_teacher)):
    """Fetches all assignments for a specific classroom with submission counts."""
    assignments = database.get_classroom_assignments(class_id)
    return {"assignments": assignments}

@router.get("/teacher/assignments/{assignment_id}/submissions")
def get_assignment_submissions_api(assignment_id: int, user=Depends(require_teacher)):
    """Teacher fetches all student submissions, marks, and answers for a specific classroom assignment."""
    data = database.get_assignment_submissions_for_teacher(assignment_id, user["id"])
    if not data:
        raise HTTPException(status_code=404, detail="Assignment not found or unauthorized.")
    return data

@router.get("/student/classrooms")
def get_student_classrooms_api(user=Depends(get_current_user)):
    """Returns classrooms joined by the student, along with all active assignments."""
    classes = database.get_student_classrooms_and_assignments(user["id"])
    return {"classrooms": classes}

@router.get("/student/attempts")
def get_student_attempts_api(user=Depends(get_current_user)):
    """Returns historical quiz attempts and scores for the logged in student."""
    attempts = database.get_student_attempts(user_id=user["id"], student_name=user["name"])
    return {"attempts": attempts}

@router.get("/teacher/analytics/recent-attempts")
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

@router.get("/teacher/branding")
def get_branding_api(user=Depends(require_teacher)):
    branding = database.get_teacher_branding(user["id"])
    return branding or {"academy_name": "", "logo_path": ""}

@router.post("/teacher/branding")
def update_branding_api(req: BrandingRequest, user=Depends(require_teacher)):
    database.update_teacher_branding(user["id"], req.academy_name, req.logo_path)
    return {"message": "Branding updated successfully!"}
