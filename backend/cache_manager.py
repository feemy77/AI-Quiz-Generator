import sqlite3
import json
import hashlib
import os

# Database file current backend folder mein banegi
DB_PATH = os.path.join(os.path.dirname(__file__), "quiz_cache.db")

def init_db():
    """Database aur table create karta hay agar pehle se mojood na ho."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    # request_hash humari unique chaabi (key) hogi
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS cached_quizzes (
            request_hash TEXT PRIMARY KEY,
            quiz_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    conn.close()

def generate_hash(source_identifier: str, mcq: int, fill_blank: int, short_ans: int, long_ans: int, difficulty: str) -> str:
    """
    Ek unique fingerprint banata hay input parameters ko mila kar.
    source_identifier: YouTube URL ho sakta hay ya Document text ka hissa.
    """
    raw_string = f"{source_identifier}_{mcq}_{fill_blank}_{short_ans}_{long_ans}_{difficulty}".lower()
    return hashlib.sha256(raw_string.encode('utf-8')).hexdigest()

def get_cached_quiz(request_hash: str) -> dict:
    """Agar quiz cache mein hay toh foran return karega."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT quiz_data FROM cached_quizzes WHERE request_hash = ?", (request_hash,))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        print("⚡ BINGO! Serving quiz instantly from Local Cache Database!")
        return json.loads(row[0])
    return None

def save_quiz_to_cache(request_hash: str, quiz_data: dict):
    """Naya quiz database mein hamesha ke liye save kar dega."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO cached_quizzes (request_hash, quiz_data) VALUES (?, ?)",
        (request_hash, json.dumps(quiz_data))
    )
    conn.commit()
    conn.close()
    print("💾 Quiz saved to Local Cache Database successfully!")

# Jab bhi yeh file run hogi, table auto-create ho jayegi
init_db()