import yt_dlp
import os
import tempfile
import subprocess
from openai import OpenAI
from concurrent.futures import ThreadPoolExecutor
import logging
from typing import List, Optional
from llama_index.core import Document, VectorStoreIndex
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.ingestion import IngestionPipeline
from llama_index.core.retrievers import VectorIndexRetriever
from llama_index.embeddings.openai import OpenAIEmbedding

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))
if not client.api_key:
    raise ValueError("OPENAI_API_KEY environment variable not set")

def get_audio_duration(input_file: str) -> float:
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", input_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        return float(result.stdout.strip())
    except subprocess.CalledProcessError as e:
        logger.error(f"Error getting audio duration: {e.stderr}")
        raise

def extract_audio(video_url: str) -> Optional[str]:
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as temp_file:
        temp_path = temp_file.name
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'outtmpl': temp_path.replace('.mp3', '.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
        }],
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        return temp_path
    except Exception as e:
        logger.error(f"Error extracting audio: {e}")
        if os.path.exists(temp_path):
            os.remove(temp_path)
        return None

def split_audio_with_overlap(input_file: str, output_dir: str) -> List[str]:
    try:
        duration = get_audio_duration(input_file)
    except Exception as e:
        logger.error(f"Failed to get audio duration: {e}")
        return []
    
    chunks = []
    start = 0.0
    index = 0
    os.makedirs(output_dir, exist_ok=True)
    
    while start < duration:
        chunk_path = os.path.join(output_dir, f"chunk_{index:03d}.mp3")
        ffmpeg_cmd = [
            "ffmpeg",
            "-ss", str(start),
            "-i", input_file,
            "-t", "600",
            "-c:a", "libmp3lame",
            "-y",
            chunk_path
        ]
        try:
            subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
            chunks.append(chunk_path)
            index += 1
            start += 590  # 600s chunk with 10s overlap
        except subprocess.CalledProcessError as e:
            logger.error(f"Error creating chunk {index}: {e.stderr.decode()}")
            break
    return chunks

def transcribe_chunk(chunk_file: str) -> str:
    for attempt in range(3):
        try:
            with open(chunk_file, "rb") as audio_file:
                return client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    response_format="text"
                )
        except Exception as e:
            if attempt == 2:
                logger.error(f"Failed to transcribe {chunk_file}: {e}")
                return ""
            logger.warning(f"Retrying {chunk_file} (attempt {attempt + 1})")

def combine_transcripts(transcripts: List[str]) -> str:
    final = transcripts[0]
    for next_transcript in transcripts[1:]:
        overlap_point = find_overlap(final, next_transcript)
        final = final[:-overlap_point] + next_transcript if overlap_point else final + " " + next_transcript
    return final

def find_overlap(a: str, b: str) -> int:
    a_words = a.split()
    b_words = b.split()
    max_possible = min(len(a_words), len(b_words))
    for overlap in range(min(50, max_possible), 0, -1):
        if a_words[-overlap:] == b_words[:overlap]:
            return overlap
    return 0

def build_rag_pipeline(transcript_text: str):
    doc = Document(text=transcript_text)
    embed_model = OpenAIEmbedding(model="text-embedding-3-large")
    
    # Configure settings for consistent parameters
    from llama_index.core import Settings
    Settings.embed_model = embed_model
    Settings.node_parser = SentenceSplitter(
        chunk_size=256, 
        chunk_overlap=32
    )
    
    # Create pipeline with proper configuration
    pipeline = IngestionPipeline(
        transformations=[
            Settings.node_parser,
            embed_model
        ]
    )
    nodes = pipeline.run(documents=[doc])
    
    # Create index with vector store
    index = VectorStoreIndex(nodes)
    
    # Create simple vector retriever instead of using BM25
    vector_retriever = index.as_retriever(similarity_top_k=5)
    
    return {
        "index": index,
        "retrievers": {
            "vector": vector_retriever,
            "fallback": vector_retriever  # Using vector retriever twice in place of BM25
        }
    }

def process_video(video_url: str) -> dict:
    with tempfile.TemporaryDirectory() as chunk_dir:
        audio_path = extract_audio(video_url)
        chunks = split_audio_with_overlap(audio_path, chunk_dir)
        with ThreadPoolExecutor() as executor:
            transcripts = list(executor.map(transcribe_chunk, chunks))
        final_transcript = combine_transcripts([t for t in transcripts if t.strip()])
        
    rag_pipeline = build_rag_pipeline(final_transcript)
    return {
        "transcript": final_transcript,
        "index": rag_pipeline["index"],
        "retrievers": rag_pipeline["retrievers"]
    }