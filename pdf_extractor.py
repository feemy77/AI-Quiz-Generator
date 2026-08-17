import pdfplumber
import re

def _looks_like_cover_or_title_page(text: str) -> bool:
    if not text:
        return True
    word_count = len(text.split())
    if word_count > 120:
        return False
    keywords = [
        "compiled by", "prepared by", "written by", "author",
        "www.", "http://", "https://", ".tk", ".com",
        "class xii", "class 12", "notes by", "all rights reserved",
        "copyright", "dedicated to", "acknowledg",
    ]
    lowered = text.lower()
    keyword_hits = sum(1 for kw in keywords if kw in lowered)
    return keyword_hits >= 1

def get_pdf_page_count(pdf_file) -> int:
    """Naya function jo sirf total pages count karta hay frontend kay liye"""
    try:
        with pdfplumber.open(pdf_file) as pdf:
            return len(pdf.pages)
    except Exception as e:
        raise ValueError(f"Could not read PDF: {str(e)}")

def extract_text_from_pdf(pdf_file, skip_cover_pages: bool = True, start_page: int = 1, end_page: int = 1000) -> str:
    extracted_text = ""
    try:
        with pdfplumber.open(pdf_file) as pdf:
            total_pages = len(pdf.pages)
            
            # 1-based indexing ko 0-based mn convert kro
            start_idx = max(0, start_page - 1)
            end_idx = min(total_pages, end_page)
            
            if start_idx >= total_pages or start_idx >= end_idx:
                return f"Error: Invalid page range. This PDF only has {total_pages} pages."

            pages_kept = 0
            for i in range(start_idx, end_idx):
                page = pdf.pages[i]
                text = page.extract_text()
                if not text:
                    continue

                if skip_cover_pages and start_idx == 0 and pages_kept == 0 and i < 3 and _looks_like_cover_or_title_page(text):
                    continue

                pages_kept += 1
                extracted_text += text.replace('\n', ' ') + " "

        result = extracted_text.strip()
        if not result:
            return "Error: No extractable text found in the selected pages."
        return result
    except Exception as e:
        return f"Error: {str(e)}"