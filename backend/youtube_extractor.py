import os
import re
import tempfile
import glob
import requests
import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi
from dotenv import load_dotenv

load_dotenv()
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

def extract_video_id(url: str) -> str:
    match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11}).*", url)
    return match.group(1) if match else None

def transcribe_audio_with_groq(url: str, video_id: str) -> str:
    if not GROQ_API_KEY:
        return "Error: Subtitles are disabled and GROQ_API_KEY is missing for audio transcription fallback."

    temp_dir = tempfile.gettempdir()
    base_out_path = os.path.join(temp_dir, f"yt_audio_{video_id}")
    
    for f in glob.glob(f"{base_out_path}.*"):
        os.remove(f)

    print(f"🎧 Subtitles missing! Downloading audio for AI Transcription... ({video_id})")
    
    try:
        ydl_opts = {
            'format': 'worstaudio/worst',
            'outtmpl': f"{base_out_path}.%(ext)s",
            'quiet': True,
            'noplaylist': True
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        downloaded_files = glob.glob(f"{base_out_path}.*")
        if not downloaded_files:
            return "Error: Could not download audio for AI transcription."
        
        audio_file = downloaded_files[0]
        print(f"🎙️ Audio downloaded. Sending to Groq Whisper AI for transcription...")

        headers = {
            "Authorization": f"Bearer {GROQ_API_KEY}"
        }
        with open(audio_file, "rb") as f:
            files = {
                "file": (os.path.basename(audio_file), f),
                "model": (None, "whisper-large-v3") 
            }
            response = requests.post("https://api.groq.com/openai/v1/audio/transcriptions", headers=headers, files=files)

        os.remove(audio_file)

        if response.status_code == 200:
            result_text = response.json().get("text", "")
            if result_text.strip():
                print("✅ AI Transcription Complete!")
                return result_text
            else:
                return "Error: AI Transcription returned an empty result."
        else:
            return f"Error: AI Transcription API failed. Details: {response.text}"

    except Exception as e:
        return f"Error during AI Audio Transcription: {str(e)}"

# NAYA FEATURE: start_min aur end_min add kar diye gaye hain
def get_youtube_transcript(url: str, start_min: int = 0, end_min: int = 0) -> str:
    video_id = extract_video_id(url)
    if not video_id:
        return "Error: Invalid YouTube URL."
    
    try:
        yt_api = YouTubeTranscriptApi()
        transcript_obj = yt_api.fetch(video_id)
        
        chunks = getattr(transcript_obj, 'snippets', transcript_obj)
        text_parts = []
        
        for chunk in chunks:
            # Safely get start time in seconds
            start_sec = 0.0
            text = ""
            
            if hasattr(chunk, 'start'):
                start_sec = chunk.start
                text = chunk.text
            elif isinstance(chunk, dict):
                start_sec = chunk.get('start', 0.0)
                text = chunk.get('text', '')
                
            start_time_in_mins = start_sec / 60.0
            
            # Minute Filter Logic
            if end_min > 0:
                if start_time_in_mins >= start_min and start_time_in_mins <= end_min:
                    text_parts.append(text)
            else:
                if start_time_in_mins >= start_min:
                    text_parts.append(text)
                
        text = " ".join(text_parts)
        if not text.strip():
            return "Error: No speech found in the selected time range. Please adjust the minutes."
            
        print(f"✅ Found built-in YouTube subtitles (Time Range: {start_min}m to {end_min if end_min > 0 else 'End'}m).")
        return text
        
    except Exception as e:
        return transcribe_audio_with_groq(url, video_id)