# 1. Base Image (Python)
FROM python:3.10-slim

# 2. Install Tesseract OCR (For your Snap & Quiz feature)
RUN apt-get update && apt-get install -y tesseract-ocr libtesseract-dev

# 3. Setup Working Directory
WORKDIR /app

# 4. Copy and Install Requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 5. Copy your whole backend code
COPY . .

# 6. Run the FastAPI App (Back4App Port 7860)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]