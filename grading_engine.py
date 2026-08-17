"""
Grading engine for the interactive test-taking mode.

- MCQ and fill-in-the-blank answers are graded with simple, fast, deterministic
  string matching (no API call needed).
- Long-answer questions are graded by asking the LLM to compare the student's
  answer against the model answer + key points, returning a 0-100 score and
  short feedback.
"""

import re
from difflib import SequenceMatcher
from typing import List, Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate

from quiz_generator import llm  # reuse the already-configured Groq LLM


# ==========================================
# 1. Long-answer grading (LLM-based)
# ==========================================
class LongAnswerGrade(BaseModel):
    score_percent: int = Field(description="A score from 0 to 100 for how well the student's answer covers the key points and matches the model answer.")
    feedback: str = Field(description="Short, constructive 1-2 sentence feedback explaining the score.")


_long_answer_grading_llm = llm.with_structured_output(LongAnswerGrade)

_grading_prompt = PromptTemplate(
    template="""
You are grading a student's written exam answer.

Question:
{question_text}

Model Answer (reference):
{model_answer}

Key points a strong answer should cover:
{key_points}

Student's Answer:
{student_answer}

Grade the student's answer from 0 to 100 based on how well it covers the key points and
matches the intent of the model answer. A differently worded but factually correct answer
should still score well — grade on substance, not exact wording. An empty, blank, or
completely irrelevant answer should score close to 0.

Give a short, constructive feedback comment (1-2 sentences) explaining the score.
""",
    input_variables=["question_text", "model_answer", "key_points", "student_answer"],
)

_grading_chain = _grading_prompt | _long_answer_grading_llm


def grade_long_answer(question_text: str, model_answer: str,
                       key_points: List[str], student_answer: str) -> dict:
    """Grades a single long-answer response. Returns {"score_percent": int, "feedback": str}."""
    if not student_answer or not student_answer.strip():
        return {"score_percent": 0, "feedback": "No answer was provided."}

    try:
        result: LongAnswerGrade = _grading_chain.invoke({
            "question_text": question_text,
            "model_answer": model_answer,
            "key_points": "\n".join(f"- {kp}" for kp in key_points) if key_points else "N/A",
            "student_answer": student_answer,
        })
        # Clamp defensively in case the model returns something out of range.
        score = max(0, min(100, result.score_percent))
        return {"score_percent": score, "feedback": result.feedback}
    except Exception as e:
        return {"score_percent": 0, "feedback": f"Automatic grading failed: {str(e)}. Please review manually."}


# ==========================================
# 2. MCQ / Fill-in-the-blank grading (deterministic, no API call)
# ==========================================
def _normalize(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.strip().lower())


def check_mcq(selected_option: Optional[str], correct_answer: str) -> bool:
    """Exact match (case/punctuation-insensitive) between selected option and correct answer."""
    if not selected_option:
        return False
    return _normalize(selected_option) == _normalize(correct_answer)


def check_fill_blank(student_answer: Optional[str], correct_answer: str) -> bool:
    """
    Match student's typed answer against the correct answer.
    Allows minor typos/variation (e.g. plural, small spelling slip) via a
    similarity threshold, since students won't type with perfect precision.
    """
    if not student_answer or not student_answer.strip():
        return False

    a, b = _normalize(student_answer), _normalize(correct_answer)
    if a == b:
        return True

    ratio = SequenceMatcher(None, a, b).ratio()
    return ratio >= 0.85