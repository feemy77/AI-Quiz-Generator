import os
import re
import time
import json
import math
from dotenv import load_dotenv
from typing import List, Dict

# LangChain Imports
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter

# ==========================================
# 1. API KEYS SETUP
# ==========================================
load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in .env")

if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in .env")

# ==========================================
# 2. INITIALIZE 3-TIER AI MODELS
# ==========================================
# Tier 1: Gemini 3.1 Flash-Lite
gemini_llm = None
if GEMINI_API_KEY:
    try:
        gemini_llm = ChatGoogleGenerativeAI(
            model="gemini-3.1-flash-lite",
            temperature=0.3,
            google_api_key=GEMINI_API_KEY
        )
    except Exception as e:
        print(f"⚠️ Gemini initialization failed: {e}")

# Tier 2: Groq GPT-OSS 120B (Ultra Smart)
groq_70b_llm = None
if GROQ_API_KEY:
    try:
        groq_70b_llm = ChatGroq(
            model="openai/gpt-oss-120b",
            temperature=0.3,
            max_tokens=1024,
            api_key=GROQ_API_KEY,
            model_kwargs={"response_format": {"type": "json_object"}}
        )
    except Exception as e:
        print(f"⚠️ Groq 120B initialization failed: {e}")

# Tier 3: Groq GPT-OSS 20B (Reliable Backup)
groq_8b_llm = None
if GROQ_API_KEY:
    try:
        groq_8b_llm = ChatGroq(
            model="openai/gpt-oss-20b",
            temperature=0.3,
            max_tokens=1024,
            api_key=GROQ_API_KEY,
            model_kwargs={"response_format": {"type": "json_object"}}
        )
    except Exception as e:
        print(f"⚠️ Groq 20B initialization failed: {e}")

# ==========================================
# 3. SHARED RULES (STRICT ENGLISH)
# ==========================================
COMMON_RULES = """
STRICTLY FORBIDDEN — never ask about:
- The document's title, filename, or cover page
- Who wrote, compiled, prepared, or authored the document
- The author's website, email, contact info, or social links

CRITICAL LANGUAGE REQUIREMENT:
- You MUST generate ALL questions, options, answers, and explanations STRICTLY IN PROFESSIONAL ENGLISH ONLY.
- If the document text contains Urdu, Hindi, Roman Urdu, or any other language, TRANSLATE the concepts seamlessly and output ONLY in English. Do not include any non-English characters.

CRITICAL INSTRUCTION FOR SPREAD:
- You MUST distribute your questions evenly across the ENTIRE text provided below. 
ONLY ask about the actual factual content. Do not use outside knowledge unless extending a coding scenario based on the text.
"""

# 🧠 NEW: DYNAMIC QUESTION STYLING INSTRUCTION BUILDER
def _get_style_instruction(style: str) -> str:
    style = style.lower().strip()
    if style == "conceptual":
        return "\n- QUESTION STYLE: Conceptual. Focus strictly on 'Why' and 'How'. Ask about underlying principles, significance, reasoning, and relationships between concepts."
    elif style == "comprehension":
        return "\n- QUESTION STYLE: Comprehension. Focus heavily on passage analysis. Ask about the main idea, inferences, author's reasoning, and conclusions supported by the text."
    elif style == "programming" or style == "coding":
        return "\n- QUESTION STYLE: Programming/Coding. The text contains technical or programming concepts. Generate questions like code writing, code completion, output prediction, debugging, or algorithmic explanation. Use proper syntax formatting for code blocks."
    elif style == "scenario":
        return "\n- QUESTION STYLE: Application/Scenario-Based. Transform the content into real-world or exam-style scenarios where the user must apply the concepts from the text to solve a specific problem or make a decision."
    elif style == "comparison":
        return "\n- QUESTION STYLE: Compare & Contrast. Focus heavily on differentiating, comparing, and finding similarities or use-cases between different entities, methods, or concepts mentioned in the text."
    elif style == "exam":
        return "\n- QUESTION STYLE: Formal Exam. Use academic patterns: Define, Explain, Differentiate, Discuss, Justify, Analyze, Trace, and Implement."
    else: # Auto/Smart Mode (Default)
        return "\n- QUESTION STYLE: Smart Auto-Detect. First analyze the text. If it contains programming/code, generate a mix of code tracing, debugging, and output prediction. If it is theoretical, generate a balanced mix of conceptual, analytical, and direct factual questions."

# ==========================================
# 4. PROMPT TEMPLATES
# ==========================================
mcq_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} multiple-choice questions.
Difficulty level: {difficulty}
{dynamic_rules}

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the question here in English?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Exact matching string from options",
      "explanation": "Brief explanation in English."
    }}
  ]
}}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "dynamic_rules"],
)

fill_blank_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} fill-in-the-blank questions.
Difficulty level: {difficulty}
{dynamic_rules}
- CRITICAL: Every `question_text` MUST contain EXACTLY ONE blank space represented by EXACTLY FOUR UNDERSCORES ('____'). 

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "The sentence with ____ here in English.",
      "correct_answer": "The missing English word or short code snippet",
      "explanation": "Brief explanation in English."
    }}
  ]
}}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "dynamic_rules"],
)

short_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} short-answer questions.
Difficulty level: {difficulty}
{dynamic_rules}

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the direct question here in English?",
      "correct_answer": "Model short answer in English (or short code block).",
      "explanation": "Brief explanation in English."
    }}
  ]
}}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "dynamic_rules"],
)

long_prompt = PromptTemplate(
    template="""
You are an expert educator. Based strictly on the provided text, generate {num_questions} open-ended long-answer questions.
Difficulty level: {difficulty}
{dynamic_rules}

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the long question here in English?",
      "model_answer": "A detailed model answer in English (or detailed implementation code).",
      "key_points": ["Point 1 in English", "Point 2 in English"]
    }}
  ]
}}

Document Text:
{context}
""",
    input_variables=["context", "num_questions", "difficulty", "dynamic_rules"],
)

# ==========================================
# 5. HELPERS
# ==========================================
_META_PATTERNS = [
    r"\btitle of (the|this) document\b", r"\bname of (the|this) document\b",
    r"\bwho (prepared|compiled|wrote|authored)\b", r"\bauthor'?s? (website|email|contact)\b"
]
_META_REGEX = re.compile("|".join(_META_PATTERNS), re.IGNORECASE)

def _filter_meta_questions(questions: list) -> list:
    return [q for q in questions if not bool(_META_REGEX.search(q.get("question_text", "")))]

def clean_json_response(text) -> dict:
    try:
        if isinstance(text, list):
            text_parts = []
            for item in text:
                if isinstance(item, str):
                    text_parts.append(item)
                elif isinstance(item, dict):
                    if isinstance(item.get("text"), str):
                        text_parts.append(item["text"])
                else:
                    item_text = getattr(item, "text", None)
                    if isinstance(item_text, str):
                        text_parts.append(item_text)
            text = "".join(text_parts)

        if not isinstance(text, str):
            if hasattr(text, "text") and isinstance(text.text, str):
                text = text.text
            else:
                text = str(text)

        text = text.strip()
        if text.startswith("```json"): text = text[7:]
        if text.startswith("```"): text = text[3:]
        if text.endswith("```"): text = text[:-3]
        return json.loads(text.strip())
    except Exception as e:
        raise ValueError(f"Failed to parse JSON: {e}")

# ==========================================
# 6. GENERATOR (The 3-Tier System)
# ==========================================
def _generate_batch_from_chunks(prompt_template, chunks: List[str], total_questions: int, difficulty: str, dynamic_rules: str, label: str) -> list:
    if total_questions <= 0: return []

    all_questions = []
    chunk_index = 0
    target_per_chunk = max(1, math.ceil(total_questions / len(chunks)))

    print(f"\n--- Generating {total_questions} '{label}' questions across {len(chunks)} chunk(s) ---")

    while len(all_questions) < total_questions:
        chunk = chunks[chunk_index % len(chunks)]
        questions_to_ask = min(target_per_chunk, total_questions - len(all_questions))
        
        prompt_str = prompt_template.format(
            context=chunk, num_questions=questions_to_ask,
            difficulty=difficulty, dynamic_rules=dynamic_rules
        )
        
        success = False
        data = {}

        # 🟢 TIER 1: GEMINI
        if gemini_llm and not success:
            try:
                print(f"🧠 Routing to Tier 1: Gemini for {label}...")
                response = gemini_llm.invoke(prompt_str)
                data = clean_json_response(response.content)
                if "questions" in data:
                    success = True
                    print("🚀 Success: Gemini handled the request!")
            except Exception as e:
                print(f"⚠️ Gemini Failed. Silently shifting to Tier 2...")

        # 🟠 TIER 2: GROQ LLAMA3 70B
        if groq_70b_llm and not success:
            try:
                print(f"🔥 Routing to Tier 2: Groq Llama3-70B for {label}...")
                response = groq_70b_llm.invoke(prompt_str)
                data = clean_json_response(response.content)
                if "questions" in data:
                    success = True
                    print("🛡️ Success: Groq 70B handled the request!")
            except Exception as e:
                print(f"⚠️ Groq 70B Failed. Silently shifting to Tier 3...")
                time.sleep(2)

        # 🔴 TIER 3: GROQ LLAMA 3.1 8B (Safety Net)
        if groq_8b_llm and not success:
            print(f"🛠️ Routing to Tier 3: Groq Llama-3.1-8B for {label}...")
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    response = groq_8b_llm.invoke(prompt_str)
                    data = clean_json_response(response.content)
                    if "questions" in data:
                        success = True
                        print("⚓ Success: Groq 8B Backup saved the day!")
                        break
                except Exception as e_groq:
                    error_msg = str(e_groq).lower()
                    if "413" in error_msg or "rate_limit" in error_msg:
                        print("⏳ Rate Limit Hit. Pausing for 21 seconds...")
                        time.sleep(21) 
                    else:
                        time.sleep(3)

        # Extraction logic
        if success:
            clean_questions = _filter_meta_questions(data["questions"])
            if label == "Fill-in-the-blank":
                clean_questions = [q for q in clean_questions if "____" in q.get("question_text", "")]
            all_questions.extend(clean_questions)
            print(f"✅ [{label}] Extracted {len(clean_questions)} questions. Total: {len(all_questions)}/{total_questions}")
        else:
            print(f"❌ [{label}] All 3 Tiers Failed. Skipping this chunk.")

        chunk_index += 1
        if chunk_index > len(chunks) * 5: break
        
        # Sleep to keep limits safe across all models
        time.sleep(2)

    return all_questions[:total_questions]

# ==========================================
# 7. MAIN ENTRY POINT (UPDATED SIGNATURE)
# ==========================================
def generate_quiz_from_large_text(text: str, question_counts: Dict[str, int], difficulty: str = "Medium", question_style: str = "Auto") -> dict:
    mcq_count = question_counts.get("mcq", 0)
    fill_blank_count = question_counts.get("fill_blank", 0)
    short_count = question_counts.get("short_answer", 0)
    long_count = question_counts.get("long_answer", 0)

    if mcq_count + fill_blank_count + short_count + long_count <= 0:
        raise ValueError("question_counts must request at least one question.")

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=4500, chunk_overlap=400)
    chunks = text_splitter.split_text(text)
    print(f"\nDivided text into {len(chunks)} ultra-safe chunks for 3-Tier processing.")
    print(f"Applying Smart Question Style: {question_style}")

    # Build the dynamic instruction for this specific generation request
    dynamic_rules = COMMON_RULES + _get_style_instruction(question_style)

    quiz: dict = {}

    if mcq_count > 0:
        quiz["mcq_questions"] = _generate_batch_from_chunks(mcq_prompt, chunks, mcq_count, difficulty, dynamic_rules, "MCQ")
        
    if fill_blank_count > 0:
        quiz["fill_blank_questions"] = _generate_batch_from_chunks(fill_blank_prompt, chunks, fill_blank_count, difficulty, dynamic_rules, "Fill-in-the-blank")
        
    if short_count > 0:
        quiz["short_questions"] = _generate_batch_from_chunks(short_prompt, chunks, short_count, difficulty, dynamic_rules, "Short-answer")
        
    if long_count > 0:
        quiz["long_questions"] = _generate_batch_from_chunks(long_prompt, chunks, long_count, difficulty, dynamic_rules, "Long-answer")

    return quiz