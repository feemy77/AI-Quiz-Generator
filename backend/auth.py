"""
Simple auth: PBKDF2 password hashing + opaque session tokens.

No external dependency (no bcrypt/JWT library) so this runs anywhere Python
runs. For a large production deployment, swapping to `passlib` (bcrypt) and
real JWTs is a reasonable upgrade, but this is secure enough for an MVP/college
project — PBKDF2-SHA256 with a per-user random salt and 100k iterations.
"""

import hashlib
import secrets

_ITERATIONS = 100_000


def hash_password(password: str, salt: str = None) -> tuple[str, str]:
    """Returns (password_hash, salt). Generates a new salt if none is given."""
    if salt is None:
        salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), _ITERATIONS)
    return digest.hex(), salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    candidate_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(candidate_hash, password_hash)


def generate_token() -> str:
    return secrets.token_urlsafe(32)