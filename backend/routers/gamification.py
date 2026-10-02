"""
Gamification router: Peer Challenges, Spaced-Repetition Flashcards, and Student Streaks/Badges.
"""
import random
import string
from fastapi import APIRouter, HTTPException, Depends, Request
import database
from schemas import ChallengeCreateRequest, FlashcardReviewRequest
from dependencies import get_current_user

router = APIRouter(tags=["Gamification & Flashcards"])

@router.post("/challenge/create")
def create_challenge(req: ChallengeCreateRequest, user=Depends(get_current_user)):
    quiz = database.get_quiz(req.quiz_id)
    if not quiz: 
        raise HTTPException(status_code=404, detail="Quiz not found.")
    code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
    challenge_id = database.create_challenge(user["id"], req.quiz_id, code)
    return {"challenge_id": challenge_id, "code": code, "share_text": f"Join using code: {code}"}

@router.get("/challenge/{code}/leaderboard")
def get_challenge_leaderboard(code: str):
    challenge = database.get_challenge_by_code(code.upper())
    if not challenge: 
        raise HTTPException(status_code=404, detail="Invalid Challenge.")
    return {"code": code, "leaderboard": database.get_challenge_leaderboard(challenge["id"])}

@router.get("/user/dashboard")
def get_student_dashboard(user=Depends(get_current_user)):
    return database.get_user_gamification(user["id"])

@router.post("/quiz/{quiz_id}/flashcards")
def create_flashcards(quiz_id: int, user=Depends(get_current_user)):
    quiz = database.get_quiz(quiz_id)
    if not quiz: 
        raise HTTPException(status_code=404, detail="Quiz not found.")
    for q in quiz.get("quiz_data", {}).get("mcq_questions", []):
        database.create_flashcard(quiz_id, user["id"], front=q["question_text"], back=q["correct_answer"], q_type="mcq")
    for q in quiz.get("quiz_data", {}).get("short_questions", []):
        database.create_flashcard(quiz_id, user["id"], front=q["question_text"], back=q["correct_answer"], q_type="short")
    return {"message": "Flashcards generated."}

@router.get("/flashcards/due")
def get_due_flashcards(user=Depends(get_current_user)):
    due_cards = database.get_due_flashcards(user["id"])
    return {"due_count": len(due_cards), "flashcards": due_cards}

@router.post("/flashcards/review")
def review_flashcard(req: FlashcardReviewRequest, user=Depends(get_current_user)):
    database.update_flashcard_sm2(user["id"], req.flashcard_id, req.quality)
    return {"message": "Review recorded."}
