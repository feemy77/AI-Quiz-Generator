import io
import pdfplumber
import docx
from PIL import Image
import pytesseract
import os

def get_document_page_count(file_bytes: bytes, filename: str) -> int:
    """PDFs ke pages count karta hai. Baqi files (Word, TXT, Images) ko 1 page consider karta hai."""
    ext = filename.lower().split('.')[-1]
    if ext == 'pdf':
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return len(pdf.pages)
        except Exception:
            return 1
    return 1 

def extract_text_from_document(file_bytes: bytes, filename: str, start_page: int = 1, end_page: int = 1000) -> str:
    ext = filename.lower().split('.')[-1]
    
    # 1. Handle PDF Files
    if ext == 'pdf':
        try:
            extracted_text = ""
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                total_pages = len(pdf.pages)
                start_idx = max(0, start_page - 1)
                end_idx = min(total_pages, end_page)
                for i in range(start_idx, end_idx):
                    page = pdf.pages[i]
                    text = page.extract_text()
                    if text:
                        extracted_text += text + " "
            return extracted_text.strip() if extracted_text else "Error: No text found in PDF."
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"
            
    # 2. Handle MS Word Files (.docx)
    elif ext in ['docx', 'doc']:
        try:
            doc = docx.Document(io.BytesIO(file_bytes))
            text = " ".join([para.text for para in doc.paragraphs])
            return text.strip() if text else "Error: Word document is empty."
        except Exception as e:
            return f"Error reading Word document: {str(e)}"
            
    # 3. Handle Plain Text Files (.txt)
    elif ext == 'txt':
        try:
            return file_bytes.decode('utf-8').strip()
        except Exception as e:
            return f"Error reading text file: {str(e)}"
            
    # 4. Handle Images via OCR (Optical Character Recognition)
    elif ext in ['png', 'jpg', 'jpeg']:
        try:
            # Note for Windows users: Tesseract needs to be installed on Windows.
            if os.name == 'nt':
                pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
                
            image = Image.open(io.BytesIO(file_bytes))
            text = pytesseract.image_to_string(image)
            return text.strip() if text else "Error: No text detected in image."
        except Exception as e:
            return f"Error: OCR failed. Ensure Tesseract is installed on your PC. Details: {str(e)}"
    
    else:
        return f"Error: Unsupported file type (.{ext}). Please upload PDF, DOCX, TXT, or Image."