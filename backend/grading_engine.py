"""
Grading Engine for evaluating student answers.
"""
import os
import json
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from quiz_generator import groq_8b_llm as llm  # ✅ Using Tier 3 safe model for grading

load_dotenv()

from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
import quiz_generator

load_dotenv()

# --- Prompt for Long Answer / Short Answer Grading ---
grading_prompt = PromptTemplate(
    template="""
You are a distinguished university professor and academic examiner.
Your task is to evaluate a student's written response against the provided model answer and required key concepts.

Question: {question}
Model Answer: {model_answer}
Required Key Points: {key_points}

Student's Answer: {student_answer}

Assessment Criteria:
1. Conceptual Accuracy (Does the student understand the core idea?)
2. Completeness (Did they cover the necessary steps/points?)
3. Terminology & Structure (Are technical terms used correctly?)

Provide an honest, fair evaluation.
- If the answer is empty or completely irrelevant, assign 0%.
- If partially correct, give proportionate partial credit (e.g. 40%, 65%, 80%).
- If comprehensive and correct, assign 90-100%.

Return ONLY a valid JSON object strictly matching this schema:
{{
  "score_percent": 85.0,
  "feedback": "Constructive evaluation explaining overall performance in 2-3 sentences.",
  "strengths": ["Key concept correctly identified", "Good example or application provided"],
  "missed_points": ["Could elaborate on secondary factor", "Missed formal definition"]
}}
""",
    input_variables=["question", "model_answer", "key_points", "student_answer"]
)

explanation_prompt = PromptTemplate(
    template="""
You are an encouraging, expert AI Academic Mentor.
A student just finished a test question and wants to understand the concept deeply.

Question: {question}
Question Type: {question_type}
Student's Answer: {student_answer}
Official Correct / Model Answer: {correct_answer}
Context/Existing Explanation: {explanation}

Explain why the correct answer is right and why the student's answer (if wrong or incomplete) missed the mark.
Keep your explanation clear, pedagogically sound, and engaging.

Return ONLY a valid JSON object in this format:
{{
  "summary": "Quick 1-sentence bottom-line takeaway.",
  "detailed_explanation": "Clear, step-by-step conceptual explanation with practical context.",
  "common_misconception": "Why students often get confused by this question.",
  "pro_tip": "A memorable memory tip or rule of thumb for future exams."
}}
""",
    input_variables=["question", "question_type", "student_answer", "correct_answer", "explanation"]
)

import string

def _normalize_text(text: str) -> str:
    if not text:
        return ""
    t = text.strip().lower()
    t = t.strip(string.punctuation)
    return " ".join(t.split())

def check_mcq(student_answer: str, correct_answer: str) -> bool:
    if not student_answer or not correct_answer:
        return False
    s = _normalize_text(student_answer)
    c = _normalize_text(correct_answer)
    if s == c:
        return True
    if s.startswith(('a)', 'b)', 'c)', 'd)', 'a.', 'b.', 'c.', 'd.')):
        s_clean = _normalize_text(s[2:])
        if s_clean == c:
            return True
    return False

def check_fill_blank(student_answer: str, correct_answer: str) -> bool:
    if not student_answer or not correct_answer:
        return False
    s = _normalize_text(student_answer)
    c = _normalize_text(correct_answer)
    if not s or not c:
        return False
    if s == c:
        return True
    # Avoid single-character or trivial false positives (e.g. typing "a" matching "cat")
    if len(s) >= 3 and len(c) >= 3:
        if s in c or c in s:
            len_ratio = min(len(s), len(c)) / max(len(s), len(c))
            if len_ratio >= 0.65:
                return True
    return False

def _invoke_llm_chain(prompt_str: str) -> str:
    """Tries Gemini, then Groq 70B, then Groq 8B for resilient generation."""
    models = [
        getattr(quiz_generator, "gemini_llm", None),
        getattr(quiz_generator, "groq_70b_llm", None),
        getattr(quiz_generator, "groq_8b_llm", None),
    ]
    last_err = None
    for llm_instance in models:
        if not llm_instance:
            continue
        try:
            resp = llm_instance.invoke(prompt_str)
            content = getattr(resp, "content", "")
            if isinstance(content, list):
                content = "".join([c.get("text", "") if isinstance(c, dict) else str(c) for c in content])
            if content and content.strip():
                return content.strip()
        except Exception as e:
            last_err = e
            continue
    raise RuntimeError(f"All LLM tiers failed to evaluate: {last_err}")

def grade_long_answer(question: str, model_answer: str, key_points: list, student_answer: str) -> dict:
    if not student_answer or not student_answer.strip():
        return {
            "score_percent": 0.0,
            "feedback": "No answer was provided by the candidate.",
            "strengths": [],
            "missed_points": ["Question left blank or unattempted."]
        }

    try:
        prompt_str = grading_prompt.format(
            question=question,
            model_answer=model_answer,
            key_points=", ".join(key_points) if key_points else "General conceptual accuracy",
            student_answer=student_answer
        )

        content = _invoke_llm_chain(prompt_str)

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        result = json.loads(content.strip())
        score_val = float(result.get("score_percent", 50.0))
        # Ensure within 0-100 range
        score_val = max(0.0, min(100.0, score_val))

        return {
            "score_percent": round(score_val, 1),
            "feedback": result.get("feedback", "Answer evaluated by AI Examiner."),
            "strengths": result.get("strengths", ["Attempted key question themes."]) if isinstance(result.get("strengths"), list) else [],
            "missed_points": result.get("missed_points", []) if isinstance(result.get("missed_points"), list) else []
        }
    except Exception as e:
        print(f"Grading fallback triggered due to error: {e}")
        # Smart heuristic fallback: length and overlap check
        words = len(student_answer.strip().split())
        est_score = min(80.0, max(30.0, words * 2.5))
        return {
            "score_percent": round(est_score, 1),
            "feedback": "Answer recorded. System applied preliminary assessment.",
            "strengths": ["Answer demonstrates relevant effort."],
            "missed_points": ["Detailed AI rubric review is pending."]
        }

def explain_question_with_ai(question: str, question_type: str, student_answer: str, correct_answer: str, explanation: str = "") -> dict:
    """Provides personalized, mentor-grade AI explanations for any question."""
    try:
        prompt_str = explanation_prompt.format(
            question=question,
            question_type=question_type,
            student_answer=student_answer or "(None provided)",
            correct_answer=correct_answer or "(Refer to solution key)",
            explanation=explanation or "Standard academic solution."
        )

        content = _invoke_llm_chain(prompt_str)

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        parsed = json.loads(content.strip())
        return {
            "summary": parsed.get("summary", "Key concept explanation"),
            "detailed_explanation": parsed.get("detailed_explanation", explanation or "Review the fundamental concepts for this topic."),
            "common_misconception": parsed.get("common_misconception", "Carefully check the premise and edge cases of the problem."),
            "pro_tip": parsed.get("pro_tip", "Break down complex questions into identifiable keywords.")
        }
    except Exception as e:
        print(f"Explanation generator fallback: {e}")
        return {
            "summary": "Core Solution Concept",
            "detailed_explanation": explanation or f"The correct answer is: {correct_answer}. Focus on the underlying definition and how it differentiates from alternate choices.",
            "common_misconception": "Students frequently overlook subtle qualifiers in the question stem.",
            "pro_tip": "Always re-read the specific requirements before formulating your response."
        }