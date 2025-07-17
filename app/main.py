from fastapi import FastAPI, File, UploadFile, Form, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from typing import List, Optional
import os
import shutil
import uuid
import matchering as mg
import numpy as np
import soundfile as sf
import atexit

app = FastAPI()

# Get the directory where this file is located
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Mount static files (CSS, JS)
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "app", "static")), name="static")

# Configure Jinja2Templates
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "app", "templates"))

# Create PID-specific directories for uploads, presets, and outputs
PID = os.getpid()
UPLOAD_DIR = os.path.join(BASE_DIR, f"uploads_{PID}")
PRESET_DIR = os.path.join(BASE_DIR, f"presets_{PID}")
OUTPUT_DIR = os.path.join(BASE_DIR, f"outputs_{PID}")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PRESET_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Cleanup function to remove PID-specific directories on exit
def cleanup_pid_directories():
    for directory in [UPLOAD_DIR, PRESET_DIR, OUTPUT_DIR]:
        if os.path.exists(directory):
            shutil.rmtree(directory)

# Register cleanup function
atexit.register(cleanup_pid_directories)

# In-memory storage for batch job statuses
batch_jobs = {}

@app.get("/", response_class=HTMLResponse)
async def read_root():
    return templates.TemplateResponse("index.html", {"request": {}})

@app.post("/api/create_preset")
async def create_preset(reference_file: UploadFile = File(...)):
    original_filename_base = os.path.splitext(reference_file.filename)[0]
    file_location = os.path.join(UPLOAD_DIR, reference_file.filename)
    with open(file_location, "wb") as f:
        shutil.copyfileobj(reference_file.file, f)

    preset_filename = f"{uuid.uuid4()}.pkl"
    preset_path = os.path.join(PRESET_DIR, preset_filename)

    try:
        mg.analyze_reference_track(reference=file_location, preset_path=preset_path)
        return {"message": "Preset created successfully", "preset_path": preset_path, "suggested_filename": f"{original_filename_base}.pkl"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.remove(file_location)

@app.post("/api/blend_presets")
async def blend_presets(preset_files: List[UploadFile] = File(...), new_preset_name: str = Form(...)):
    if not (2 <= len(preset_files) <= 5):
        raise HTTPException(status_code=400, detail="Please upload between 2 and 5 preset files.")

    uploaded_preset_paths = []
    for preset_file in preset_files:
        file_location = os.path.join(UPLOAD_DIR, preset_file.filename)
        with open(file_location, "wb") as f:
            shutil.copyfileobj(preset_file.file, f)
        uploaded_preset_paths.append(file_location)

    blended_preset_filename = f"{new_preset_name}_{uuid.uuid4()}.pkl"
    blended_preset_path = os.path.join(PRESET_DIR, blended_preset_filename)

    try:
        mg.blend_presets(preset_paths=uploaded_preset_paths, new_preset_path=blended_preset_path)
        return {"message": "Presets blended successfully", "blended_preset_path": blended_preset_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for path in uploaded_preset_paths:
            os.remove(path)

@app.post("/api/process_single")
async def process_single(
    target_file: UploadFile = File(...),
    reference_file: Optional[UploadFile] = File(None),
    preset_file: Optional[UploadFile] = File(None)
):
    if not reference_file and not preset_file:
        raise HTTPException(status_code=400, detail="Either a reference file or a preset file must be provided.")
    if reference_file and preset_file:
        raise HTTPException(status_code=400, detail="Only one of reference file or preset file can be provided.")

    target_path = os.path.join(UPLOAD_DIR, target_file.filename)
    with open(target_path, "wb") as f:
        shutil.copyfileobj(target_file.file, f)

    processed_filename = f"processed_{uuid.uuid4()}.wav"
    processed_path = os.path.join(OUTPUT_DIR, processed_filename)

    try:
        if reference_file:
            ref_path = os.path.join(UPLOAD_DIR, reference_file.filename)
            with open(ref_path, "wb") as f:
                shutil.copyfileobj(reference_file.file, f)
            mg.process(
                target=target_path,
                reference=ref_path,
                results=[mg.pcm24(processed_path)]
            )
            os.remove(ref_path)
        elif preset_file:
            preset_temp_path = os.path.join(UPLOAD_DIR, preset_file.filename)
            with open(preset_temp_path, "wb") as f:
                shutil.copyfileobj(preset_file.file, f)
            mg.process_with_preset(
                target=target_path,
                preset_path=preset_temp_path,
                results=[mg.pcm24(processed_path)]
            )
            os.remove(preset_temp_path)

        return {
            "message": "Single file processed successfully",
            "original_file_path": target_path,
            "processed_file_path": processed_path
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Keep target_path for blending, it will be cleaned up later or by a separate cleanup process
        pass

@app.post("/api/blend_and_save")
async def blend_and_save(
    original_path: str = Form(...),
    processed_path: str = Form(...),
    blend_ratio: float = Form(...)
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

        blended_filename = f"blended_{uuid.uuid4()}.wav"
        blended_path = os.path.join(OUTPUT_DIR, blended_filename)
        sf.write(blended_path, blended_audio, sr_orig)

        return {"message": "Blended audio saved successfully", "blended_file_path": blended_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/process_batch")
async def process_batch(
    background_tasks: BackgroundTasks,
    preset_file: UploadFile = File(...),
    target_files: List[UploadFile] = File(...),
    blend_ratio: float = Form(1.0)
):
    if not (1 <= len(target_files) <= 20):
        raise HTTPException(status_code=400, detail="Please upload between 1 and 20 target files.")

    batch_id = str(uuid.uuid4())
    batch_jobs[batch_id] = {"status": "pending", "processed_count": 0, "total_count": len(target_files), "output_files": []}

    preset_temp_path = os.path.join(UPLOAD_DIR, preset_file.filename)
    with open(preset_temp_path, "wb") as f:
        shutil.copyfileobj(preset_file.file, f)

    target_file_paths = []
    for target_file in target_files:
        file_location = os.path.join(UPLOAD_DIR, target_file.filename)
        with open(file_location, "wb") as f:
            shutil.copyfileobj(target_file.file, f)
        target_file_paths.append(file_location)

    background_tasks.add_task(
        _run_batch_processing,
        batch_id,
        preset_temp_path,
        target_file_paths,
        blend_ratio
    )

    return {"message": "Batch processing started", "batch_id": batch_id}

def _run_batch_processing(batch_id: str, preset_path: str, target_paths: List[str], blend_ratio: float):
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

@app.get("/temp_files/{filename}")
async def get_temp_file(filename: str):
    # Check if the file is in UPLOAD_DIR or OUTPUT_DIR
    upload_file_path = os.path.join(UPLOAD_DIR, filename)
    output_file_path = os.path.join(OUTPUT_DIR, filename)

    if os.path.exists(upload_file_path):
        return FileResponse(path=upload_file_path, filename=filename)
    elif os.path.exists(output_file_path):
        return FileResponse(path=output_file_path, filename=filename)
    else:
        raise HTTPException(status_code=404, detail="Temporary file not found.")
