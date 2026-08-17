import sqlite3
import json
from datetime import datetime

DB_FILE = "quiz_app.db"

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # ==========================================
    # 🛑 EXISTING TABLES (UNTOUCHED)
    # ==========================================
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            role TEXT NOT NULL,
            institution_name TEXT
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS quizzes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            exam_metadata TEXT NOT NULL,
            quiz_data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(teacher_id) REFERENCES users(id)
        )
    ''')
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id INTEGER NOT NULL,
            student_name TEXT NOT NULL,
            answers TEXT NOT NULL,
            results TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
        )
    ''')

    # ==========================================
    # 🌟 ADVANCED FEATURES TABLES (UNTOUCHED)
    # ==========================================
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS challenges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            creator_id INTEGER NOT NULL,
            quiz_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(creator_id) REFERENCES users(id),
            FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS challenge_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenge_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            attempt_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(challenge_id) REFERENCES challenges(id),
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(attempt_id) REFERENCES attempts(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS streaks (
            user_id INTEGER PRIMARY KEY,
            current_streak INTEGER DEFAULT 0,
            longest_streak INTEGER DEFAULT 0,
            last_activity_date TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_badges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            badge_name TEXT NOT NULL,
            awarded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            quiz_id INTEGER NOT NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            source_question_type TEXT,
            FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS flashcard_reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            flashcard_id INTEGER NOT NULL,
            next_review_date TEXT NOT NULL,
            interval INTEGER DEFAULT 0,
            repetition INTEGER DEFAULT 0,
            ease_factor REAL DEFAULT 2.5,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(flashcard_id) REFERENCES flashcards(id)
        )
    ''')

    # ==========================================
    # 🏫 B2B / TEACHER PRO MODE TABLES (NEW)
    # ==========================================
    
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS classrooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            teacher_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            join_code TEXT UNIQUE NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(teacher_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS classroom_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classroom_id INTEGER NOT NULL,
            student_id INTEGER NOT NULL,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(classroom_id) REFERENCES classrooms(id),
            FOREIGN KEY(student_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            classroom_id INTEGER NOT NULL,
            quiz_id INTEGER NOT NULL,
            due_date TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(classroom_id) REFERENCES classrooms(id),
            FOREIGN KEY(quiz_id) REFERENCES quizzes(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS teacher_branding (
            teacher_id INTEGER PRIMARY KEY,
            academy_name TEXT,
            logo_path TEXT,
            FOREIGN KEY(teacher_id) REFERENCES users(id)
        )
    ''')

    conn.commit()
    conn.close()

# ==========================================
# 🛑 EXISTING FUNCTIONS (UNTOUCHED)
# ==========================================
def create_user(name, email, password_hash, salt, role, institution_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (name, email, password_hash, salt, role, institution_name) VALUES (?, ?, ?, ?, ?, ?)",
        (name, email, password_hash, salt, role, institution_name)
    )
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return user_id

def get_user_by_email(email):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def get_user_by_id(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    user = cursor.fetchone()
    conn.close()
    return dict(user) if user else None

def create_session(token, user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    conn.commit()
    conn.close()

def get_user_id_for_token(token):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT user_id FROM sessions WHERE token = ?", (token,))
    row = cursor.fetchone()
    conn.close()
    return row["user_id"] if row else None

def delete_session(token):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM sessions WHERE token = ?", (token,))
    conn.commit()
    conn.close()

def create_quiz(teacher_id, exam_metadata, quiz_data):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO quizzes (teacher_id, exam_metadata, quiz_data) VALUES (?, ?, ?)",
        (teacher_id, json.dumps(exam_metadata), json.dumps(quiz_data))
    )
    quiz_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return quiz_id

def get_quiz(quiz_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM quizzes WHERE id = ?", (quiz_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        quiz = dict(row)
        quiz["exam_metadata"] = json.loads(quiz["exam_metadata"])
        quiz["quiz_data"] = json.loads(quiz["quiz_data"])
        return quiz
    return None

def get_quizzes_for_teacher(teacher_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, exam_metadata, created_at FROM quizzes WHERE teacher_id = ? ORDER BY id DESC", (teacher_id,))
    rows = cursor.fetchall()
    conn.close()
    quizzes = []
    for row in rows:
        quiz = dict(row)
        quiz["exam_metadata"] = json.loads(quiz["exam_metadata"])
        quizzes.append(quiz)
    return quizzes

def save_attempt(quiz_id, student_name, answers, results):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO attempts (quiz_id, student_name, answers, results) VALUES (?, ?, ?, ?)",
        (quiz_id, student_name, json.dumps(answers), json.dumps(results))
    )
    attempt_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return attempt_id

def get_attempts_for_quiz(quiz_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, student_name, results, created_at FROM attempts WHERE quiz_id = ? ORDER BY id DESC", (quiz_id,))
    rows = cursor.fetchall()
    conn.close()
    attempts = []
    for row in rows:
        attempt = dict(row)
        attempt["results"] = json.loads(attempt["results"])
        attempts.append(attempt)
    return attempts

def get_attempt_detail(attempt_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM attempts WHERE id = ?", (attempt_id,))
    row = cursor.fetchone()
    conn.close()
    if row:
        attempt = dict(row)
        attempt["answers"] = json.loads(attempt["answers"])
        attempt["results"] = json.loads(attempt["results"])
        return attempt
    return None

def update_user_profile(user_id, role, institution_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET role = ?, institution_name = ? WHERE id = ?",
        (role, institution_name, user_id)
    )
    conn.commit()
    conn.close()

# ==========================================
# 🌟 GAMIFICATION FUNCTIONS (UNTOUCHED)
# ==========================================
def create_challenge(creator_id, quiz_id, code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO challenges (code, creator_id, quiz_id) VALUES (?, ?, ?)", 
                   (code, creator_id, quiz_id))
    challenge_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return challenge_id

def get_challenge_by_code(code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM challenges WHERE code = ?", (code,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def record_challenge_participant(challenge_id, user_id, attempt_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM challenge_participants WHERE challenge_id = ? AND user_id = ?", (challenge_id, user_id))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO challenge_participants (challenge_id, user_id, attempt_id) VALUES (?, ?, ?)", 
                       (challenge_id, user_id, attempt_id))
        conn.commit()
    conn.close()

def get_challenge_leaderboard(challenge_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT u.name, a.results, cp.created_at
        FROM challenge_participants cp
        JOIN users u ON cp.user_id = u.id
        JOIN attempts a ON cp.attempt_id = a.id
        WHERE cp.challenge_id = ?
        ORDER BY a.id ASC
    ''', (challenge_id,))
    rows = cursor.fetchall()
    conn.close()
    
    leaderboard = []
    for row in rows:
        results = json.loads(row["results"])
        score_percent = (results["total_score"] / results["max_score"] * 100) if results["max_score"] > 0 else 0
        leaderboard.append({
            "name": row["name"],
            "score": f"{results['total_score']}/{results['max_score']}",
            "percentage": round(score_percent, 1),
            "date": row["created_at"]
        })
    leaderboard.sort(key=lambda x: x["percentage"], reverse=True)
    return leaderboard

def update_streak_and_badges(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    today_date = datetime.now().strftime('%Y-%m-%d')
    cursor.execute("SELECT * FROM streaks WHERE user_id = ?", (user_id,))
    streak_row = cursor.fetchone()
    
    if not streak_row:
        cursor.execute("INSERT INTO streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES (?, 1, 1, ?)", 
                       (user_id, today_date))
        cursor.execute("INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)", (user_id, "First Quiz 🎯"))
    else:
        last_date = streak_row["last_activity_date"]
        current = streak_row["current_streak"]
        longest = streak_row["longest_streak"]
        
        if last_date != today_date:
            last_date_obj = datetime.strptime(last_date, '%Y-%m-%d')
            today_obj = datetime.strptime(today_date, '%Y-%m-%d')
            diff = (today_obj - last_date_obj).days
            
            if diff == 1:
                current += 1
                if current > longest:
                    longest = current
            else:
                current = 1 
                
            cursor.execute("UPDATE streaks SET current_streak = ?, longest_streak = ?, last_activity_date = ? WHERE user_id = ?",
                           (current, longest, today_date, user_id))
            
            if current == 5:
                cursor.execute("INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)", (user_id, "5 Day Streak 🔥"))
    
    cursor.execute('''
        SELECT COUNT(a.id) as count 
        FROM attempts a 
        JOIN quizzes q ON a.quiz_id = q.id 
        WHERE q.teacher_id = ? OR a.student_name = (SELECT name FROM users WHERE id = ?)
    ''', (user_id, user_id))
    total_quizzes = cursor.fetchone()["count"]
    
    if total_quizzes == 5:
        cursor.execute("SELECT id FROM user_badges WHERE user_id = ? AND badge_name = ?", (user_id, "5 Quizzes Completed 📚"))
        if not cursor.fetchone():
            cursor.execute("INSERT INTO user_badges (user_id, badge_name) VALUES (?, ?)", (user_id, "5 Quizzes Completed 📚"))

    conn.commit()
    conn.close()

def get_user_gamification(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT current_streak, longest_streak FROM streaks WHERE user_id = ?", (user_id,))
    streak_row = cursor.fetchone()
    
    cursor.execute("SELECT badge_name, awarded_at FROM user_badges WHERE user_id = ? ORDER BY awarded_at DESC", (user_id,))
    badge_rows = cursor.fetchall()
    
    conn.close()
    
    return {
        "streak": dict(streak_row) if streak_row else {"current_streak": 0, "longest_streak": 0},
        "badges": [dict(b) for b in badge_rows]
    }

def create_flashcard(quiz_id, user_id, front, back, q_type):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM flashcards WHERE quiz_id = ? AND front = ?", (quiz_id, front))
    if not cursor.fetchone():
        cursor.execute("INSERT INTO flashcards (quiz_id, front, back, source_question_type) VALUES (?, ?, ?, ?)",
                       (quiz_id, front, back, q_type))
        flashcard_id = cursor.lastrowid
        
        today_date = datetime.now().strftime('%Y-%m-%d')
        cursor.execute("INSERT INTO flashcard_reviews (user_id, flashcard_id, next_review_date) VALUES (?, ?, ?)",
                       (user_id, flashcard_id, today_date))
    conn.commit()
    conn.close()

def get_due_flashcards(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    today_date = datetime.now().strftime('%Y-%m-%d')
    cursor.execute('''
        SELECT fr.flashcard_id, f.front, f.back, fr.repetition 
        FROM flashcard_reviews fr
        JOIN flashcards f ON fr.flashcard_id = f.id
        WHERE fr.user_id = ? AND fr.next_review_date <= ?
    ''', (user_id, today_date))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_flashcard_sm2(user_id, flashcard_id, quality):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM flashcard_reviews WHERE user_id = ? AND flashcard_id = ?", (user_id, flashcard_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return
        
    repetition = row["repetition"]
    interval = row["interval"]
    ease = row["ease_factor"]
    
    if quality >= 3:
        if repetition == 0:
            interval = 1
        elif repetition == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        repetition += 1
    else:
        repetition = 0
        interval = 1
        
    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease = max(1.3, ease) 
    
    from datetime import timedelta
    next_date = (datetime.now() + timedelta(days=interval)).strftime('%Y-%m-%d')
    
    cursor.execute('''
        UPDATE flashcard_reviews 
        SET next_review_date = ?, interval = ?, repetition = ?, ease_factor = ?
        WHERE user_id = ? AND flashcard_id = ?
    ''', (next_date, interval, repetition, ease, user_id, flashcard_id))
    
    conn.commit()
    conn.close()

# ==========================================
# 🏫 B2B / TEACHER PRO HELPER FUNCTIONS (NEW)
# ==========================================

def create_classroom(teacher_id, name, join_code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("INSERT INTO classrooms (teacher_id, name, join_code) VALUES (?, ?, ?)",
                   (teacher_id, name, join_code))
    class_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return class_id

def get_teacher_classrooms(teacher_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM classrooms WHERE teacher_id = ? ORDER BY created_at DESC", (teacher_id,))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def join_classroom(student_id, join_code):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM classrooms WHERE join_code = ?", (join_code,))
    classroom = cursor.fetchone()
    if not classroom:
        conn.close()
        return {"error": "Invalid Join Code"}
        
    class_id = classroom["id"]
    cursor.execute("SELECT id FROM classroom_students WHERE classroom_id = ? AND student_id = ?", (class_id, student_id))
    if cursor.fetchone():
        conn.close()
        return {"error": "Already joined"}
        
    cursor.execute("INSERT INTO classroom_students (classroom_id, student_id) VALUES (?, ?)", (class_id, student_id))
    conn.commit()
    conn.close()
    return {"success": True, "classroom_id": class_id}

def update_teacher_branding(teacher_id, academy_name, logo_path):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT teacher_id FROM teacher_branding WHERE teacher_id = ?", (teacher_id,))
    if cursor.fetchone():
        cursor.execute("UPDATE teacher_branding SET academy_name = ?, logo_path = ? WHERE teacher_id = ?",
                       (academy_name, logo_path, teacher_id))
    else:
        cursor.execute("INSERT INTO teacher_branding (teacher_id, academy_name, logo_path) VALUES (?, ?, ?)",
                       (teacher_id, academy_name, logo_path))
    conn.commit()
    conn.close()

def get_teacher_branding(teacher_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT academy_name, logo_path FROM teacher_branding WHERE teacher_id = ?", (teacher_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None