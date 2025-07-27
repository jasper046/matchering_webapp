from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List, Optional
from urllib.parse import unquote
import os
import shutil
import uuid
import time
import matchering as mg
from matchering.limiter import limit
import numpy as np
import soundfile as sf
import atexit
import logging
import torch
from audio_separator.separator import Separator
import sys
import uvicorn
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from io import BytesIO
import hashlib

# --- PyInstaller-aware path helpers ---
def get_base_dir():
    """Get the base directory, whether running from source or bundled."""
    if getattr(sys, 'frozen', False):
        # Running in a PyInstaller bundle
        return sys._MEIPASS
    else:
        # Running as a normal script
        return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def get_model_dir():
    """Get the model directory, whether running from source or bundled."""
    if getattr(sys, 'frozen', False):
        # In the bundle, models are in the 'models' subdirectory
        return os.path.join(sys._MEIPASS, 'models')
    else:
        # In development, models are in the 'models' subdirectory of the project root
        return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'models')

# --- FastAPI App Initialization ---
from fastapi.middleware.cors import CORSMiddleware
app = FastAPI()

# Add CORS middleware to allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get the base directory for the application
BASE_DIR = get_base_dir()

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "app", "static")), name="static")

# Configure Jinja2Templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "app", "templates"))

# Create standard directories for uploads, presets, and outputs
# When running as an executable, these should be in a user-writable location.
# For simplicity, we'll create them in the user's home directory.
if getattr(sys, 'frozen', False):
    HOME_DIR = os.path.expanduser("~")
    UPLOAD_DIR = os.path.join(HOME_DIR, "MatcheringWebApp", "uploads")
    PRESET_DIR = os.path.join(HOME_DIR, "MatcheringWebApp", "presets")
    OUTPUT_DIR = os.path.join(HOME_DIR, "MatcheringWebApp", "outputs")
else:
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
    PRESET_DIR = os.path.join(BASE_DIR, "presets")
    OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")


# Create directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PRESET_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Waveform generation functions
def generate_dummy_waveform(width=800, height=120):
    """Generate a dummy waveform (flat line) as PNG bytes"""
    fig, ax = plt.subplots(figsize=(width/100, height/100), dpi=100)
    fig.patch.set_facecolor('#2c2c2c')
    ax.set_facecolor('#2c2c2c')
    
    # Draw flat line
    x = np.linspace(0, 1, 1000)
    y = np.zeros(1000)
    ax.plot(x, y, color='#007bff', linewidth=1)
    
    # Style
    ax.set_xlim(0, 1)
    ax.set_ylim(-1, 1)
    ax.axis('off')
    
    # Save to bytes
    buf = BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0, 
                facecolor='#2c2c2c', transparent=False)
    plt.close(fig)
    buf.seek(0)
    return buf.getvalue()

def generate_waveform_png(original_path, processed_path, width=800, height=120):
    """Generate waveform PNG showing original (top) and processed (bottom)"""
    try:
        # Load audio files
        original_audio, sr_orig = sf.read(original_path)
        processed_audio, sr_proc = sf.read(processed_path)
        
        # Convert to mono if stereo
        if original_audio.ndim > 1:
            original_audio = np.mean(original_audio, axis=1)
        if processed_audio.ndim > 1:
            processed_audio = np.mean(processed_audio, axis=1)
        
        # Downsample for visualization using proper averaging
        target_samples = width * 2  # 2 samples per pixel
        
        def downsample_audio(audio, target_length):
            if len(audio) <= target_length:
                return audio
            
            # Calculate window size for peak detection
            window_size = len(audio) // target_length
            remainder = len(audio) % target_length
            
            # Reshape and take peak values
            truncated_length = target_length * window_size
            reshaped = audio[:truncated_length].reshape(target_length, window_size)
            
            # Take peak values (better for waveform visualization)
            # For each window, find the value with maximum absolute value
            abs_reshaped = np.abs(reshaped)
            max_indices = np.argmax(abs_reshaped, axis=1)
            downsampled = reshaped[np.arange(target_length), max_indices]
            
            return downsampled
        
        original_audio = downsample_audio(original_audio, target_samples)
        processed_audio = downsample_audio(processed_audio, target_samples)
        
        # Normalize
        original_audio = original_audio / (np.max(np.abs(original_audio)) + 1e-8)
        processed_audio = processed_audio / (np.max(np.abs(processed_audio)) + 1e-8)
        
        # Create plot
        fig, ax = plt.subplots(figsize=(width/100, height/100), dpi=100)
        fig.patch.set_facecolor('#2c2c2c')
        ax.set_facecolor('#2c2c2c')
        
        # Make sure both audio arrays are the same length for unified display
        min_length = min(len(original_audio), len(processed_audio))
        original_audio = original_audio[:min_length]
        processed_audio = processed_audio[:min_length]
        
        # Time axis
        time = np.linspace(0, 1, min_length)
        
        # Create unified waveform: positive half = original, negative half = processed
        # Take absolute values and assign to positive/negative domains
        original_positive = np.abs(original_audio)  # Original in positive half
        processed_negative = -np.abs(processed_audio)  # Processed in negative half
        
        # Plot original audio in positive half (green)
        ax.plot(time, original_positive, color='#28a745', linewidth=0.8, alpha=0.9, label='Original')
        ax.fill_between(time, 0, original_positive, color='#28a745', alpha=0.4)
        
        # Plot processed audio in negative half (blue)
        ax.plot(time, processed_negative, color='#007bff', linewidth=0.8, alpha=0.9, label='Processed')
        ax.fill_between(time, 0, processed_negative, color='#007bff', alpha=0.4)
        
        # Center line
        ax.axhline(y=0, color='#666', linewidth=1, alpha=0.7)
        
        # Style
        ax.set_xlim(0, 1)
        ax.set_ylim(-1, 1)
        ax.axis('off')
        
        # Save to bytes
        buf = BytesIO()
        plt.savefig(buf, format='png', bbox_inches='tight', pad_inches=0, 
                    facecolor='#2c2c2c', transparent=False)
        plt.close(fig)
        buf.seek(0)
        return buf.getvalue()
        
    except Exception as e:
        print(f"Error generating waveform: {e}")
        return generate_dummy_waveform(width, height)

def cleanup_directory_contents(directory_path: str, preserve_files: list = None):
    """Clean up directory contents, optionally preserving specific files"""
    if not os.path.exists(directory_path):
        return
    
    preserve_files = preserve_files or []
    
    for item in os.listdir(directory_path):
        item_path = os.path.join(directory_path, item)
        
        # Skip preserved files
        if item in preserve_files:
            continue
            
        try:
            if os.path.isfile(item_path):
                os.remove(item_path)
            elif os.path.isdir(item_path):
                shutil.rmtree(item_path)
        except Exception as e:
            logging.warning(f"Failed to remove {item_path}: {e}")

def cleanup_all_temp_directories():
    """Clean up all temporary directories on startup"""
    logging.info("Cleaning up temporary directories on startup...")
    cleanup_directory_contents(UPLOAD_DIR)
    cleanup_directory_contents(OUTPUT_DIR)
    # Keep presets as they might be valuable to users
    logging.info("Startup cleanup completed")

def cleanup_processing_files(preserve_files: list = None):
    """Clean up processing files, preserving specified files"""
    preserve_files = preserve_files or []
    cleanup_directory_contents(UPLOAD_DIR, preserve_files)
    # Don't clean OUTPUT_DIR during processing as files might be in use

# Perform startup cleanup
cleanup_all_temp_directories()

# Initialize the audio separator
use_cuda = torch.cuda.is_available()
model_dir = get_model_dir()
separator = Separator(log_level=logging.INFO, model_file_dir=model_dir, output_dir=OUTPUT_DIR)

# Import our new audio processing modules
from .audio.channel_processor import process_channel
from .audio.master_limiter import process_limiter
from .audio.utils import generate_temp_path, ensure_directory, cleanup_file

# Import frame processing API
try:
    from .api.frame_endpoints import frame_router
    FRAME_API_AVAILABLE = True
except ImportError as e:
    logging.warning(f"Frame processing API not available: {e}")
    FRAME_API_AVAILABLE = False

# Include frame processing router if available
if FRAME_API_AVAILABLE:
    app.include_router(frame_router)
    logging.info("Frame processing API endpoints enabled")

# In-memory storage for batch job statuses
batch_jobs = {}

# In-memory storage for processing progress
processing_progress = {}

# In-memory storage for active jobs to prevent duplicates
active_jobs = set()

def start_job(job_id: str, job_type: str, file_hash: str = None) -> bool:
    """
    Start a new job if not already running.
    Returns True if job started, False if duplicate.
    """
    # Create unique key for duplicate detection
    job_key = f"{job_type}_{file_hash}" if file_hash else job_id
    
    if job_key in active_jobs:
        return False
    
    active_jobs.add(job_key)
    processing_progress[job_id] = {
        "stage": "starting",
        "message": f"Starting {job_type}...",
        "progress": 0,
        "job_key": job_key
    }
    return True

def finish_job(job_id: str):
    """Clean up job tracking when complete"""
    if job_id in processing_progress:
        job_key = processing_progress[job_id].get("job_key")
        if job_key and job_key in active_jobs:
            active_jobs.remove(job_key)

def get_file_hash(file_content: bytes) -> str:
    """Generate a hash for file content to detect duplicates"""
    return hashlib.md5(file_content).hexdigest()[:16]

def extract_loudest_segment(audio_path: str, segment_duration: float = 30.0, sample_rate: int = 44100) -> str:
    """
    Extract the loudest segment from audio file, similar to matchering's approach.
    
    Args:
        audio_path: Path to the audio file
        segment_duration: Duration of the segment to extract in seconds
        sample_rate: Sample rate for processing
    
    Returns:
        Path to the extracted segment file
    """
    # Load the audio file
    audio, sr = sf.read(audio_path)
    
    # Convert to mono for analysis if stereo
    if audio.ndim > 1:
        audio_mono = np.mean(audio, axis=1)
    else:
        audio_mono = audio
    
    # Calculate segment size in samples
    segment_size = int(segment_duration * sr)
    
    # If audio is shorter than segment duration, return the whole file
    if len(audio_mono) <= segment_size:
        return audio_path
    
    # Calculate RMS for overlapping windows
    hop_size = segment_size // 4  # 75% overlap
    max_rms = 0
    best_start = 0
    
    for start in range(0, len(audio_mono) - segment_size, hop_size):
        end = start + segment_size
        segment = audio_mono[start:end]
        rms = np.sqrt(np.mean(segment ** 2))
        
        if rms > max_rms:
            max_rms = rms
            best_start = start
    
    # Extract the loudest segment from the original audio (preserve channels)
    best_end = best_start + segment_size
    if audio.ndim > 1:
        loudest_segment = audio[best_start:best_end]
    else:
        loudest_segment = audio[best_start:best_end]
    
    # Save the segment to a temporary file
    segment_filename = f"loudest_segment_{uuid.uuid4()}.wav"
    segment_path = os.path.join(OUTPUT_DIR, segment_filename)
    sf.write(segment_path, loudest_segment, sr)
    
    return segment_path

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return templates.TemplateResponse("index.html", {"request": {}})

@app.get("/api/system_info")
async def get_system_info():
    """Get system information including GPU/CPU status"""
    return {
        "cuda_available": torch.cuda.is_available(),
        "device_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU",
        "processing_mode": "GPU" if torch.cuda.is_available() else "CPU"
    }

@app.get("/api/progress/{job_id}")
async def get_progress(job_id: str):
    """Get processing progress for a job"""
    if job_id not in processing_progress:
        raise HTTPException(status_code=404, detail="Job not found")
    progress_data = processing_progress[job_id]
    return progress_data

@app.post("/api/create_preset")
async def create_preset(reference_file: UploadFile = File(...)):
    # Read file content for duplicate detection
    content = await reference_file.read()
    reference_file.file.seek(0)  # Reset file pointer
    
    # Generate file hash and check for duplicates
    file_hash = get_file_hash(content)
    job_id = str(uuid.uuid4())
    
    if not start_job(job_id, "create_preset", file_hash):
        raise HTTPException(status_code=429, detail="Preset creation already in progress for this file")
    
    # Clean up processing files, preserving the current upload
    cleanup_processing_files([reference_file.filename])
    
    original_filename_base = os.path.splitext(reference_file.filename)[0]
    file_location = os.path.join(UPLOAD_DIR, reference_file.filename)
    with open(file_location, "wb") as f:
        f.write(content)

    preset_filename = f"{uuid.uuid4()}.pkl"
    preset_path = os.path.join(PRESET_DIR, preset_filename)

    try:
        mg.analyze_reference_track(reference=file_location, preset_path=preset_path)
        return {"message": "Preset created successfully", "preset_path": preset_path, "suggested_filename": f"{original_filename_base}.pkl"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        finish_job(job_id)
        os.remove(file_location)


@app.post("/api/process_stems")
async def process_stems(
    target_file: UploadFile = File(...),
    vocal_preset_file: UploadFile = File(...),
    instrumental_preset_file: UploadFile = File(...),
):
    target_path = os.path.join(UPLOAD_DIR, target_file.filename)
    with open(target_path, "wb") as f:
        shutil.copyfileobj(target_file.file, f)

    vocal_preset_path = os.path.join(UPLOAD_DIR, vocal_preset_file.filename)
    with open(vocal_preset_path, "wb") as f:
        shutil.copyfileobj(vocal_preset_file.file, f)

    instrumental_preset_path = os.path.join(UPLOAD_DIR, instrumental_preset_file.filename)
    with open(instrumental_preset_path, "wb") as f:
        shutil.copyfileobj(instrumental_preset_file.file, f)

    try:
        # Separate the audio into vocals and instrumentals
        separator.load_model(model_filename="UVR-MDX-NET-Voc_FT.onnx")
        primary_stem_path, secondary_stem_path = separator.separate(target_path)

        # Process the vocal stem
        processed_vocal_path = os.path.join(OUTPUT_DIR, f"processed_vocals_{uuid.uuid4()}.wav")
        mg.process_with_preset(
            target=primary_stem_path,
            preset_path=vocal_preset_path,
            results=[mg.pcm24(processed_vocal_path)]
        )

        # Process the instrumental stem
        processed_instrumental_path = os.path.join(OUTPUT_DIR, f"processed_instrumentals_{uuid.uuid4()}.wav")
        mg.process_with_preset(
            target=secondary_stem_path,
            preset_path=instrumental_preset_path,
            results=[mg.pcm24(processed_instrumental_path)]
        )

        # Combine the processed stems
        vocal_audio, sr = sf.read(processed_vocal_path)
        instrumental_audio, _ = sf.read(processed_instrumental_path)

        # Ensure both audio files have the same length
        min_len = min(len(vocal_audio), len(instrumental_audio))
        vocal_audio = vocal_audio[:min_len]
        instrumental_audio = instrumental_audio[:min_len]

        combined_audio = vocal_audio + instrumental_audio

        combined_filename = f"combined_{uuid.uuid4()}.wav"
        combined_path = os.path.join(OUTPUT_DIR, combined_filename)
        sf.write(combined_path, combined_audio, sr)

        return {
            "message": "Stem processing completed successfully",
            "combined_file_path": combined_path,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.remove(target_path)
        os.remove(vocal_preset_path)
        os.remove(instrumental_preset_path)


def process_stems_with_presets_sync(
    target_path: str,
    vocal_preset_path: str,
    instrumental_preset_path: str,
    job_id: str
):
    """Synchronous background task for stem processing with preset files"""
    print(f"Background task started for job_id: {job_id}")
    try:
        # Update progress: Loading model
        processing_progress[job_id].update({
            "stage": "loading_model",
            "progress": 10,
            "message": "(10%) Loading audio separation model..."
        })
        
        # Separate the target file into vocal and instrumental stems
        separator.load_model(model_filename="UVR-MDX-NET-Voc_FT.onnx")
        
        # Update progress: Separating target
        processing_progress[job_id].update({
            "stage": "separating_target",
            "progress": 25,
            "message": "(25%) Separating target audio into vocal and instrumental stems..."
        })
        
        # Use progress interceptor for real-time updates during separation
        with ProgressInterceptor(job_id, "separating_target", 25, 50):
            separator.separate(target_path)
        
        # Construct paths for separated target files
        target_base = os.path.splitext(os.path.basename(target_path))[0]
        target_vocal_path = os.path.join(OUTPUT_DIR, f"{target_base}_(Vocals)_UVR-MDX-NET-Voc_FT.wav")
        target_instrumental_path = os.path.join(OUTPUT_DIR, f"{target_base}_(Instrumental)_UVR-MDX-NET-Voc_FT.wav")

        # Update progress: Processing vocal stem
        processing_progress[job_id].update({
            "stage": "processing_vocal",
            "progress": 50,
            "message": "(50%) Processing vocal stem with matchering..."
        })
        
        processed_vocal_path = os.path.join(OUTPUT_DIR, f"processed_vocals_{uuid.uuid4()}.wav")
        
        mg.process_with_preset(
            target=target_vocal_path,
            preset_path=vocal_preset_path,
            results=[mg.pcm24(processed_vocal_path)]
        )

        # Update progress: Processing instrumental stem
        processing_progress[job_id].update({
            "stage": "processing_instrumental",
            "progress": 75,
            "message": "(75%) Processing instrumental stem with matchering..."
        })
        
        processed_instrumental_path = os.path.join(OUTPUT_DIR, f"processed_instrumentals_{uuid.uuid4()}.wav")
        
        mg.process_with_preset(
            target=target_instrumental_path,
            preset_path=instrumental_preset_path,
            results=[mg.pcm24(processed_instrumental_path)]
        )

        # Update progress: Complete
        processing_progress[job_id].update({
            "stage": "complete",
            "progress": 100,
            "message": "Processing completed successfully!",
            "target_vocal_path": target_vocal_path,
            "target_instrumental_path": target_instrumental_path,
            "processed_vocal_path": processed_vocal_path,
            "processed_instrumental_path": processed_instrumental_path,
            # NOTE: Don't include preset paths here because these are uploaded presets that the user already has
            # Only include preset paths when they are created from reference files (not uploaded by user)
        })
        
        # Clean up temporary files but KEEP stem files for frontend usage
        os.remove(target_path)
        os.remove(vocal_preset_path)
        os.remove(instrumental_preset_path)
        
        # IMPORTANT: Keep these files for frontend waveform display and real-time mixing:
        # - target_vocal_path (original vocal stem for waveform display)
        # - target_instrumental_path (original instrumental stem for waveform display)
        # - processed_vocal_path (processed vocal stem for mixing)
        # - processed_instrumental_path (processed instrumental stem for mixing)
        
    except Exception as e:
        processing_progress[job_id].update({
            "stage": "error",
            "progress": 0,
            "message": f"Error during processing: {str(e)}"
        })
    finally:
        finish_job(job_id)


def process_stems_with_reference_sync(
    target_path: str,
    reference_path: str,
    job_id: str
):
    """Synchronous background task version of stem processing with reference"""
    print(f"Background task started for job_id: {job_id}")
    try:
        
        # Update progress: Loading model
        processing_progress[job_id].update({
            "stage": "loading_model",
            "progress": 10,
            "message": "(10%) Loading audio separation model..."
        })
        
        # Separate the reference file into vocal and instrumental stems
        separator.load_model(model_filename="UVR-MDX-NET-Voc_FT.onnx")
        
        # Update progress: Extracting loudest segment
        processing_progress[job_id].update({
            "stage": "extracting_segment",
            "progress": 15,
            "message": "(15%) Finding loudest part of reference audio..."
        })
        
        # Extract loudest segment from reference (much faster than processing entire file)
        ref_segment_path = extract_loudest_segment(reference_path, segment_duration=30.0)
        
        # Update progress: Separating reference segment
        processing_progress[job_id].update({
            "stage": "separating_reference",
            "progress": 25,
            "message": "(25%) Separating reference segment into vocal and instrumental stems..."
        })
        
        # Use progress interceptor for real-time updates during separation
        with ProgressInterceptor(job_id, "separating_reference", 25, 35):
            separator.separate(ref_segment_path)
        
        # Construct paths for separated reference files
        ref_segment_base = os.path.splitext(os.path.basename(ref_segment_path))[0]
        ref_vocal_path = os.path.join(OUTPUT_DIR, f"{ref_segment_base}_(Vocals)_UVR-MDX-NET-Voc_FT.wav")
        ref_instrumental_path = os.path.join(OUTPUT_DIR, f"{ref_segment_base}_(Instrumental)_UVR-MDX-NET-Voc_FT.wav")
        
        # Create presets from separated reference stems
        processing_progress[job_id].update({
            "stage": "creating_presets",
            "progress": 35,
            "message": "(35%) Creating presets from separated reference stems..."
        })
        
        # Generate preset filenames based on original reference name
        reference_base = os.path.splitext(os.path.basename(reference_path))[0]
        vocal_preset_filename = f"{reference_base}_vocal.pkl"
        instrumental_preset_filename = f"{reference_base}_instrumental.pkl"
        
        vocal_preset_path = os.path.join(PRESET_DIR, vocal_preset_filename)
        instrumental_preset_path = os.path.join(PRESET_DIR, instrumental_preset_filename)
        
        # Create presets using matchering's analyze_reference_track
        mg.analyze_reference_track(reference=ref_vocal_path, preset_path=vocal_preset_path)
        mg.analyze_reference_track(reference=ref_instrumental_path, preset_path=instrumental_preset_path)
        
        # Update progress: Separating target
        processing_progress[job_id].update({
            "stage": "separating_target",
            "progress": 45,
            "message": "(45%) Separating target audio into vocal and instrumental stems..."
        })
        
        # Use progress interceptor for real-time updates during separation
        with ProgressInterceptor(job_id, "separating_target", 45, 65):
            separator.separate(target_path)
        
        # Construct paths for separated target files
        target_base = os.path.splitext(os.path.basename(target_path))[0]
        target_vocal_path = os.path.join(OUTPUT_DIR, f"{target_base}_(Vocals)_UVR-MDX-NET-Voc_FT.wav")
        target_instrumental_path = os.path.join(OUTPUT_DIR, f"{target_base}_(Instrumental)_UVR-MDX-NET-Voc_FT.wav")

        # Update progress: Processing vocal stem
        processing_progress[job_id].update({
            "stage": "processing_vocal",
            "progress": 65,
            "message": "(65%) Processing vocal stem with matchering..."
        })
        
        processed_vocal_path = os.path.join(OUTPUT_DIR, f"processed_vocals_{uuid.uuid4()}.wav")
        
        
        mg.process_with_preset(
            target=target_vocal_path,
            preset_path=vocal_preset_path,
            results=[mg.pcm24(processed_vocal_path)]
        )

        # Update progress: Processing instrumental stem
        processing_progress[job_id].update({
            "stage": "processing_instrumental",
            "progress": 85,
            "message": "(85%) Processing instrumental stem with matchering..."
        })
        
        processed_instrumental_path = os.path.join(OUTPUT_DIR, f"processed_instrumentals_{uuid.uuid4()}.wav")
        
        
        mg.process_with_preset(
            target=target_instrumental_path,
            preset_path=instrumental_preset_path,
            results=[mg.pcm24(processed_instrumental_path)]
        )

        # Update progress: Combining stems
        processing_progress[job_id].update({
            "stage": "combining",
            "progress": 95,
            "message": "(95%) Combining processed stems..."
        })
        
        # Update progress: Complete (individual stems ready for real-time mixing)
        processing_progress[job_id].update({
            "stage": "complete",
            "progress": 100,
            "message": "Processing completed successfully!",
            "target_vocal_path": target_vocal_path,
            "target_instrumental_path": target_instrumental_path,
            "processed_vocal_path": processed_vocal_path,
            "processed_instrumental_path": processed_instrumental_path,
            "vocal_preset_path": vocal_preset_path,
            "instrumental_preset_path": instrumental_preset_path,
            "vocal_preset_filename": vocal_preset_filename,
            "instrumental_preset_filename": instrumental_preset_filename
        })
        
        # Clean up temporary files but KEEP stem files for frontend usage
        os.remove(target_path)
        os.remove(reference_path)
        if os.path.exists(ref_segment_path):
            os.remove(ref_segment_path)
        if 'ref_vocal_path' in locals():
            os.remove(ref_vocal_path)
        if 'ref_instrumental_path' in locals():
            os.remove(ref_instrumental_path)
        
        # IMPORTANT: Keep these files for frontend waveform display and real-time mixing:
        # - target_vocal_path (original vocal stem for waveform display)
        # - target_instrumental_path (original instrumental stem for waveform display)
        # - processed_vocal_path (processed vocal stem for mixing)
        # - processed_instrumental_path (processed instrumental stem for mixing)
        # These will be cleaned up by the system's automatic cleanup process
            
    except Exception as e:
        processing_progress[job_id].update({
            "stage": "error",
            "progress": 0,
            "message": str(e)
        })
    finally:
        finish_job(job_id)

@app.post("/api/process_single")
async def process_single(
    background_tasks: BackgroundTasks,
    target_file: UploadFile = File(...),
    reference_file: Optional[UploadFile] = File(None),
    preset_file: Optional[UploadFile] = File(None),
    use_stem_separation: bool = Form(False),
    vocal_preset_file: Optional[UploadFile] = File(None),
    instrumental_preset_file: Optional[UploadFile] = File(None),
):
    # Read target file content for duplicate detection
    target_content = await target_file.read()
    target_file.file.seek(0)  # Reset file pointer
    
    # Generate file hash and check for duplicates
    file_hash = get_file_hash(target_content)
    job_id = str(uuid.uuid4())
    
    if not start_job(job_id, "process_single", file_hash):
        raise HTTPException(status_code=429, detail="Single file processing already in progress for this file")
    
    # Clean up previous processing files at start of new processing
    # We'll preserve the files we're about to upload
    files_to_preserve = []
    if target_file:
        files_to_preserve.append(target_file.filename)
    if reference_file:
        files_to_preserve.append(reference_file.filename)
    if preset_file:
        files_to_preserve.append(preset_file.filename)
    if vocal_preset_file:
        files_to_preserve.append(vocal_preset_file.filename)
    if instrumental_preset_file:
        files_to_preserve.append(instrumental_preset_file.filename)
    
    # Clean up old uploads and outputs from previous processing
    cleanup_processing_files(files_to_preserve)
    if use_stem_separation:
        if reference_file:
            # Stem separation with reference file - create presets from separated reference
            processing_progress[job_id] = {
                "stage": "initializing",
                "progress": 0,
                "message": "Initializing stem separation with reference...",
                "device": "GPU" if torch.cuda.is_available() else "CPU",
                "job_key": processing_progress[job_id]["job_key"]
            }
            
            # Save files before starting background task (to avoid "read of closed file" error)
            target_path = os.path.join(UPLOAD_DIR, target_file.filename)
            reference_path = os.path.join(UPLOAD_DIR, reference_file.filename)
            
            with open(target_path, "wb") as f:
                f.write(target_content)
            with open(reference_path, "wb") as f:
                shutil.copyfileobj(reference_file.file, f)
            
            # Start background task for stem processing
            background_tasks.add_task(
                process_stems_with_reference_sync,
                target_path, reference_path, job_id
            )
            
            return {
                "message": "Stem processing started",
                "job_id": job_id
            }
        elif vocal_preset_file and instrumental_preset_file:
            # Stem separation with presets - use background task for progress tracking
            processing_progress[job_id] = {
                "stage": "initializing",
                "progress": 0,
                "message": "Initializing stem separation with presets...",
                "device": "GPU" if torch.cuda.is_available() else "CPU",
                "job_key": processing_progress[job_id]["job_key"]
            }
            
            # Save files before starting background task
            target_path = os.path.join(UPLOAD_DIR, target_file.filename)
            vocal_preset_path = os.path.join(UPLOAD_DIR, vocal_preset_file.filename)
            instrumental_preset_path = os.path.join(UPLOAD_DIR, instrumental_preset_file.filename)
            
            with open(target_path, "wb") as f:
                f.write(target_content)
            with open(vocal_preset_path, "wb") as f:
                shutil.copyfileobj(vocal_preset_file.file, f)
            with open(instrumental_preset_path, "wb") as f:
                shutil.copyfileobj(instrumental_preset_file.file, f)
            
            # Start background task
            background_tasks.add_task(
                process_stems_with_presets_sync,
                target_path, vocal_preset_path, instrumental_preset_path, job_id
            )
            
            return {
                "message": "Stem processing started",
                "job_id": job_id
            }
        else:
            finish_job(job_id)
            raise HTTPException(status_code=400, detail="For stem separation, either a reference file or both vocal and instrumental presets are required.")

    if not reference_file and not preset_file:
        finish_job(job_id)
        raise HTTPException(status_code=400, detail="Either a reference file or a preset file must be provided.")
    if reference_file and preset_file:
        finish_job(job_id)
        raise HTTPException(status_code=400, detail="Only one of reference file or preset file can be provided.")

    target_path = os.path.join(UPLOAD_DIR, target_file.filename)
    with open(target_path, "wb") as f:
        f.write(target_content)

    processed_filename = f"processed_{uuid.uuid4()}.wav"
    processed_path = os.path.join(OUTPUT_DIR, processed_filename)

    try:
        if reference_file:
            # Step 1: Create preset from reference audio first
            ref_path = os.path.join(UPLOAD_DIR, reference_file.filename)
            with open(ref_path, "wb") as f:
                shutil.copyfileobj(reference_file.file, f)
            
            # Generate preset filename
            reference_base = os.path.splitext(reference_file.filename)[0]
            preset_filename = f"{reference_base}.pkl"
            created_preset_path = os.path.join(PRESET_DIR, preset_filename)
            
            # Create preset using analyze_reference_track
            mg.analyze_reference_track(reference=ref_path, preset_path=created_preset_path)
            
            # Step 2: Process target using the created preset
            mg.process_with_preset(
                target=target_path,
                preset_path=created_preset_path,
                results=[mg.pcm24(processed_path)]
            )
            
            # Clean up reference file
            os.remove(ref_path)
            
            # Create streaming session for real-time parameter updates
            session_id = f"stream_{int(time.time() * 1000)}"
            
            # Import here to avoid circular imports
            from app.api.frame_endpoints import preview_generators, session_parameters
            
            preview_generators[session_id] = {
                "original_audio_path": target_path,
                "processed_audio_path": processed_path,
                "output_dir": OUTPUT_DIR
            }
            
            # Initialize default parameters
            session_parameters[session_id] = {
                "blend_ratio": 0.5,
                "master_gain_db": 0.0,
                "vocal_gain_db": 0.0,
                "instrumental_gain_db": 0.0,
                "limiter_enabled": True,
                "is_stem_mode": False
            }
            
            finish_job(job_id)
            return {
                "message": "Single file processed successfully",
                "original_file_path": target_path,
                "processed_file_path": processed_path,
                "created_preset_path": created_preset_path,
                "created_preset_filename": preset_filename,
                "reference_filename": reference_file.filename,
                "session_id": session_id
            }
        elif preset_file:
            # Standard preset processing (unchanged)
            preset_temp_path = os.path.join(UPLOAD_DIR, preset_file.filename)
            with open(preset_temp_path, "wb") as f:
                shutil.copyfileobj(preset_file.file, f)
            mg.process_with_preset(
                target=target_path,
                preset_path=preset_temp_path,
                results=[mg.pcm24(processed_path)]
            )
            os.remove(preset_temp_path)

            # Create streaming session for real-time parameter updates
            session_id = f"stream_{int(time.time() * 1000)}"
            
            # Import here to avoid circular imports
            from app.api.frame_endpoints import preview_generators, session_parameters
            
            preview_generators[session_id] = {
                "original_audio_path": target_path,
                "processed_audio_path": processed_path,
                "output_dir": OUTPUT_DIR
            }
            
            # Initialize default parameters
            session_parameters[session_id] = {
                "blend_ratio": 0.5,
                "master_gain_db": 0.0,
                "vocal_gain_db": 0.0,
                "instrumental_gain_db": 0.0,
                "limiter_enabled": True,
                "is_stem_mode": False
            }
            
            finish_job(job_id)
            return {
                "message": "Single file processed successfully",
                "original_file_path": target_path,
                "processed_file_path": processed_path,
                "reference_filename": preset_file.filename,
                "session_id": session_id
            }
    except Exception as e:
        finish_job(job_id)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Keep target_path for blending, it will be cleaned up later or by a separate cleanup process
        pass

@app.post("/api/blend_and_save")
async def blend_and_save(
    original_path: str = Form(...),
    processed_path: str = Form(...),
    blend_ratio: float = Form(...),
    apply_limiter: bool = Form(True),
    original_filename: str = Form(None),
    reference_filename: str = Form(None)
):
    if not (0.0 <= blend_ratio <= 1.0):
        raise HTTPException(status_code=400, detail="Blend ratio must be between 0.0 and 1.0.")

    try:
        original_audio, sr_orig = sf.read(original_path)
        processed_audio, sr_proc = sf.read(processed_path)

        if sr_orig != sr_proc:
            raise HTTPException(status_code=400, detail="Sample rates of original and processed audio do not match.")
        
        # Ensure both arrays have the same number of channels (e.g., stereo)
        if original_audio.ndim == 1:
            original_audio = np.expand_dims(original_audio, axis=1)
        if processed_audio.ndim == 1:
            processed_audio = np.expand_dims(processed_audio, axis=1)

        # Pad the shorter audio with zeros to match the length of the longer one
        max_len = max(len(original_audio), len(processed_audio))
        if len(original_audio) < max_len:
            original_audio = np.pad(original_audio, ((0, max_len - len(original_audio)), (0,0)), 'constant')
        elif len(processed_audio) < max_len:
            processed_audio = np.pad(processed_audio, ((0, max_len - len(processed_audio)), (0,0)), 'constant')

        blended_audio = (original_audio * (1 - blend_ratio)) + (processed_audio * blend_ratio)

        # Simple blend without gain or mute adjustments

        if apply_limiter:
            # Apply limiter for soft clipping
            blended_audio = limit(blended_audio, mg.Config())

        # Generate meaningful filename based on original file and reference
        if original_filename:
            # Extract base name without extension
            original_base = os.path.splitext(original_filename)[0]
            blend_percentage = int(blend_ratio * 100)
            
            # Add reference indication if available
            if reference_filename:
                # Extract reference base name and limit to 10 characters
                reference_base = os.path.splitext(reference_filename)[0][:10]
                blended_filename = f"{original_base}-out-{reference_base}-blend{blend_percentage}.wav"
            else:
                # Fallback without reference indication
                blended_filename = f"{original_base}-out-blend{blend_percentage}.wav"
        else:
            # Fallback to UUID-based naming
            blended_filename = f"blended_{uuid.uuid4()}.wav"
            
        blended_path = os.path.join(OUTPUT_DIR, blended_filename)
        sf.write(blended_path, blended_audio, sr_orig)

        return {"message": "Blended audio saved successfully", "blended_file_path": blended_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/blend_stems_and_save")
async def blend_stems_and_save(
    original_vocal_path: str = Form(...),
    processed_vocal_path: str = Form(...),
    original_instrumental_path: str = Form(...),
    processed_instrumental_path: str = Form(...),
    vocal_blend_ratio: float = Form(...),
    instrumental_blend_ratio: float = Form(...),
    vocal_gain_db: float = Form(0.0),
    instrumental_gain_db: float = Form(0.0),
    vocal_muted: bool = Form(False),
    instrumental_muted: bool = Form(False),
    apply_limiter: bool = Form(True)
):
    """Blend vocal and instrumental stems separately and combine them"""
    
    if not (0.0 <= vocal_blend_ratio <= 1.0) or not (0.0 <= instrumental_blend_ratio <= 1.0):
        raise HTTPException(status_code=400, detail="Blend ratios must be between 0.0 and 1.0.")
    
    if not (-12.0 <= vocal_gain_db <= 12.0) or not (-12.0 <= instrumental_gain_db <= 12.0):
        raise HTTPException(status_code=400, detail="Gain values must be between -12.0dB and +12.0dB.")

    try:
        # Load all audio files
        original_vocal, sr_vocal = sf.read(original_vocal_path)
        processed_vocal, sr_proc_vocal = sf.read(processed_vocal_path)
        original_instrumental, sr_instrumental = sf.read(original_instrumental_path)
        processed_instrumental, sr_proc_instrumental = sf.read(processed_instrumental_path)

        # Verify sample rates match
        if not all(sr == sr_vocal for sr in [sr_proc_vocal, sr_instrumental, sr_proc_instrumental]):
            raise HTTPException(status_code=400, detail="Sample rates of all audio files must match.")
        
        # Ensure all arrays have the same number of channels
        def ensure_stereo(audio):
            if audio.ndim == 1:
                return np.expand_dims(audio, axis=1)
            return audio
        
        original_vocal = ensure_stereo(original_vocal)
        processed_vocal = ensure_stereo(processed_vocal)
        original_instrumental = ensure_stereo(original_instrumental)
        processed_instrumental = ensure_stereo(processed_instrumental)

        # Find the maximum length and pad all arrays to match
        max_len = max(len(original_vocal), len(processed_vocal), 
                     len(original_instrumental), len(processed_instrumental))
        
        def pad_to_length(audio, target_len):
            if len(audio) < target_len:
                return np.pad(audio, ((0, target_len - len(audio)), (0,0)), 'constant')
            return audio[:target_len]
        
        original_vocal = pad_to_length(original_vocal, max_len)
        processed_vocal = pad_to_length(processed_vocal, max_len)
        original_instrumental = pad_to_length(original_instrumental, max_len)
        processed_instrumental = pad_to_length(processed_instrumental, max_len)

        # Blend each stem separately
        blended_vocal = (original_vocal * (1 - vocal_blend_ratio)) + (processed_vocal * vocal_blend_ratio)
        blended_instrumental = (original_instrumental * (1 - instrumental_blend_ratio)) + (processed_instrumental * instrumental_blend_ratio)

        # Apply gain adjustments (convert dB to linear gain)
        vocal_gain_linear = 10.0 ** (vocal_gain_db / 20.0)
        instrumental_gain_linear = 10.0 ** (instrumental_gain_db / 20.0)
        
        blended_vocal = blended_vocal * vocal_gain_linear
        blended_instrumental = blended_instrumental * instrumental_gain_linear
        
        # Apply mute (set to zero if muted)
        if vocal_muted:
            blended_vocal = np.zeros_like(blended_vocal)
        if instrumental_muted:
            blended_instrumental = np.zeros_like(blended_instrumental)

        # Combine the processed stems
        combined_audio = blended_vocal + blended_instrumental

        if apply_limiter:
            # Apply limiter for soft clipping
            combined_audio = limit(combined_audio, mg.Config())

        # Save the result
        blended_filename = f"stem_blend_{uuid.uuid4()}.wav"
        blended_path = os.path.join(OUTPUT_DIR, blended_filename)
        sf.write(blended_path, combined_audio, sr_vocal)

        return {"message": "Stem blend saved successfully", "blended_file_path": blended_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save_stem_blend")
async def save_stem_blend(
    target_vocal_path: str = Form(...),
    target_instrumental_path: str = Form(...),
    processed_vocal_path: str = Form(...),
    processed_instrumental_path: str = Form(...),
    vocal_blend_ratio: float = Form(...),
    instrumental_blend_ratio: float = Form(...),
    vocal_gain_db: float = Form(0.0),
    instrumental_gain_db: float = Form(0.0),
    master_gain_db: float = Form(0.0),
    vocal_muted: bool = Form(False),
    instrumental_muted: bool = Form(False),
    apply_limiter: bool = Form(True),
    original_filename: str = Form(None),
    vocal_preset_filename: str = Form(None),
    instrumental_preset_filename: str = Form(None)
):
    """Save stem blend with meaningful filename."""
    
    if not (0.0 <= vocal_blend_ratio <= 1.0) or not (0.0 <= instrumental_blend_ratio <= 1.0):
        raise HTTPException(status_code=400, detail="Blend ratios must be between 0.0 and 1.0.")
    
    try:
        # Load all stem audio files
        target_vocal_audio, sr_vocal = sf.read(target_vocal_path)
        target_instrumental_audio, sr_instrumental = sf.read(target_instrumental_path)
        processed_vocal_audio, sr_proc_vocal = sf.read(processed_vocal_path)
        processed_instrumental_audio, sr_proc_instrumental = sf.read(processed_instrumental_path)

        # Verify sample rates match
        if not all(sr == sr_vocal for sr in [sr_instrumental, sr_proc_vocal, sr_proc_instrumental]):
            raise HTTPException(status_code=400, detail="Sample rates of all audio files must match.")
        
        # Ensure all arrays have the same number of channels
        def ensure_stereo(audio):
            if audio.ndim == 1:
                return np.expand_dims(audio, axis=1)
            return audio
        
        target_vocal_audio = ensure_stereo(target_vocal_audio)
        target_instrumental_audio = ensure_stereo(target_instrumental_audio)
        processed_vocal_audio = ensure_stereo(processed_vocal_audio)
        processed_instrumental_audio = ensure_stereo(processed_instrumental_audio)

        # Find the maximum length and pad all arrays to match
        max_len = max(len(target_vocal_audio), len(target_instrumental_audio), 
                     len(processed_vocal_audio), len(processed_instrumental_audio))
        
        def pad_to_length(audio, target_len):
            if len(audio) < target_len:
                return np.pad(audio, ((0, target_len - len(audio)), (0,0)), 'constant')
            return audio[:target_len]
        
        target_vocal_audio = pad_to_length(target_vocal_audio, max_len)
        target_instrumental_audio = pad_to_length(target_instrumental_audio, max_len)
        processed_vocal_audio = pad_to_length(processed_vocal_audio, max_len)
        processed_instrumental_audio = pad_to_length(processed_instrumental_audio, max_len)

        # Blend each stem separately
        blended_vocal = target_vocal_audio * (1 - vocal_blend_ratio) + processed_vocal_audio * vocal_blend_ratio
        blended_instrumental = target_instrumental_audio * (1 - instrumental_blend_ratio) + processed_instrumental_audio * instrumental_blend_ratio

        # Apply gain adjustments (convert dB to linear gain)
        vocal_gain_linear = 10.0 ** (vocal_gain_db / 20.0)
        instrumental_gain_linear = 10.0 ** (instrumental_gain_db / 20.0)
        
        blended_vocal = blended_vocal * vocal_gain_linear
        blended_instrumental = blended_instrumental * instrumental_gain_linear
        
        # Apply mute (set to zero if muted)
        if vocal_muted:
            blended_vocal = np.zeros_like(blended_vocal)
        if instrumental_muted:
            blended_instrumental = np.zeros_like(blended_instrumental)

        # Combine the processed stems
        combined_audio = blended_vocal + blended_instrumental
        
        # Apply master gain
        master_gain_linear = 10.0 ** (master_gain_db / 20.0)
        combined_audio = combined_audio * master_gain_linear

        if apply_limiter:
            # Apply limiter for soft clipping
            combined_audio = limit(combined_audio, mg.Config())
        
        # Generate meaningful filename
        if original_filename:
            original_base = os.path.splitext(original_filename)[0]
            vocal_percentage = int(vocal_blend_ratio * 100)
            instrumental_percentage = int(instrumental_blend_ratio * 100)
            
            # Create reference indication from preset filenames with grouped pattern
            if vocal_preset_filename or instrumental_preset_filename:
                vocal_ref = os.path.splitext(vocal_preset_filename)[0][:10] if vocal_preset_filename else "default"
                inst_ref = os.path.splitext(instrumental_preset_filename)[0][:10] if instrumental_preset_filename else "default"
                
                # New grouped pattern: {source}-out-v_{reference}_{blend80}-i_{reference}_{blend43}.wav
                blended_filename = f"{original_base}-out-v_{vocal_ref}_{vocal_percentage}-i_{inst_ref}_{instrumental_percentage}.wav"
            else:
                blended_filename = f"{original_base}-out-stemblend{vocal_percentage}v{instrumental_percentage}i.wav"
        else:
            # Fallback to UUID-based naming
            blended_filename = f"stem_blend_{uuid.uuid4()}.wav"

        # Save the result
        blended_path = os.path.join(OUTPUT_DIR, blended_filename)
        sf.write(blended_path, combined_audio, sr_vocal)

        return {"message": "Stem blend saved successfully", "blended_file_path": blended_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/create_stem_session")
async def create_stem_session(
    target_vocal_path: str = Form(...),
    target_instrumental_path: str = Form(...),
    processed_vocal_path: str = Form(...),
    processed_instrumental_path: str = Form(...)
):
    """
    Create a streaming session for stem mode processing.
    """
    try:
        # Create streaming session for real-time parameter updates
        session_id = f"stem_stream_{int(time.time() * 1000)}"
        
        # Import here to avoid circular imports
        from app.api.frame_endpoints import preview_generators, session_parameters
        
        preview_generators[session_id] = {
            "target_vocal_path": target_vocal_path,
            "target_instrumental_path": target_instrumental_path, 
            "processed_vocal_path": processed_vocal_path,
            "processed_instrumental_path": processed_instrumental_path,
            "output_dir": OUTPUT_DIR,
            "is_stem_mode": True
        }
        
        print(f"Created stem session {session_id} with paths:")
        print(f"  Vocal: {target_vocal_path}")
        print(f"  Instrumental: {target_instrumental_path}")
        print(f"  Processed vocal: {processed_vocal_path}")
        print(f"  Processed instrumental: {processed_instrumental_path}")
        
        # Initialize default stem parameters
        session_parameters[session_id] = {
            "vocal_blend_ratio": 0.5,
            "instrumental_blend_ratio": 0.5,
            "vocal_gain_db": 0.0,
            "instrumental_gain_db": 0.0,
            "master_gain_db": 0.0,
            "vocal_muted": False,
            "instrumental_muted": False,
            "limiter_enabled": True,
            "is_stem_mode": True
        }
        
        return {
            "message": "Stem streaming session created successfully",
            "session_id": session_id
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process_batch")
async def process_batch(
    background_tasks: BackgroundTasks,
    preset_file: UploadFile = File(...),
    target_files: List[UploadFile] = File(...),
    blend_ratio: float = Form(1.0),
    apply_limiter: bool = Form(True)
):
    if not (1 <= len(target_files) <= 20):
        raise HTTPException(status_code=400, detail="Please upload between 1 and 20 target files.")

    # Read all target file contents for duplicate detection
    target_contents = []
    for target_file in target_files:
        content = await target_file.read()
        target_file.file.seek(0)  # Reset file pointer
        target_contents.append(content)
    
    # Create combined hash for all files
    combined_content = b"".join(target_contents)
    file_hash = get_file_hash(combined_content)
    batch_id = str(uuid.uuid4())
    
    if not start_job(batch_id, "process_batch", file_hash):
        raise HTTPException(status_code=429, detail="Batch processing already in progress for these files")

    # Clean up previous processing files at start of batch processing
    files_to_preserve = [preset_file.filename]
    files_to_preserve.extend([f.filename for f in target_files])
    cleanup_processing_files(files_to_preserve)

    batch_jobs[batch_id] = {"status": "pending", "processed_count": 0, "total_count": len(target_files), "output_files": []}

    preset_temp_path = os.path.join(UPLOAD_DIR, preset_file.filename)
    with open(preset_temp_path, "wb") as f:
        shutil.copyfileobj(preset_file.file, f)

    target_file_paths = []
    for i, target_file in enumerate(target_files):
        file_location = os.path.join(UPLOAD_DIR, target_file.filename)
        with open(file_location, "wb") as f:
            f.write(target_contents[i])
        target_file_paths.append(file_location)

    background_tasks.add_task(
            _run_batch_processing,
            batch_id,
            preset_temp_path,
            target_file_paths,
            blend_ratio,
            apply_limiter
        )

    return {"message": "Batch processing started", "batch_id": batch_id}

def _run_batch_processing(batch_id: str, preset_path: str, target_paths: List[str], blend_ratio: float, apply_limiter: bool):
    try:
        # Get preset name for filename
        preset_name = os.path.splitext(os.path.basename(preset_path))[0][:8]  # Cap at 8 chars
        blend_percentage = int(blend_ratio * 100)
        
        for i, target_path in enumerate(target_paths):
            # Get original filename without extension
            original_filename = os.path.splitext(os.path.basename(target_path))[0]
            
            if blend_ratio == 1.0:
                # Full processing (100% wet) - format: originalname-out-presetname.wav
                output_filename = f"{original_filename}-out-{preset_name}.wav"
                output_path = os.path.join(OUTPUT_DIR, output_filename)
                
                mg.process_with_preset(
                    target=target_path,
                    preset_path=preset_path,
                    results=[mg.pcm24(output_path)]
                )
            else:
                # Blended processing - format: originalname_out_presetname-blend50.wav
                processed_filename = f"batch_temp_{uuid.uuid4()}.wav"
                processed_path = os.path.join(OUTPUT_DIR, processed_filename)
                
                # Process the file first
                mg.process_with_preset(
                    target=target_path,
                    preset_path=preset_path,
                    results=[mg.pcm24(processed_path)]
                )
                
                # Then blend original and processed
                original_audio, sr_orig = sf.read(target_path)
                processed_audio, sr_proc = sf.read(processed_path)
                
                # Ensure both arrays have the same number of channels
                if original_audio.ndim == 1:
                    original_audio = np.expand_dims(original_audio, axis=1)
                if processed_audio.ndim == 1:
                    processed_audio = np.expand_dims(processed_audio, axis=1)
                
                # Pad the shorter audio with zeros to match the length of the longer one
                max_len = max(len(original_audio), len(processed_audio))
                if len(original_audio) < max_len:
                    original_audio = np.pad(original_audio, ((0, max_len - len(original_audio)), (0,0)), 'constant')
                elif len(processed_audio) < max_len:
                    processed_audio = np.pad(processed_audio, ((0, max_len - len(processed_audio)), (0,0)), 'constant')
                
                # Blend the audio
                blended_audio = (original_audio * (1 - blend_ratio)) + (processed_audio * blend_ratio)

                if apply_limiter:
                    # Apply limiter for soft clipping
                    blended_audio = limit(blended_audio, mg.Config())
                
                # Save the blended result with proper naming
                output_filename = f"{original_filename}-out-{preset_name}-blend{blend_percentage}.wav"
                output_path = os.path.join(OUTPUT_DIR, output_filename)
                sf.write(output_path, blended_audio, sr_orig)
                
                # Clean up temporary processed file
                os.remove(processed_path)
            
            batch_jobs[batch_id]["processed_count"] = i + 1
            batch_jobs[batch_id]["output_files"].append(output_path)
            os.remove(target_path) # Clean up processed target file

        batch_jobs[batch_id]["status"] = "completed"
    except Exception as e:
        batch_jobs[batch_id]["status"] = "failed"
        batch_jobs[batch_id]["error"] = str(e)
    finally:
        finish_job(batch_id)
        os.remove(preset_path) # Clean up preset file

@app.get("/api/batch_status/{batch_id}")
async def get_batch_status(batch_id: str):
    job = batch_jobs.get(batch_id)
    if not job:
        raise HTTPException(status_code=404, detail="Batch job not found.")
    return job

@app.get("/download/{file_type}/{filename}")
async def download_file(file_type: str, filename: str, download_name: Optional[str] = None):
    if file_type == "output":
        file_path = os.path.join(OUTPUT_DIR, filename)
    elif file_type == "preset":
        file_path = os.path.join(PRESET_DIR, filename)
    else:
        raise HTTPException(status_code=400, detail="Invalid file type.")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found.")
    
    return FileResponse(path=file_path, filename=download_name if download_name else filename, media_type="application/octet-stream")

@app.post("/api/preview_blend")
async def preview_blend(
    original_path: str = Form(...),
    processed_path: str = Form(...),
    blend_ratio: float = Form(...),
    apply_limiter: bool = Form(True)
):
    """Generate a preview of the blended audio with optional limiter"""
    if not (0.0 <= blend_ratio <= 1.0):
        raise HTTPException(status_code=400, detail="Blend ratio must be between 0.0 and 1.0.")

    try:
        original_audio, sr_orig = sf.read(original_path)
        processed_audio, sr_proc = sf.read(processed_path)

        if sr_orig != sr_proc:
            raise HTTPException(status_code=400, detail="Sample rates do not match.")
        
        # Ensure both arrays have the same number of channels
        if original_audio.ndim == 1:
            original_audio = np.expand_dims(original_audio, axis=1)
        if processed_audio.ndim == 1:
            processed_audio = np.expand_dims(processed_audio, axis=1)

        # Pad to match lengths
        max_len = max(len(original_audio), len(processed_audio))
        if len(original_audio) < max_len:
            original_audio = np.pad(original_audio, ((0, max_len - len(original_audio)), (0,0)), 'constant')
        elif len(processed_audio) < max_len:
            processed_audio = np.pad(processed_audio, ((0, max_len - len(processed_audio)), (0,0)), 'constant')

        # Blend the audio
        blended_audio = (original_audio * (1 - blend_ratio)) + (processed_audio * blend_ratio)

        if apply_limiter:
            # Apply limiter for soft clipping
            blended_audio = limit(blended_audio, mg.Config())

        # Save preview to temporary file
        preview_filename = f"preview_{uuid.uuid4()}.wav"
        preview_path = os.path.join(OUTPUT_DIR, preview_filename)
        sf.write(preview_path, blended_audio, sr_orig)

        return {"preview_file_path": preview_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class ProgressInterceptor:
    """Context manager to intercept tqdm progress bars for real-time updates"""
    
    def __init__(self, job_id: str, stage_name: str = "separating", stage_start_progress: int = 0, stage_end_progress: int = 100):
        self.job_id = job_id
        self.original_tqdm = None
        self.stage_name = stage_name
        self.stage_start_progress = stage_start_progress
        self.stage_end_progress = stage_end_progress
        
    def __enter__(self):
        # Store original tqdm
        import tqdm
        self.original_tqdm = tqdm.tqdm
        
        def custom_tqdm(*args, **kwargs):
            pbar = self.original_tqdm(*args, **kwargs)
            original_update = pbar.update
            
            def update_with_callback(n=1):
                result = original_update(n)
                if pbar.total and pbar.total > 0:
                    # Calculate separation progress (0-100%)
                    separation_progress = min((pbar.n / pbar.total) * 100, 100)
                    
                    # Calculate overall progress within the stage range
                    overall_progress = self.stage_start_progress + (separation_progress / 100) * (self.stage_end_progress - self.stage_start_progress)
                    
                    # Update progress in our global store
                    if self.job_id in processing_progress:
                        current_stage = processing_progress[self.job_id].get("stage", self.stage_name)
                        stage_message = {
                            "separating_reference": "Separating reference segment",
                            "separating_target": "Separating target audio",
                            "separating": "Processing audio separation"
                        }.get(current_stage, "Processing audio separation")
                        
                        processing_progress[self.job_id].update({
                            "progress": int(overall_progress),
                            "message": f"({int(overall_progress)}%) {stage_message}... {separation_progress:.1f}%"
                        })
                return result
            
            pbar.update = update_with_callback
            return pbar
        
        # Replace tqdm in the separator modules
        try:
            import audio_separator.separator.architectures.mdx_separator
            import audio_separator.separator.architectures.vr_separator
            import audio_separator.separator.architectures.mdxc_separator
            audio_separator.separator.architectures.mdx_separator.tqdm = custom_tqdm
            audio_separator.separator.architectures.vr_separator.tqdm = custom_tqdm
            audio_separator.separator.architectures.mdxc_separator.tqdm = custom_tqdm
        except ImportError:
            pass  # Some modules might not be available
        
        return self
    
    def __exit__(self, *args):
        # Restore original tqdm
        if self.original_tqdm:
            import tqdm
            tqdm.tqdm = self.original_tqdm


def separate_stems_background(audio_path: str, job_id: str, original_filename: str):
    """Background task for stem separation with progress tracking"""
    try:
        # Initialize progress
        processing_progress[job_id] = {
            "stage": "initializing",
            "progress": 0,
            "message": "Initializing stem separation..."
        }
        
        # Initialize separator
        processing_progress[job_id].update({
            "stage": "loading_model",
            "progress": 10,
            "message": "(10%) Loading separation model..."
        })
        
        separator = Separator(
            output_dir=OUTPUT_DIR,
            output_format="WAV"
        )
        separator.load_model(model_filename="UVR-MDX-NET-Voc_FT.onnx")
        
        # Start separation with progress tracking
        processing_progress[job_id].update({
            "stage": "separating",
            "progress": 20,
            "message": "(20%) Starting audio separation..."
        })
        
        # Use progress interceptor to track separation progress
        with ProgressInterceptor(job_id):
            separator.separate(audio_path)
        
        # Construct paths for separated files (library generates these)
        audio_base = os.path.splitext(os.path.basename(audio_path))[0]
        temp_vocal_path = os.path.join(OUTPUT_DIR, f"{audio_base}_(Vocals)_UVR-MDX-NET-Voc_FT.wav")
        temp_instrumental_path = os.path.join(OUTPUT_DIR, f"{audio_base}_(Instrumental)_UVR-MDX-NET-Voc_FT.wav")
        
        # Generate clean filenames and paths
        original_base = os.path.splitext(original_filename)[0]
        vocal_filename = f"{original_base}_Vocal.wav"
        instrumental_filename = f"{original_base}_Instrumental.wav"
        vocal_path = os.path.join(OUTPUT_DIR, vocal_filename)
        instrumental_path = os.path.join(OUTPUT_DIR, instrumental_filename)
        
        # Rename files to clean names
        if os.path.exists(temp_vocal_path):
            shutil.move(temp_vocal_path, vocal_path)
        if os.path.exists(temp_instrumental_path):
            shutil.move(temp_instrumental_path, instrumental_path)
        
        # Complete
        processing_progress[job_id].update({
            "stage": "complete",
            "progress": 100,
            "message": "Stem separation completed successfully!",
            "vocal_path": vocal_path,
            "instrumental_path": instrumental_path,
            "vocal_filename": vocal_filename,
            "instrumental_filename": instrumental_filename
        })
        
    except Exception as e:
        processing_progress[job_id].update({
            "stage": "error",
            "progress": 0,
            "message": f"Error during separation: {str(e)}"
        })
    finally:
        # Clean up job tracking and input file
        finish_job(job_id)
        if os.path.exists(audio_path):
            os.remove(audio_path)


@app.post("/api/separate_stems")
async def separate_stems(
    background_tasks: BackgroundTasks,
    audio_file: UploadFile = File(...)
):
    """Separate audio file into vocal and instrumental stems with progress tracking"""
    # Read file content for duplicate detection
    content = await audio_file.read()
    audio_file.file.seek(0)  # Reset file pointer
    
    # Generate file hash and check for duplicates
    file_hash = get_file_hash(content)
    job_id = str(uuid.uuid4())
    
    if not start_job(job_id, "stem_separation", file_hash):
        raise HTTPException(status_code=429, detail="Stem separation already in progress for this file")
    
    # Save uploaded file
    audio_filename = f"stem_input_{uuid.uuid4()}.wav"
    # Clean up processing files, preserving the current upload
    cleanup_processing_files([audio_filename])
    
    audio_path = os.path.join(UPLOAD_DIR, audio_filename)
    with open(audio_path, "wb") as f:
        f.write(content)
    
    # Start background task
    background_tasks.add_task(
        separate_stems_background,
        audio_path,
        job_id,
        audio_file.filename
    )
    
    return {
        "message": "Stem separation started",
        "job_id": job_id
    }

@app.get("/temp_files/{filename}")
async def get_temp_file(filename: str):
    # URL decode the filename to handle special characters
    decoded_filename = unquote(filename)
    
    # Check if the file is in UPLOAD_DIR or OUTPUT_DIR
    upload_file_path = os.path.join(UPLOAD_DIR, decoded_filename)
    output_file_path = os.path.join(OUTPUT_DIR, decoded_filename)

    if os.path.exists(upload_file_path):
        return FileResponse(path=upload_file_path, filename=decoded_filename)
    elif os.path.exists(output_file_path):
        return FileResponse(path=output_file_path, filename=decoded_filename)
    else:
        raise HTTPException(status_code=404, detail="Temporary file not found.")


# New Modular Audio Processing Endpoints

@app.post("/api/process_channel")
async def api_process_channel(
    original_file: UploadFile = File(...),
    processed_file: UploadFile = File(...),
    blend_ratio: float = Form(...),
    volume_adjust_db: float = Form(0.0),
    mute: bool = Form(False)
):
    """
    Process a single audio channel with blending, volume adjustment, and muting.
    
    This endpoint provides the core channel processing functionality used by both
    single file and stem processing workflows.
    """
    
    try:
        # Validate parameters
        if not (0.0 <= blend_ratio <= 1.0):
            raise HTTPException(status_code=400, detail="Blend ratio must be between 0.0 and 1.0")
        
        if not (-12.0 <= volume_adjust_db <= 12.0):
            raise HTTPException(status_code=400, detail="Volume adjustment must be between -12.0dB and +12.0dB")
        
        # Save uploaded files to temporary locations
        original_path = os.path.join(UPLOAD_DIR, f"original_{uuid.uuid4()}.wav")
        processed_path = os.path.join(UPLOAD_DIR, f"processed_{uuid.uuid4()}.wav")
        
        with open(original_path, "wb") as f:
            shutil.copyfileobj(original_file.file, f)
        with open(processed_path, "wb") as f:
            shutil.copyfileobj(processed_file.file, f)
        
        # Generate output path
        output_filename = f"channel_output_{uuid.uuid4()}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        
        # Process the channel using our modular processor
        result_path = process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path,
            blend_ratio=blend_ratio,
            volume_adjust_db=volume_adjust_db,
            mute=mute
        )
        
        return {
            "message": "Channel processing complete",
            "channel_output_path": result_path,
            "output_filename": output_filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary input files
        cleanup_file(original_path)
        cleanup_file(processed_path)


@app.post("/api/process_limiter")
async def api_process_limiter(
    input_files: List[UploadFile] = File(...),
    gain_adjust_db: float = Form(0.0),
    enable_limiter: bool = Form(True)
):
    """
    Process final master output with optional gain adjustment and limiting.
    
    Accepts 1-2 input files for single channel or stem processing workflows.
    """
    
    try:
        # Validate parameters
        if not input_files:
            raise HTTPException(status_code=400, detail="At least one input file must be provided")
        
        if len(input_files) > 2:
            raise HTTPException(status_code=400, detail="Maximum 2 input files supported")
        
        if not (-12.0 <= gain_adjust_db <= 12.0):
            raise HTTPException(status_code=400, detail="Gain adjustment must be between -12.0dB and +12.0dB")
        
        # Save uploaded files to temporary locations
        input_paths = []
        for i, input_file in enumerate(input_files):
            temp_path = os.path.join(UPLOAD_DIR, f"limiter_input_{i}_{uuid.uuid4()}.wav")
            with open(temp_path, "wb") as f:
                shutil.copyfileobj(input_file.file, f)
            input_paths.append(temp_path)
        
        # Generate output path
        output_filename = f"master_output_{uuid.uuid4()}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_filename)
        
        # Process through master limiter
        result_path = process_limiter(
            input_paths=input_paths,
            output_path=output_path,
            gain_adjust_db=gain_adjust_db,
            enable_limiter=enable_limiter
        )
        
        return {
            "message": "Master limiter processing complete",
            "master_output_path": result_path,
            "output_filename": output_filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary input files
        for path in input_paths:
            cleanup_file(path)


@app.post("/api/process_stem_channels")
async def api_process_stem_channels(
    vocal_original: UploadFile = File(...),
    vocal_processed: UploadFile = File(...),
    instrumental_original: UploadFile = File(...),
    instrumental_processed: UploadFile = File(...),
    vocal_blend_ratio: float = Form(...),
    vocal_volume_db: float = Form(0.0),
    vocal_mute: bool = Form(False),
    instrumental_blend_ratio: float = Form(...),
    instrumental_volume_db: float = Form(0.0),
    instrumental_mute: bool = Form(False)
):
    """
    Process both vocal and instrumental channels simultaneously.
    
    This endpoint processes both stem channels and returns their individual outputs,
    which can then be fed to the master limiter for final processing.
    """
    
    try:
        # Validate parameters for both channels
        if not (0.0 <= vocal_blend_ratio <= 1.0):
            raise HTTPException(status_code=400, detail="Vocal blend ratio must be between 0.0 and 1.0")
        if not (0.0 <= instrumental_blend_ratio <= 1.0):
            raise HTTPException(status_code=400, detail="Instrumental blend ratio must be between 0.0 and 1.0")
        
        if not (-12.0 <= vocal_volume_db <= 12.0):
            raise HTTPException(status_code=400, detail="Vocal volume adjustment must be between -12.0dB and +12.0dB")
        if not (-12.0 <= instrumental_volume_db <= 12.0):
            raise HTTPException(status_code=400, detail="Instrumental volume adjustment must be between -12.0dB and +12.0dB")
        
        # Save uploaded files to temporary locations
        vocal_orig_path = os.path.join(UPLOAD_DIR, f"vocal_orig_{uuid.uuid4()}.wav")
        vocal_proc_path = os.path.join(UPLOAD_DIR, f"vocal_proc_{uuid.uuid4()}.wav")
        inst_orig_path = os.path.join(UPLOAD_DIR, f"inst_orig_{uuid.uuid4()}.wav")
        inst_proc_path = os.path.join(UPLOAD_DIR, f"inst_proc_{uuid.uuid4()}.wav")
        
        with open(vocal_orig_path, "wb") as f:
            shutil.copyfileobj(vocal_original.file, f)
        with open(vocal_proc_path, "wb") as f:
            shutil.copyfileobj(vocal_processed.file, f)
        with open(inst_orig_path, "wb") as f:
            shutil.copyfileobj(instrumental_original.file, f)
        with open(inst_proc_path, "wb") as f:
            shutil.copyfileobj(instrumental_processed.file, f)
        
        # Generate output paths
        vocal_output_filename = f"vocal_channel_{uuid.uuid4()}.wav"
        inst_output_filename = f"instrumental_channel_{uuid.uuid4()}.wav"
        vocal_output_path = os.path.join(OUTPUT_DIR, vocal_output_filename)
        inst_output_path = os.path.join(OUTPUT_DIR, inst_output_filename)
        
        # Process vocal channel
        vocal_result = process_channel(
            original_path=vocal_orig_path,
            processed_path=vocal_proc_path,
            output_path=vocal_output_path,
            blend_ratio=vocal_blend_ratio,
            volume_adjust_db=vocal_volume_db,
            mute=vocal_mute
        )
        
        # Process instrumental channel
        inst_result = process_channel(
            original_path=inst_orig_path,
            processed_path=inst_proc_path,
            output_path=inst_output_path,
            blend_ratio=instrumental_blend_ratio,
            volume_adjust_db=instrumental_volume_db,
            mute=instrumental_mute
        )
        
        return {
            "message": "Stem channels processing complete",
            "vocal_output_path": vocal_result,
            "instrumental_output_path": inst_result,
            "vocal_filename": vocal_output_filename,
            "instrumental_filename": inst_output_filename
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Clean up temporary input files
        cleanup_file(vocal_orig_path)
        cleanup_file(vocal_proc_path)
        cleanup_file(inst_orig_path)
        cleanup_file(inst_proc_path)

# Waveform generation endpoints
@app.get("/api/waveform/dummy")
async def get_dummy_waveform():
    """Generate and return a dummy waveform PNG"""
    png_data = generate_dummy_waveform()
    return Response(content=png_data, media_type="image/png")

@app.post("/api/waveform/generate")
async def generate_waveform(
    original_path: str = Form(...),
    processed_path: str = Form(...)
):
    """Generate waveform PNG from original and processed audio files"""
    try:
        # Validate file paths
        if not os.path.exists(original_path):
            raise HTTPException(status_code=404, detail="Original file not found")
        if not os.path.exists(processed_path):
            raise HTTPException(status_code=404, detail="Processed file not found")
        
        png_data = generate_waveform_png(original_path, processed_path)
        return Response(content=png_data, media_type="image/png")
        
    except Exception as e:
        print(f"Error generating waveform: {e}")
        # Return dummy waveform on error
        png_data = generate_dummy_waveform()
        return Response(content=png_data, media_type="image/png")

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)