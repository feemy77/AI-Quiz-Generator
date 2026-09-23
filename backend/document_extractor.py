import io
import os
import shutil
import pdfplumber
import docx
from PIL import Image
import pytesseract

def _configure_tesseract() -> bool:
    """Configures tesseract binary path if available and returns True, else False."""
    try:
        # Check standard Windows paths or environment variable
        if os.name == 'nt':
            if shutil.which('tesseract'):
                return True
            candidates = [
                os.environ.get('TESSERACT_PATH', ''),
                r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
                os.path.expanduser(r'~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'),
            ]
            for candidate in candidates:
                if candidate and os.path.exists(candidate):
                    pytesseract.pytesseract.tesseract_cmd = candidate
                    return True
            return False
        return bool(shutil.which('tesseract'))
    except Exception:
        return False

def get_document_page_count(file_bytes: bytes, filename: str) -> int:
    """PDFs ke pages aur PowerPoint presentations (.pptx, .ppt) ke slides count karta hai."""
    ext = filename.lower().split('.')[-1]
    if ext == 'pdf':
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                return len(pdf.pages)
        except Exception:
            return 1
    elif ext in ['pptx', 'ppt']:
        try:
            import pptx
            prs = pptx.Presentation(io.BytesIO(file_bytes))
            return len(prs.slides)
        except Exception:
            return 1
    return 1 

def extract_text_from_document(file_bytes: bytes, filename: str, start_page: int = 1, end_page: int = 1000) -> str:
    ext = filename.lower().split('.')[-1]
    
    # 1. Handle PDF Files (with smart Scanned PDF OCR fallback)
    if ext == 'pdf':
        try:
            extracted_text = ""
            tesseract_ready = _configure_tesseract()
            scanned_pages_detected = 0

            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                total_pages = len(pdf.pages)
                start_idx = max(0, start_page - 1)
                end_idx = min(total_pages, end_page)
                for i in range(start_idx, end_idx):
                    page = pdf.pages[i]
                    text = page.extract_text()
                    
                    # If page has digital selectable text, use it
                    if text and len(text.strip()) > 30:
                        extracted_text += text.strip() + "\n\n"
                    else:
                        # Scanned page or minimal text -> Attempt OCR fallback
                        if tesseract_ready:
                            try:
                                page_img = page.to_image(resolution=200).original
                                ocr_text = pytesseract.image_to_string(page_img)
                                if ocr_text and ocr_text.strip():
                                    extracted_text += ocr_text.strip() + "\n\n"
                                    scanned_pages_detected += 1
                                elif text and text.strip():
                                    extracted_text += text.strip() + "\n\n"
                            except Exception:
                                if text and text.strip():
                                    extracted_text += text.strip() + "\n\n"
                        else:
                            if text and text.strip():
                                extracted_text += text.strip() + "\n\n"
                            else:
                                scanned_pages_detected += 1

            if extracted_text.strip():
                return extracted_text.strip()
            
            if scanned_pages_detected > 0 and not tesseract_ready:
                return "Error: No selectable text found in PDF. This appears to be a scanned document. Please install Tesseract-OCR or upload a text-based PDF/Word document."

            return "Error: No text found in PDF."
        except Exception as e:
            return f"Error extracting PDF: {str(e)}"
            
    # 2. Handle PowerPoint Presentations (.pptx, .ppt)
    elif ext in ['pptx', 'ppt']:
        try:
            import pptx
            prs = pptx.Presentation(io.BytesIO(file_bytes))
            total_slides = len(prs.slides)
            if total_slides == 0:
                return "Error: PowerPoint presentation contains no slides."

            start_idx = max(0, start_page - 1)
            end_idx = min(total_slides, end_page)

            substantive_slides = []
            all_slides = []
            for slide_idx in range(start_idx, end_idx):
                slide = prs.slides[slide_idx]
                slide_num = slide_idx + 1
                slide_lines = []

                # Extract text from all shapes in slide
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        for paragraph in shape.text_frame.paragraphs:
                            line = paragraph.text.strip()
                            if line and line not in slide_lines:
                                slide_lines.append(line)
                    elif shape.has_table:
                        for row in shape.table.rows:
                            row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                            if row_text and row_text not in slide_lines:
                                slide_lines.append(row_text)

                # Extract speaker notes if available
                if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                    notes = slide.notes_slide.notes_text_frame.text.strip()
                    if notes:
                        slide_lines.append(f"[Speaker Notes]: {notes}")

                if slide_lines:
                    slide_block = f"--- Slide {slide_num} ---\n" + "\n".join(slide_lines)
                    all_slides.append(slide_block)

                    # Smart filtering: Skip title/front-page, agenda, and closing slides
                    if not _is_front_or_meta_slide(slide_lines, slide_idx, total_slides):
                        substantive_slides.append(slide_block)

            # Prefer substantive core topic slides; fall back to all slides if entire deck was minimal
            extracted_slides = substantive_slides if len(substantive_slides) >= 1 else all_slides

            if not extracted_slides:
                return "Error: No text content detected in PowerPoint slides. The slides may contain only graphic images."

            return "\n\n".join(extracted_slides)
        except Exception as e:
            return f"Error reading PowerPoint presentation: {str(e)}"

    # 3. Handle MS Word Files (.docx, .doc)
    elif ext in ['docx', 'doc']:
        try:
            doc = docx.Document(io.BytesIO(file_bytes))
            parts = []
            for para in doc.paragraphs:
                p_text = para.text.strip()
                if p_text:
                    parts.append(p_text)
            
            # Extract content from tables within Word document
            for table in doc.tables:
                for row in table.rows:
                    row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                    if row_text and row_text not in parts:
                        parts.append(row_text)

            text = "\n\n".join(parts)
            if text.strip():
                return text.strip()
        except Exception:
            # Fallback for legacy binary .doc files
            fallback = _extract_clean_binary_strings(file_bytes)
            if len(fallback) > 50:
                return fallback

        # If docx reading returned empty or failed
        fallback = _extract_clean_binary_strings(file_bytes)
        return fallback if len(fallback) > 50 else "Error: Word document contains no readable text."

    # 4. Handle RTF Files (.rtf)
    elif ext == 'rtf':
        try:
            raw_content = file_bytes.decode('utf-8', errors='ignore')
            clean = _strip_rtf(raw_content)
            return clean if clean.strip() else "Error: RTF file contains no readable text."
        except Exception as e:
            return f"Error reading RTF file: {str(e)}"

    # 5. Handle Plain Text, Markdown, CSV, TSV, and Tabular Files (.txt, .text, .md, .markdown, .csv, .tsv, .json)
    elif ext in ['txt', 'text', 'md', 'markdown', 'csv', 'tsv', 'json']:
        try:
            return file_bytes.decode('utf-8', errors='ignore').strip()
        except Exception as e:
            return f"Error reading text file: {str(e)}"

    # 6. Handle Images via OCR (Optical Character Recognition)
    elif ext in ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tiff']:
        try:
            tesseract_ready = _configure_tesseract()
            if not tesseract_ready:
                return "Error: Tesseract OCR is not installed or not found in system path. Please install Tesseract-OCR to extract text from images."
                
            image = Image.open(io.BytesIO(file_bytes))
            text = pytesseract.image_to_string(image)
            return text.strip() if text else "Error: No text detected in image."
        except Exception as e:
            return f"Error: OCR failed. Details: {str(e)}"
    
    else:
        # Fallback: attempt decoding as text before rejecting
        try:
            candidate = file_bytes.decode('utf-8', errors='ignore').strip()
            if len(candidate) > 40 and not any(ord(c) < 9 and ord(c) not in (0, 9, 10, 13) for c in candidate[:100]):
                return candidate
        except Exception:
            pass
        return f"Error: Unsupported file type (.{ext}). Please upload PPTX/PPT, PDF, DOCX/DOC, RTF, TXT, MD, or Image."


def _strip_rtf(rtf_text: str) -> str:
    """Basic RTF tag stripper removing control words and group markers."""
    import re
    # Remove RTF control words (\tag or \tag123)
    text = re.sub(r'\\[a-zA-Z]+(-?\d+)? ?', ' ', rtf_text)
    # Remove group braces
    text = text.replace('{', '').replace('}', '')
    # Clean up whitespace
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return "\n\n".join(lines)


def _extract_clean_binary_strings(file_bytes: bytes, min_len: int = 5) -> str:
    """Extracts readable ASCII/UTF-8 strings from binary office files (.doc, .ppt)."""
    import re
    # Extract ASCII strings
    ascii_strings = re.findall(rb'[A-Za-z0-9\s.,;:?!()\'"-]{' + str(min_len).encode() + rb',}', file_bytes)
    extracted = []
    for s in ascii_strings:
        try:
            decoded = s.decode('ascii').strip()
            # Filter out common binary header garbage
            if len(decoded) >= min_len and not decoded.startswith(('Root Entry', 'Workbook', 'CompObj', 'SummaryInformation')):
                extracted.append(decoded)
        except Exception:
            continue
    return "\n".join(extracted)


def _is_front_or_meta_slide(lines: list, slide_idx: int, total_slides: int) -> bool:
    """
    Detects whether a slide is purely title front-matter, instructor/university metadata,
    agenda/table of contents, grading policy, or concluding Q&A/thank-you slide.
    Ensures question generation focuses 100% on core technical topics.
    """
    if not lines or total_slides <= 2:
        return False
        
    full_text = " ".join(lines).lower().strip()
    words = full_text.split()
    num_words = len(words)
    first_line = lines[0].lower().strip() if lines else ""

    # 1. First Slide (Slide 1): Title / Cover / Instructor info
    if slide_idx == 0:
        meta_markers = [
            "instructor", "lecturer", "dr.", "prof.", "department of", "faculty of",
            "university", "semester", "session", "fall 20", "spring 20", "course code",
            "presented by", "prepared by", "uiit", "arid", "course title"
        ]
        marker_hits = sum(1 for m in meta_markers if m in full_text)
        if num_words <= 45 and (marker_hits >= 1 or "lecture" in full_text):
            return True

    # 2. Early Slides (Slide 1 or 2): Agenda / Outline / Table of Contents / Course Policies
    if slide_idx in (0, 1, 2):
        outline_titles = [
            "agenda", "today's agenda", "lecture agenda", "outline", "lecture outline",
            "table of contents", "contents", "topics to be covered", "topics covered",
            "course outline", "objectives", "learning objectives", "prerequisites",
            "grading policy", "marking criteria", "course guidelines"
        ]
        if any(first_line == t or first_line.startswith(t + ":") or first_line.startswith(t + " -") for t in outline_titles):
            return True
        if num_words <= 30 and any(t in full_text for t in ["table of contents", "today's agenda", "lecture outline", "grading policy"]):
            return True

    # 3. Final Slides (Last 1 or 2 slides): Thank you / Questions / References
    if slide_idx >= total_slides - 2:
        concluding_markers = [
            "thank you", "thanks!", "any questions", "questions?", "q&a", "q & a",
            "questions and answers", "references", "bibliography", "recommended books",
            "further reading", "end of lecture", "the end"
        ]
        if any(m in full_text for m in concluding_markers) and num_words <= 35:
            return True

    return False