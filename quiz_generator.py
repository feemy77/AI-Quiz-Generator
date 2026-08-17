import os
import re
import time
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from typing import List, Dict
from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import PydanticOutputParser
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ==========================================
# 1. GROQ API KEY (loaded from .env, never hardcoded)
# ==========================================
load_dotenv()

if not os.getenv("GROQ_API_KEY"):
    raise ValueError(
        "GROQ_API_KEY not found. Create a .env file in the project root "
        "with the line: GROQ_API_KEY=your_key_here"
    )

# ==========================================
# 2. Pydantic Schemas — one per question type
# ==========================================
class MCQQuestion(BaseModel):
    question_text: str = Field(description="The multiple choice question text based on the notes.")
    options: List[str] = Field(description="Exactly 4 distinct options for the question.")
    correct_answer: str = Field(description="The correct option. This MUST perfectly match one of the items in the options list.")
    explanation: str = Field(description="A brief, 1-2 sentence explanation of why this answer is correct to help the student learn.")

class FillBlankQuestion(BaseModel):
    question_text: str = Field(description="A sentence from the content with a key term/phrase removed and replaced with '____'.")
    correct_answer: str = Field(description="The exact word or short phrase that correctly fills the blank.")
    explanation: str = Field(description="A brief, 1-2 sentence explanation of why this is the correct answer.")

class ShortQuestion(BaseModel):
    question_text: str = Field(description="A direct question requiring a short, precise 1-2 sentence answer.")
    correct_answer: str = Field(description="The exact model short answer or expected key facts.")
    explanation: str = Field(description="A brief explanation for learning purposes.")

class LongQuestion(BaseModel):
    question_text: str = Field(description="An open-ended question requiring a written answer of a few sentences to a paragraph.")
    model_answer: str = Field(description="A complete, well-written model answer a student could be graded against.")
    key_points: List[str] = Field(description="3-5 short bullet points capturing the essential facts/ideas a correct answer must include. Used for grading later.")

class MCQBatch(BaseModel):
    questions: List[MCQQuestion]

class FillBlankBatch(BaseModel):
    questions: List[FillBlankQuestion]

class ShortQuestionBatch(BaseModel):
    questions: List[ShortQuestion]

class LongQuestionBatch(BaseModel):
    questions: List[LongQuestion]

# ==========================================
# 3. Initialize the LLM & Parsers (Bypassing 400 Tool Errors)
# ==========================================
llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0.2)

mcq_parser = PydanticOutputParser(pydantic_object=MCQBatch)
fill_blank_parser = PydanticOutputParser(pydantic_object=FillBlankBatch)
short_parser = PydanticOutputParser(pydantic_object=ShortQuestionBatch)
long_parser = PydanticOutputParser(pydantic_object=LongQuestionBatch)

# ==========================================
# 4. Shared rules used across all question types
# ==========================================
COMMON_RULES = """
STRICTLY FORBIDDEN — never ask about:
- The document's title, filename, or cover page
- Who wrote, compiled, prepared, or authored the document
- The author's website, email, contact info, or social links
- Page numbers, chapter numbers, table of contents, or document structure
- Publisher, edition, printing year, or acknowledgements

ONLY ask about the actual academic/factual content. Do not use outside knowledge. Rely ONLY on the provided text.
"""

# ==========================================
# 5. Prompt templates with Format Instructions
# ==========================================
mcq_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} multiple-choice questions.
Difficulty level: {difficulty}
{common_rules}
- Each question must have exactly 4 distinct options.

{format_instructions}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "common_rules"],
    partial_variables={"format_instructions": mcq_parser.get_format_instructions()},
)

fill_blank_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} fill-in-the-blank questions.
Difficulty level: {difficulty}
{common_rules}
- CRITICAL RULE: The `question_text` MUST contain exactly one blank space represented by four underscores ('____'). 
- NEVER output the complete sentence without the '____'.

{format_instructions}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "common_rules"],
    partial_variables={"format_instructions": fill_blank_parser.get_format_instructions()},
)

short_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} short-answer questions.
Difficulty level: {difficulty}
{common_rules}
- Each question must be answerable in 1-2 sentences.

{format_instructions}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "common_rules"],
    partial_variables={"format_instructions": short_parser.get_format_instructions()},
)

long_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} open-ended long-answer questions.
Difficulty level: {difficulty}
{common_rules}
- Provide 3-5 short key_points that capture the essential facts.

{format_instructions}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "common_rules"],
    partial_variables={"format_instructions": long_parser.get_format_instructions()},
)

# Chaining with raw LLM output passed directly to Pydantic Parsers
mcq_chain = mcq_prompt | llm | mcq_parser
fill_blank_chain = fill_blank_prompt | llm | fill_blank_parser
short_chain = short_prompt | llm | short_parser
long_chain = long_prompt | llm | long_parser

# ==========================================
# 6. Safety-net Filter
# ==========================================
_META_PATTERNS = [
    r"\btitle of (the|this) document\b", r"\bname of (the|this) document\b",
    r"\bwho (prepared|compiled|wrote|authored|is the author)\b", r"\bauthor'?s? (website|email|contact)\b",
    r"\bpurpose of (the|this) document\b", r"\bthis quiz is based on\b", r"\bpage number\b", r"\bpublisher\b"
]
_META_REGEX = re.compile("|".join(_META_PATTERNS), re.IGNORECASE)

def _is_meta_question(question_text: str) -> bool:
    return bool(_META_REGEX.search(question_text))

def _filter_meta_questions(questions: list) -> list:
    return [q for q in questions if not _is_meta_question(q.question_text)]

# ==========================================
# 7. Generic chunked generator
# ==========================================
def _generate_batch_from_chunks(chain, chunks: List[str], total_questions: int, difficulty: str, label: str) -> list:
    if total_questions <= 0:
        return []

    all_questions = []
    questions_per_call = 10
    chunk_index = 0

    print(f"--- Generating {total_questions} '{label}' questions across {len(chunks)} chunk(s) ---")

    while len(all_questions) < total_questions:
        chunk = chunks[chunk_index % len(chunks)]
        questions_to_ask = min(questions_per_call, total_questions - len(all_questions))
        print(f"[{label}] Requesting {questions_to_ask} questions from chunk {(chunk_index % len(chunks)) + 1}...")

        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Chain automatically returns parsed Pydantic object now!
                result = chain.invoke({
                    "context": chunk,
                    "num_questions": questions_to_ask,
                    "difficulty": difficulty,
                    "common_rules": COMMON_RULES,
                })
                
                clean_questions = _filter_meta_questions(result.questions)
                all_questions.extend(clean_questions)
                print(f"✅ [{label}] Total collected: {len(all_questions)}/{total_questions}")
                break

            except Exception as e:
                print(f"⚠️ [{label}] Attempt {attempt + 1} failed: {e}")
                if attempt < max_retries - 1:
                    time.sleep(3) # Wait before retry
                else:
                    print(f"❌ [{label}] Skipping this request after 3 fails.")

        chunk_index += 1
        if chunk_index > len(chunks) * 5:
            break

    return all_questions[:total_questions]

# ==========================================
# 8. Main entry point (Safe Sequential Execution)
# ==========================================
def generate_quiz_from_large_text(text: str, question_counts: Dict[str, int], difficulty: str = "Medium") -> dict:
    mcq_count = question_counts.get("mcq", 0)
    fill_blank_count = question_counts.get("fill_blank", 0)
    short_count = question_counts.get("short_answer", 0)
    long_count = question_counts.get("long_answer", 0)

    if mcq_count + fill_blank_count + short_count + long_count <= 0:
        raise ValueError("question_counts must request at least one question of some type.")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=4500, chunk_overlap=400)
    chunks = text_splitter.split_text(text)
    print(f"Divided document into {len(chunks)} smaller parts.")

    quiz: dict = {}

    # Sequential calls with sleep to 100% prevent the 429 Rate Limit
    if mcq_count > 0:
        mcqs = _generate_batch_from_chunks(mcq_chain, chunks, mcq_count, difficulty, "MCQ")
        quiz["mcq_questions"] = [q.model_dump() for q in mcqs]
        time.sleep(4) 
        
    if fill_blank_count > 0:
        fill_blanks = _generate_batch_from_chunks(fill_blank_chain, chunks, fill_blank_count, difficulty, "Fill-in-the-blank")
        quiz["fill_blank_questions"] = [q.model_dump() for q in fill_blanks]
        time.sleep(4)
        
    if short_count > 0:
        shorts = _generate_batch_from_chunks(short_chain, chunks, short_count, difficulty, "Short-answer")
        quiz["short_questions"] = [q.model_dump() for q in shorts]
        time.sleep(4)
        
    if long_count > 0:
        longs = _generate_batch_from_chunks(long_chain, chunks, long_count, difficulty, "Long-answer")
        quiz["long_questions"] = [q.model_dump() for q in longs]

    return quiz