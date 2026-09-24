import os
import re
import time
import json
import math
import random
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
    print("[WARNING] GEMINI_API_KEY not found. Please set it in .env or environment variables.")

if not GROQ_API_KEY:
    print("[WARNING] GROQ_API_KEY not found. Please set it in .env or environment variables.")

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
        print(f"[WARNING] Gemini initialization failed: {e}")

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
        print(f"[WARNING] Groq 120B initialization failed: {e}")

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
        print(f"[WARNING] Groq 20B initialization failed: {e}")

# ==========================================
# 3. SHARED RULES (TEACHER-GRADE PEDAGOGICAL STANDARDS)
# ==========================================
COMMON_RULES = """
PROFESSIONAL TEACHER & EXAMINER PERSONA:
- You are a senior university professor and board examiner crafting an authentic, high-caliber examination.
- STRICTLY FORBIDDEN AI GIVEAWAY PHRASES — NEVER use phrases like:
  * "According to the text..." or "According to the passage..."
  * "As stated in the document..." or "As mentioned by the author..."
  * "Based on the provided information..."
  Formulate every question directly, naturally, and authoritatively, exactly as a human teacher writes on a final exam.

STRICTLY FORBIDDEN METADATA & INTRODUCTORY SLIDES:
- Never ask about the document's filename, page count, cover page, document title, or who authored/compiled it.
- Never ask for personal contact details, email addresses, or websites.
- NEVER generate questions from front-page / title slides, course headers, instructor details, lecture outlines, table of contents, agendas, grading policies, prerequisite lists, or concluding "Thank You / Q&A / References" slides.
- FOCUS 100% ON HIGH-YIELD CORE CONCEPTS: Anchor every single question in the primary technical concepts, architectural components, algorithms, scientific definitions, calculations, comparative trade-offs, and substantive mechanisms that have the highest probability of appearing on a university midterm or final exam.

CRITICAL LANGUAGE REQUIREMENT:
- All questions, options, answers, and explanations MUST be in clear, academic English.
- If the source text contains Urdu, Hindi, or Roman Urdu, seamlessly translate and explain the core concepts in English.

MCQ QUALITY & DISTRACTOR RULES:
- Provide exactly 4 plausible, academically sound options.
- Avoid lazy or obvious distractors like "None of the above", "All of the above", or meaningless silly guesses.
- All 4 options must be similar in length, style, and grammatical structure.
- Vary the placement of the correct answer naturally across the 4 options.

FILL-IN-THE-BLANKS RULES:
- The blank ('____') MUST represent a core technical concept, scientific law, term, formula, or vital keyword.
- NEVER blank out trivial prepositions or filler words (e.g. 'the', 'is', 'in', 'very').
"""

# 🧠 DYNAMIC QUESTION STYLING INSTRUCTION BUILDER
# 🧠 DYNAMIC QUESTION STYLING INSTRUCTION BUILDER
def _get_style_instruction(style: str) -> str:
    style = style.lower().strip()
    if style in ("university_theory", "uni_theory"):
        return """
- PEDAGOGICAL STYLE: UNIVERSITY OUTCOME-BASED THEORY EXAM (HIGHER EDUCATION OBE STANDARD).
  * Design a rigorous, balanced, professor-grade university examination paper featuring an authentic pedagogical mix:
    - MCQs: Test foundational definitions, core principles, system components, and key terminology with plausible technical distractors. Tag with [CLO-1].
    - Short Questions: Balance direct conceptual definitions, comparative differences (e.g. 'Differentiate between X and Y with respect to performance'), and architectural mechanics. Tag with [CLO-1] or [CLO-2].
    - Long Questions: Frame an authentic real-world engineering dilemma, named system scenario, or case study with sub-parts:
      a) System specification / problem formulation [Points: 2]
      b) Architectural trade-off analysis / conceptual justification [Points: 2]
      c) Mathematical derivation, algorithm trace, or code implementation snippet [Points: 2]
      Tag with [CLO-2] or [CLO-3].
  * STRICTLY FORBIDDEN: Superficial memorization or generic 'According to the text...' phrases. Formulate every question directly with authentic professor authority.
"""
    elif style in ("university_practical", "uni_practical", "practical", "lab_exam"):
        return """
- PEDAGOGICAL STYLE: UNIVERSITY PRACTICAL & LAB EXAMINATION (100% PURE HANDS-ON IMPLEMENTATION).
  * Focus EXCLUSIVELY on technical implementation, code architecture, algorithms, and hands-on laboratory problem solving.
  * STRICTLY FORBIDDEN: Do NOT generate textbook definitions, memorization questions, or abstract essay prompts.
  * MANDATORY 6-PART SEQUENTIAL LAB STRUCTURE: The question MUST be organized into sequential, concrete implementation sub-parts:
    a) Environment Setup & Library / Dependency Configuration [1 Mark]
    b) Data Ingestion / State Representation & Preprocessing [2 Marks]
    c) Core Algorithm / Pipeline Architecture Implementation [3 Marks]
    d) Execution, Hyperparameter Tuning & Boundary / Error Handling [2 Marks]
    e) Model Evaluation / Output Verification & Metrics [2 Marks]
    f) Visualization of Results / Decision Curves / State Trace [2 Marks]
  * Points breakdown: '[(1 + 2 + 2 + 3 + 2 + 2 = 12) Marks]'.
  * The model answer MUST include complete, clean, production-grade, well-commented Python / C++ code blocks addressing all parts 'a)' through 'f)'.
"""
    elif style in ("college_board", "college", "intermediate"):
        return """
- PEDAGOGICAL STYLE: HIGHER SECONDARY & COLLEGE BOARD EXAM (INTERMEDIATE STANDARD).
  * Focus strictly on Board Examination requirements:
    - Definitions & Scientific Laws: Clear, concise definitions and core theorems.
    - Comparative Differences: Dedicated comparison questions (e.g., 'Differentiate between X and Y in 3 distinct points').
    - Conceptual Reasoning: Scientific explanations ('Give reasons why...', 'How does X affect Y?').
    - Theoretical Derivations: Step-by-step working principles and formulas.
  * Do NOT create overly complex enterprise scenario case studies. Keep questions focused on syllabus concepts.
"""
    elif style in ("school_standard", "school", "secondary"):
        return """
- PEDAGOGICAL STYLE: SECONDARY SCHOOL STANDARD (TEXTBOOK EXERCISE & CORE DEFINITIONS).
  * Match standard school textbook exercise questions directly extracted from the chapters:
    - Direct definitions: ('Define X', 'What is meant by Y?').
    - Textbook end-of-chapter exercise questions: ('Explore and explain [topic]', 'State three properties of X', 'Explain the process of Y').
    - Direct factual fill-in-the-blanks and clear, accessible multiple-choice questions testing core concepts.
  * Keep vocabulary accessible, clear, and curriculum-aligned.
"""
    elif style in ("definition", "definitions"):
        return """
- PEDAGOGICAL STYLE: FORMAL SCIENTIFIC DEFINITION & CORE LAWS.
  * Frame questions that test precise, textbook-grade definitions, scientific laws, or core mathematical/computational terminology.
  * Require the student to state the exact definition and provide an illustrative example.
"""
    elif style in ("comparison", "difference", "differences"):
        return """
- PEDAGOGICAL STYLE: COMPARE, CONTRAST & SYSTEMATIC DIFFERENCES.
  * Formulate questions asking students to differentiate between two concepts, methodologies, data structures, protocols, or algorithms (e.g. 'Differentiate between X and Y with respect to performance and use-case').
  * Require 2 to 4 distinct comparative points or a contrast analysis.
"""
    elif style == "conceptual":
        return """
- PEDAGOGICAL STYLE: CONCEPTUAL & FIRST PRINCIPLES.
  * Focus strictly on 'Why' and 'How' rather than superficial memorization.
  * Test deep understanding of underlying principles, mechanisms, causal chains, and relationships between concepts.
  * Frame questions that challenge students to demonstrate real comprehension of the subject.
"""
    elif style == "comprehension":
        return """
- PEDAGOGICAL STYLE: CRITICAL READING & COMPREHENSION.
  * Every question MUST be answerable directly or inferentially from the provided Reading Passage.
  * Test textual comprehension, main themes, author's intent, vocabulary in context, and logical deductions.
  * Reference specific aspects of the text (e.g., 'In the passage...', 'The author suggests that...', 'Based on the passage...').
  * STRICTLY DO NOT ask about any information that is outside the provided reading passage.
"""
    elif style in ("programming", "coding"):
        return """
- PEDAGOGICAL STYLE: PROGRAMMING, CODE TRACING & TECHNICAL IMPLEMENTATION.
  * Every question MUST test real technical code, syntax, algorithms, or programming concepts.
  * For MCQs: Include short, clean code snippets to trace, ask for runtime/space complexity, predict output, or spot subtle bugs.
  * For Blanks: The blank ('____') must represent a critical keyword, function/method name, operator, or syntax construct in a code statement.
  * For Short/Long questions: Require students to write concise algorithms, analyze data structures, or provide code implementations.
"""
    elif style == "scenario":
        return """
- PEDAGOGICAL STYLE: REAL-WORLD SCENARIO & CASE STUDY.
  * Present realistic, real-world case studies, operational challenges, or troubleshooting dilemmas.
  * Structure questions as: 'An organization / engineer / researcher faces [Problem X under constraints Y]. What is the optimal approach?'
  * Require the student to apply learned theoretical knowledge to resolve practical challenges.
"""
    elif style == "exam":
        return """
- PEDAGOGICAL STYLE: FORMAL ACADEMIC BOARD EXAM.
  * Utilize strict Bloom's Taxonomy cognitive command verbs: 'Differentiate between...', 'Derive...', 'Critically evaluate...', 'Justify why...', 'Elaborate with examples...'.
  * Questions must reflect rigorous university-level exam standards with CLO tags [CLO-1], [CLO-2], [CLO-3].
"""
    else: # Auto/Smart Mode (Default)
        return """
- PEDAGOGICAL STYLE: SMART BALANCED ADAPTIVE.
  * If the text contains programming or technical algorithms, generate code tracing, debugging, and output prediction questions.
  * If the text is theoretical or narrative, generate a balanced combination of conceptual, analytical, and scenario-based questions.
"""

# ==========================================
# 4. PROMPT TEMPLATES
# ==========================================
mcq_prompt = PromptTemplate(
    template="""
You are an expert educator and university examiner. Based strictly on the provided text, generate {num_questions} multiple-choice questions.
Difficulty level: {difficulty}
{dynamic_rules}

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the question here in English?",
      "clo": "CLO-1",
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
You are an expert educator and university examiner. Based strictly on the provided text, generate {num_questions} fill-in-the-blank questions.
Difficulty level: {difficulty}
{dynamic_rules}
- CRITICAL: Every `question_text` MUST contain EXACTLY ONE blank space represented by EXACTLY FOUR UNDERSCORES ('____'). 

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "The sentence with ____ here in English.",
      "clo": "CLO-1",
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
You are an expert educator and university examiner. Based strictly on the provided text, generate {num_questions} short-answer questions.
Difficulty level: {difficulty}
{dynamic_rules}

MARK DISTRIBUTION RULE:
Every short question is strictly worth 2 Marks. You MUST set "marks": 2.

ALTERNATIVE QUESTIONS REQUIREMENT:
For each question:
1. Provide the primary question in `question_text`. Set `style_type` to one of ("conceptual", "coding", "scenario", "difference", "definition").
2. Provide 2 alternative questions in the `alternatives` array of diverse styles (e.g., if primary is conceptual, provide one coding alternative and one difference/scenario alternative) so educators and students can easily swap questions.

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the direct question or analytical calculation here in English?",
      "style_type": "conceptual",
      "clo": "CLO-2",
      "marks": 2,
      "correct_answer": "Model short answer in English (or short code block).",
      "explanation": "Brief explanation in English.",
      "alternatives": [
        {{
          "question_text": "Alternative question testing practical code, debugging, or trace?",
          "style_type": "coding",
          "clo": "CLO-2",
          "marks": 2,
          "correct_answer": "Model short answer.",
          "explanation": "Brief explanation."
        }},
        {{
          "question_text": "Alternative question asking to compare/differentiate two concepts or evaluate a scenario?",
          "style_type": "difference",
          "clo": "CLO-2",
          "marks": 2,
          "correct_answer": "Model short answer.",
          "explanation": "Brief explanation."
        }}
      ]
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
You are an expert educator and university examiner. Based strictly on the provided text, generate {num_questions} open-ended long-answer questions, comprehensive case studies, or practical implementation tasks.
Difficulty level: {difficulty}
{dynamic_rules}

MARK DISTRIBUTION RULES:
- Assign "marks": 10 for questions requiring diagram/graph/tree drawing, visual modeling, data structure & algorithm traces (e.g. Graph traversal, Trees, Dijkstra, BST, AVL, DP tables, Flowcharts, State machines), or comprehensive multi-part practical case studies.
- Assign "marks": 6 for standard analytical, descriptive, or conceptual long questions without diagram/graph construction.

ALTERNATIVE QUESTIONS REQUIREMENT:
For each question:
1. Provide the primary comprehensive question in `question_text` with sub-parts a), b), c). Set `style_type` to one of ("scenario", "coding", "conceptual", "derivation").
2. Provide 2 alternative questions in the `alternatives` array with different pedagogical styles (e.g., one coding/implementation task, one conceptual/architectural analysis) so educators and students have swappable options.

You MUST return ONLY a valid JSON object. Follow this EXACT format:
{{
  "questions": [
    {{
      "question_text": "Write the comprehensive question or practical lab task with sub-parts a), b), c) here in English?",
      "style_type": "scenario",
      "clo": "CLO-3",
      "marks": 6,
      "model_answer": "A detailed model answer in English (or complete implementation code).",
      "key_points": ["Point 1 in English", "Point 2 in English"],
      "alternatives": [
        {{
          "question_text": "Alternative comprehensive question testing coding, pipeline, or implementation?",
          "style_type": "coding",
          "clo": "CLO-3",
          "marks": 6,
          "model_answer": "Detailed implementation model answer.",
          "key_points": ["Implementation point 1", "Implementation point 2"]
        }},
        {{
          "question_text": "Alternative comprehensive question testing conceptual architecture, design trade-offs, or theory?",
          "style_type": "conceptual",
          "clo": "CLO-3",
          "marks": 6,
          "model_answer": "Detailed conceptual model answer.",
          "key_points": ["Conceptual point 1", "Conceptual point 2"]
        }}
      ]
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
def determine_long_question_marks(question_obj: dict) -> int:
    """
    Intelligently assigns marks to long questions based on academic standards:
    - 10 Marks: Questions requiring diagram/graph/tree drawing, visual modeling,
      data structure & algorithm (DSA) trace/traversal/tables (e.g. Dijkstra, AVL, Graphs, BST),
      or comprehensive multi-part practical case studies.
    - 6 Marks: Standard descriptive, conceptual, architectural, or analytical long questions.
    """
    if not isinstance(question_obj, dict):
        return 6

    # Respect explicit teacher override if set to 6 or 10 or custom
    existing_marks = question_obj.get("marks")
    if existing_marks and isinstance(existing_marks, (int, float)) and existing_marks in (6, 10):
        return int(existing_marks)

    text = (
        str(question_obj.get("question_text", "")) + " " +
        str(question_obj.get("model_answer", ""))
    ).lower()

    # High-weight indicator patterns for 10-mark questions (Diagrams, Graphs, Trees, DSA, Visuals)
    graph_dsa_keywords = [
        "graph", "tree", "diagram", "draw", "sketch", "flowchart", "plot", "visualize",
        "dijkstra", "kruskal", "prim", "bfs", "dfs", "avl", "b-tree", "b+ tree",
        "binary search tree", "bst", "heap", "min-heap", "max-heap", "red-black",
        "state machine", "transition diagram", "er diagram", "erd", "schema diagram",
        "architecture diagram", "dynamic programming table", "knapsack", "recursion tree",
        "trace the algorithm", "step-by-step trace", "traversal", "topological"
    ]

    for kw in graph_dsa_keywords:
        if re.search(r'\b' + re.escape(kw) + r'\b', text):
            return 10

    # Also check if the question has 3+ subparts (a, b, c, d)
    subpart_matches = re.findall(r'\b[a-e]\)', text)
    if len(subpart_matches) >= 3:
        return 10

    return 6

_META_PATTERNS = [
    r"\btitle of (the|this) document\b", r"\bname of (the|this) document\b",
    r"\bwho (prepared|compiled|wrote|authored)\b", r"\bauthor'?s? (website|email|contact)\b"
]
_META_REGEX = re.compile("|".join(_META_PATTERNS), re.IGNORECASE)

def _filter_meta_questions(questions: list) -> list:
    return [q for q in questions if not bool(_META_REGEX.search(q.get("question_text", "")))]

def _normalize_and_shuffle_mcq(q: dict) -> dict:
    """
    Cleans option prefixes (e.g. 'A)', 'B.') and programmatically shuffles options
    so the correct answer is randomly distributed across A, B, C, and D (preventing option B bias).
    """
    if not isinstance(q, dict):
        return q
    options = q.get("options", [])
    correct = str(q.get("correct_answer", "")).strip()

    if not options or not isinstance(options, list) or len(options) < 2:
        return q

    # Strip prefixes like "Option A", "A)", "A.", "1.", "1)" from correct_answer if present
    cleaned_correct = re.sub(r"^(?:option\s+)?[a-d1-4][\)\.\:\-]\s*", "", correct, flags=re.IGNORECASE).strip()

    # Clean option strings
    cleaned_options = []
    for opt in options:
        opt_str = str(opt).strip()
        cleaned_opt = re.sub(r"^(?:option\s+)?[a-d1-4][\)\.\:\-]\s*", "", opt_str, flags=re.IGNORECASE).strip()
        cleaned_options.append(cleaned_opt)
        if opt_str.lower() == correct.lower() or cleaned_opt.lower() == cleaned_correct.lower():
            cleaned_correct = cleaned_opt

    # If correct_answer was just a single letter like "A", "B", "C", "D"
    letter_match = re.match(r"^(?:option\s+)?([a-d])$", correct, re.IGNORECASE)
    if letter_match:
        idx = ord(letter_match.group(1).upper()) - ord('A')
        if 0 <= idx < len(cleaned_options):
            cleaned_correct = cleaned_options[idx]

    # Ensure correct answer is explicitly present in cleaned options
    if cleaned_correct not in cleaned_options:
        for opt in cleaned_options:
            if opt.lower() == cleaned_correct.lower():
                cleaned_correct = opt
                break
        else:
            if cleaned_options:
                cleaned_options[0] = cleaned_correct

    # Deduplicate while preserving order
    seen = set()
    unique_options = []
    for opt in cleaned_options:
        if opt.lower() not in seen:
            seen.add(opt.lower())
            unique_options.append(opt)

    if len(unique_options) >= 2:
        cleaned_options = unique_options

    # Programmatically shuffle options to guarantee random distribution across A, B, C, D
    random.shuffle(cleaned_options)

    q["options"] = cleaned_options
    q["correct_answer"] = cleaned_correct
    return q

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

        # TIER 1: GEMINI
        if gemini_llm and not success:
            try:
                print(f"[Tier 1: Gemini] Routing for {label}...")
                response = gemini_llm.invoke(prompt_str)
                data = clean_json_response(response.content)
                if "questions" in data:
                    success = True
                    print(f"[Tier 1: Gemini] Success: Handled {label} request.")
            except Exception as e:
                print(f"[Tier 1: Gemini] Request failed. Shifting to Tier 2: {e}")

        # TIER 2: GROQ LLAMA3 70B
        if groq_70b_llm and not success:
            try:
                print(f"[Tier 2: Groq 70B] Routing for {label}...")
                response = groq_70b_llm.invoke(prompt_str)
                data = clean_json_response(response.content)
                if "questions" in data:
                    success = True
                    print(f"[Tier 2: Groq 70B] Success: Handled {label} request.")
            except Exception as e:
                print(f"[Tier 2: Groq 70B] Request failed. Shifting to Tier 3: {e}")
                time.sleep(2)

        # TIER 3: GROQ LLAMA 3.1 8B (Safety Net)
        if groq_8b_llm and not success:
            print(f"[Tier 3: Groq 8B] Routing for {label}...")
            max_retries = 2
            for attempt in range(max_retries):
                try:
                    response = groq_8b_llm.invoke(prompt_str)
                    data = clean_json_response(response.content)
                    if "questions" in data:
                        success = True
                        print(f"[Tier 3: Groq 8B] Success: Handled {label} request.")
                        break
                except Exception as e_groq:
                    error_msg = str(e_groq).lower()
                    if "413" in error_msg or "rate_limit" in error_msg:
                        print("[Rate Limit] Hit limit. Pausing for 21 seconds...")
                        time.sleep(21) 
                    else:
                        time.sleep(3)

        # Extraction logic
        if success:
            clean_questions = _filter_meta_questions(data["questions"])
            if label == "MCQ":
                clean_questions = [_normalize_and_shuffle_mcq(q) for q in clean_questions if isinstance(q, dict) and "options" in q]
            elif label == "Fill-in-the-blank":
                clean_questions = [q for q in clean_questions if "____" in q.get("question_text", "")]
            all_questions.extend(clean_questions)
            print(f"[Extracted] {label}: {len(clean_questions)} questions. Total: {len(all_questions)}/{total_questions}")
        else:
            print(f"[FAILED] All 3 tiers failed for this {label} chunk.")

        chunk_index += 1
        if chunk_index > len(chunks) * 5: break
        
        # Sleep to keep limits safe across all models
        time.sleep(2)

    return all_questions[:total_questions]

# ==========================================
# 7. READING COMPREHENSION PASSAGE CURATOR
# ==========================================
def extract_reading_passage(text: str) -> str:
    """
    Extracts or curates a coherent, self-contained 250-400 word reading passage
    from the provided source text so students have an official passage to read and answer from.
    """
    clean_text = text.strip()
    words = clean_text.split()
    if 60 <= len(words) <= 350:
        return clean_text

    prompt_str = f"""
You are an expert reading comprehension examination author.
From the source text below, extract or synthesize a continuous, self-contained, high-quality reading comprehension passage of approximately 250 to 380 words.

STRICT RULES:
1. The passage MUST be completely self-contained and coherent, understandable on its own without outside reading.
2. It MUST contain rich facts, concepts, or arguments so that multiple-choice, short-answer, and inference questions can be answered from it.
3. DO NOT include any conversational filler, introductory remarks (e.g., 'Here is the passage:'), or meta-labels. Return ONLY the exact passage text in clean paragraphs.

SOURCE TEXT:
{clean_text[:6000]}
"""
    passage = ""
    # Tier 1: Gemini
    if gemini_llm:
        try:
            print("[Comprehension] Curating reading passage with Tier 1 (Gemini)...")
            res = gemini_llm.invoke(prompt_str)
            passage = res.content.strip()
            if passage.startswith("```"):
                passage = re.sub(r"^```[a-zA-Z]*\n|```$", "", passage).strip()
        except Exception as e:
            print(f"[Comprehension] Tier 1 passage curation notice: {e}")

    # Tier 2: Groq 70B
    if not passage and groq_70b_llm:
        try:
            print("[Comprehension] Curating reading passage with Tier 2 (Groq 70B)...")
            res = groq_70b_llm.invoke(prompt_str)
            passage = res.content.strip()
            if passage.startswith("```"):
                passage = re.sub(r"^```[a-zA-Z]*\n|```$", "", passage).strip()
        except Exception as e:
            print(f"[Comprehension] Tier 2 passage curation notice: {e}")

    # Fallback: clean slice of first ~300 words
    if not passage or len(passage.split()) < 40:
        print("[Comprehension] Using direct text slice as reading passage.")
        passage = " ".join(words[:300])

    return passage.strip()

# ==========================================
# 8. MAIN ENTRY POINT (UPDATED SIGNATURE)
# ==========================================
def _ensure_question_schema(q: dict, default_type: str = "conceptual") -> dict:
    if not isinstance(q, dict):
        return q
    if "alternatives" not in q or not isinstance(q.get("alternatives"), list):
        q["alternatives"] = []
    if "style_type" not in q or not q.get("style_type"):
        q["style_type"] = default_type
    clean_alts = []
    for alt in q.get("alternatives", []):
        if isinstance(alt, dict) and alt.get("question_text"):
            if "style_type" not in alt or not alt["style_type"]:
                alt["style_type"] = "alternative"
            if "clo" not in alt and "clo" in q:
                alt["clo"] = q["clo"]
            if "marks" not in alt and "marks" in q:
                alt["marks"] = q["marks"]
            ans = alt.get("correct_answer") or alt.get("model_answer") or ""
            alt["correct_answer"] = ans
            alt["model_answer"] = ans
            clean_alts.append(alt)
    q["alternatives"] = clean_alts
    return q

# ==========================================
# 8. MAIN ENTRY POINT (UPDATED SIGNATURE)
# ==========================================
def generate_quiz_from_large_text(
    text: str,
    question_counts: Dict[str, int],
    difficulty: str = "Medium",
    question_style: str = "Auto",
    include_comprehension: bool = False
) -> dict:
    mcq_count = question_counts.get("mcq", 0)
    fill_blank_count = question_counts.get("fill_blank", 0)
    short_count = question_counts.get("short_answer", 0)
    long_count = question_counts.get("long_answer", 0)

    if mcq_count + fill_blank_count + short_count + long_count <= 0:
        raise ValueError("question_counts must request at least one question.")

    quiz: dict = {}
    is_comprehension = (question_style.lower() == "comprehension") or (
        question_style.lower() in ("college_board", "college", "intermediate") and include_comprehension
    )

    if is_comprehension:
        reading_passage = extract_reading_passage(text)
        quiz["reading_passage"] = reading_passage
        chunks = [reading_passage]
        print(f"\n[Comprehension] Curated reading passage of {len(reading_passage.split())} words.")
        print("Anchoring all question generation strictly to this curated reading passage.")
    else:
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=4500, chunk_overlap=400)
        chunks = text_splitter.split_text(text)
        print(f"\nDivided text into {len(chunks)} ultra-safe chunks for 3-Tier processing.")
    
    print(f"Applying Smart Question Style: {question_style} (include_comprehension={include_comprehension})")

    # Build the dynamic instruction for this specific generation request
    dynamic_rules = COMMON_RULES + _get_style_instruction(question_style)
    if question_style.lower() in ("college_board", "college", "intermediate"):
        if not include_comprehension:
            dynamic_rules += "\n- NO READING COMPREHENSION: Do not generate reading passage questions. Formulate direct syllabus definitions, comparative differences, and conceptual reasoning questions."

    if mcq_count > 0:
        raw_mcqs = _generate_batch_from_chunks(mcq_prompt, chunks, mcq_count, difficulty, dynamic_rules, "MCQ")
        clean_mcqs = []
        for q in raw_mcqs:
            if isinstance(q, dict):
                q["marks"] = 1
                clean_mcqs.append(_ensure_question_schema(_normalize_and_shuffle_mcq(q), "conceptual"))
        quiz["mcq_questions"] = clean_mcqs
        
    if fill_blank_count > 0:
        raw_blanks = _generate_batch_from_chunks(fill_blank_prompt, chunks, fill_blank_count, difficulty, dynamic_rules, "Fill-in-the-blank")
        clean_blanks = []
        for q in raw_blanks:
            if isinstance(q, dict):
                q["marks"] = 1
                clean_blanks.append(_ensure_question_schema(q, "factual"))
        quiz["fill_blank_questions"] = clean_blanks
        
    if short_count > 0:
        raw_shorts = _generate_batch_from_chunks(short_prompt, chunks, short_count, difficulty, dynamic_rules, "Short-answer")
        for q in raw_shorts:
            if isinstance(q, dict):
                ans = q.get("correct_answer") or q.get("model_answer") or q.get("explanation") or ""
                q["correct_answer"] = ans
                q["model_answer"] = ans
                q["marks"] = 2  # Each short question is strictly 2 Marks
                _ensure_question_schema(q, "conceptual")
        quiz["short_questions"] = raw_shorts
        
    if long_count > 0:
        raw_longs = _generate_batch_from_chunks(long_prompt, chunks, long_count, difficulty, dynamic_rules, "Long-answer")
        for q in raw_longs:
            if isinstance(q, dict):
                ans = q.get("model_answer") or q.get("correct_answer") or ""
                q["model_answer"] = ans
                q["correct_answer"] = ans
                q["marks"] = determine_long_question_marks(q)  # 10 Marks if graph/diagram/tree/DSA/visual, else 6 Marks
                _ensure_question_schema(q, "scenario")
        quiz["long_questions"] = raw_longs

    return quiz

def generate_alternative_question(
    text: str,
    question_type: str,
    target_style: str = "conceptual",
    difficulty: str = "Medium"
) -> dict:
    """
    Generates a single alternative question with the exact requested pedagogical style
    (e.g., conceptual, coding, scenario, difference, definition).
    """
    norm_type = question_type.lower().strip()
    if norm_type in ("short", "short_questions", "short_answer"):
        sec_key = "short_questions"
        q_counts = {"short_answer": 1}
    elif norm_type in ("long", "long_questions", "long_answer"):
        sec_key = "long_questions"
        q_counts = {"long_answer": 1}
    elif norm_type in ("blank", "fill_blank_questions", "fill_blank"):
        sec_key = "fill_blank_questions"
        q_counts = {"fill_blank": 1}
    else:
        sec_key = "mcq_questions"
        q_counts = {"mcq": 1}

    res = generate_quiz_from_large_text(
        text=text,
        question_counts=q_counts,
        difficulty=difficulty,
        question_style=target_style
    )

    if res and res.get(sec_key) and len(res[sec_key]) > 0:
        new_q = res[sec_key][0]
        new_q["style_type"] = target_style
        return new_q
    return {}