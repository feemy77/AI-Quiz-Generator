"""
Grading Engine for evaluating student answers.
"""
import os
import json
from dotenv import load_dotenv
from langchain_core.prompts import PromptTemplate
from quiz_generator import groq_8b_llm as llm  # ✅ Using Tier 3 safe model for grading

load_dotenv()

# --- Prompt for Long Answer / Short Answer Grading ---
grading_prompt = PromptTemplate(
    template="""
You are an expert educator and strict examiner. Your task is to evaluate a student's answer based on the provided model answer and key points.

Question: {question}
Model Answer: {model_answer}
Key Points Required: {key_points}

Student's Answer: {student_answer}

Evaluate the student's answer and assign a score percentage from 0 to 100 based on accuracy, completeness, and understanding. Provide constructive feedback explaining what was correct and what was missing.

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "score_percent": 85.0,
  "feedback": "Your explanation and feedback here."
}}
""",
    input_variables=["question", "model_answer", "key_points", "student_answer"]
)

def check_mcq(student_answer: str, correct_answer: str) -> bool:
    if not student_answer:
        return False
    return student_answer.strip().lower() == correct_answer.strip().lower()

def check_fill_blank(student_answer: str, correct_answer: str) -> bool:
    if not student_answer:
        return False
    return student_answer.strip().lower() in correct_answer.strip().lower() or \
           correct_answer.strip().lower() in student_answer.strip().lower()

def grade_long_answer(question: str, model_answer: str, key_points: list, student_answer: str) -> dict:
    if not student_answer or not student_answer.strip() or not llm:
        return {
            "score_percent": 0.0,
            "feedback": "No answer was provided by the student or AI engine is offline."
        }

    try:
        prompt_str = grading_prompt.format(
            question=question,
            model_answer=model_answer,
            key_points=", ".join(key_points) if key_points else "General conceptual accuracy",
            student_answer=student_answer
        )

        response = llm.invoke(prompt_str)
        content = response.content.strip()

        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]

        result = json.loads(content.strip())
        return {
            "score_percent": float(result.get("score_percent", 0.0)),
            "feedback": result.get("feedback", "Evaluated by AI.")
        }
    except Exception as e:
        print(f"Grading fallback triggered due to error: {e}")
        return {
            "score_percent": 50.0,
            "feedback": "Answer recorded. Manual review recommended (AI grading parsing issue)."
        }