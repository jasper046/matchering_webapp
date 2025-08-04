"""
Frame-Based Processing API Endpoints

Provides RESTful API endpoints for frame-based audio processing functionality.
These endpoints integrate with the existing webapp while enabling real-time
parameter adjustments and smooth preview generation.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, File, UploadFile, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, StreamingResponse
from typing import Optional, Dict, Any
from pydantic import BaseModel
import os
import logging
import uuid
import soundfile as sf
import json
import asyncio
import numpy as np
import struct
import time

from ..audio.frame_processor import (
    FrameBasedPreviewGenerator, 
    ProcessingParameters,
    is_frame_processing_available
)

logger = logging.getLogger(__name__)

# Create router for frame-based endpoints
frame_router = APIRouter(prefix="/api/frame", tags=["frame-processing"])

# Global instances (will be properly managed in integration)
preview_generators = {}  # session_id -> FrameBasedPreviewGenerator


class FrameProcessingRequest(BaseModel):
    """Request model for frame-based processing parameters."""
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    master_gain_db: float = 0.0
    limiter_enabled: bool = True
    is_stem_mode: bool = False
    session_id: Optional[str] = None
    vocal_file_path: Optional[str] = None
    instrumental_file_path: Optional[str] = None


class FrameProcessingResponse(BaseModel):
    """Response model for frame-based processing."""
    success: bool
    message: str
    preview_url: Optional[str] = None
    processing_info: Optional[Dict[str, Any]] = None
    session_id: Optional[str] = None


@frame_router.get("/availability")
async def check_frame_processing_availability():
    """Check if frame-based processing is available."""
    return {
        "available": is_frame_processing_available(),
        "message": "Frame processing ready" if is_frame_processing_available() 
                  else "Frame processing not available"
    }


@frame_router.post("/initialize", response_model=FrameProcessingResponse)
async def initialize_frame_processing(
    audio_file: Optional[UploadFile] = File(None),
    vocal_file: Optional[UploadFile] = File(None),
    instrumental_file: Optional[UploadFile] = File(None),
    preset_file: Optional[UploadFile] = File(None),
    output_dir: str = Form(...),
    sample_rate: int = Form(44100)
):
    """
    Initialize frame-based processing session.
    
    This endpoint sets up a new processing session with the provided audio
    and optional preset file.
    """
    if not is_frame_processing_available():
        raise HTTPException(
            status_code=501, 
            detail="Frame-based processing not available"
        )
    
    try:
        # Generate session ID
        session_id = str(uuid.uuid4())
        
        # Save uploaded audio file
        audio_path = None
        if audio_file:
            audio_path = os.path.join(output_dir, f"frame_session_{session_id}.wav")
            with open(audio_path, "wb") as buffer:
                content = await audio_file.read()
                buffer.write(content)

        vocal_path = None
        if vocal_file:
            vocal_path = os.path.join(output_dir, f"vocal_session_{session_id}.wav")
            with open(vocal_path, "wb") as buffer:
                content = await vocal_file.read()
                buffer.write(content)

        instrumental_path = None
        if instrumental_file:
            instrumental_path = os.path.join(output_dir, f"instrumental_session_{session_id}.wav")
            with open(instrumental_path, "wb") as buffer:
                content = await instrumental_file.read()
                buffer.write(content)
        
        # Load preset data if provided
        preset_data = None
        if preset_file:
            preset_path = os.path.join(output_dir, f"preset_{session_id}.pkl")
            with open(preset_path, "wb") as buffer:
                content = await preset_file.read()
                buffer.write(content)
            
            # Load preset data (assuming it's a pickle file)
            import pickle
            with open(preset_path, "rb") as f:
                preset_data = pickle.load(f)
        
        # Initialize preview generator
        generator = FrameBasedPreviewGenerator(output_dir, sample_rate)
        success = generator.initialize_for_session(preset_data)
        
        if success:
            # Store generator for session
            # Store generator for session
            preview_generators[session_id] = {
                "generator": generator,
                "audio_path": audio_path, # This will be None if stems are used
                "vocal_path": vocal_path,
                "instrumental_path": instrumental_path,
                "output_dir": output_dir
            }

            # Ensure at least one audio input is provided
            if not audio_path and not (vocal_path and instrumental_path):
                raise HTTPException(
                    status_code=400,
                    detail="Either audio_file or both vocal_file and instrumental_file must be provided."
                )
            
            return FrameProcessingResponse(
                success=True,
                message="Frame processing session initialized",
                session_id=session_id,
                processing_info=generator.processor.get_processing_info()
            )
        else:
            raise HTTPException(
                status_code=500,
                detail="Failed to initialize frame processing"
            )
            
    except Exception as e:
        logger.error(f"Frame processing initialization failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@frame_router.post("/preview", response_model=FrameProcessingResponse)
async def generate_frame_preview(request: FrameProcessingRequest):
    """
    Generate real-time preview using frame-based processing.
    
    This endpoint provides fast preview generation for real-time parameter
    adjustments in the web interface.
    """
    session_id = request.session_id
    if not session_id or session_id not in preview_generators:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired session ID"
        )
    
    try:
        session_data = preview_generators[session_id]
        generator = session_data["generator"]
        audio_path = session_data["audio_path"]
        output_dir = session_data["output_dir"]
        
        # Create processing parameters
        params = ProcessingParameters(
            vocal_gain_db=request.vocal_gain_db,
            instrumental_gain_db=request.instrumental_gain_db,
            master_gain_db=request.master_gain_db,
            limiter_enabled=request.limiter_enabled,
            is_stem_mode=request.is_stem_mode
        )
        
        # Generate preview filename
        preview_filename = f"frame_preview_{session_id}_{uuid.uuid4().hex[:8]}.wav"
        
        # Generate preview
        preview_path = generator.generate_preview(
            audio_path, params, preview_filename
        )
        
        # Create download URL
        preview_url = f"/download/frame_preview/{os.path.basename(preview_path)}"
        
        return FrameProcessingResponse(
            success=True,
            message="Frame-based preview generated",
            preview_url=preview_url,
            session_id=session_id,
            processing_info=generator.processor.get_processing_info()
        )
        
    except Exception as e:
        logger.error(f"Frame preview generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@frame_router.post("/process_full", response_model=FrameProcessingResponse)
async def process_full_frame_based(
    request: FrameProcessingRequest,
    background_tasks: BackgroundTasks
):
    """
    Process complete audio file using frame-based approach.
    
    This endpoint processes the full audio file with the current parameters
    and returns the final result.
    """
    session_id = request.session_id
    if not session_id or session_id not in preview_generators:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired session ID"
        )
    
    try:
        session_data = preview_generators[session_id]
        generator = session_data["generator"]
        audio_path = session_data["audio_path"]
        output_dir = session_data["output_dir"]
        
        # Create processing parameters
        params = ProcessingParameters(
            vocal_gain_db=request.vocal_gain_db,
            instrumental_gain_db=request.instrumental_gain_db,
            master_gain_db=request.master_gain_db,
            limiter_enabled=request.limiter_enabled,
            is_stem_mode=request.is_stem_mode
        )
        
        # Generate output filename
        output_filename = f"frame_processed_{session_id}.wav"
        
        # Process full audio (could be run in background for large files)
        output_path = generator.generate_preview(
            audio_path, params, output_filename
        )
        
        # Create download URL
        download_url = f"/download/frame_output/{os.path.basename(output_path)}"
        
        return FrameProcessingResponse(
            success=True,
            message="Frame-based processing completed",
            preview_url=download_url,
            session_id=session_id,
            processing_info=generator.processor.get_processing_info()
        )
        
    except Exception as e:
        logger.error(f"Frame processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@frame_router.delete("/session/{session_id}")
async def cleanup_frame_session(session_id: str):
    """Clean up frame processing session and resources."""
    if session_id in preview_generators:
        try:
            session_data = preview_generators[session_id]
            generator = session_data["generator"]
            
            # Cleanup generator
            generator.cleanup()
            
            # Remove session
            del preview_generators[session_id]
            
            return {
                "success": True,
                "message": f"Session {session_id} cleaned up"
            }
        except Exception as e:
            logger.error(f"Session cleanup failed: {e}")
            return {
                "success": False,
                "message": f"Cleanup failed: {e}"
            }
    else:
        return {
            "success": False,
            "message": "Session not found"
        }
    
    for session_id, session_data in preview_generators.items():
        generator = session_data["generator"]
        info = generator.processor.get_processing_info()
        info["session_id"] = session_id
        processing_info.append(info)
    
    return {
        "total_active_sessions": total_sessions,
        "frame_processing_available": is_frame_processing_available(),
        "session_details": processing_info
    }


# Add download endpoints for frame processing results
@frame_router.get("/download/preview/{filename}")
async def download_frame_preview(filename: str):
    """Download frame-based preview file."""
    # This would need to be implemented with proper path validation
    # and integration with the main download system
    pass


@frame_router.get("/download/output/{filename}")
async def download_frame_output(filename: str):
    """Download frame-based processed output."""
    # This would need to be implemented with proper path validation
    # and integration with the main download system
    pass


@frame_router.get("/waveform/{session_id}")
async def get_waveform_image(session_id: str, stem_type: Optional[str] = None):
    """
    Generate and return a waveform image (PNG) for a given session's audio file.
    """
    if not session_id or session_id not in preview_generators:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired session ID"
        )
    
    # Import here to avoid circular dependencies
    from ..audio.utils import generate_waveform_image, generate_flatline_image, generate_temp_path, cleanup_file
    
    waveform_image_path = None
    try:
        session_data = preview_generators[session_id]
        output_dir = session_data["output_dir"]

        if stem_type == "vocal":
            audio_path = session_data.get("vocal_path")
        elif stem_type == "instrumental":
            audio_path = session_data.get("instrumental_path")
        else:
            audio_path = session_data.get("audio_path")

        if not audio_path:
            raise HTTPException(status_code=404, detail=f"Audio path for stem_type {stem_type} not found in session.")
        
        # Generate a unique temporary path for the waveform image
        waveform_image_path = generate_temp_path(suffix='.png', prefix=f'waveform_{session_id}_{stem_type}_', directory=output_dir)
        
        # Generate the waveform image
        generate_waveform_image(audio_path, waveform_image_path)
        
        # Return the image as a FileResponse
        return FileResponse(waveform_image_path, media_type="image/png", 
                            background=BackgroundTasks([lambda: cleanup_file(waveform_image_path)]))
        
    except Exception as e:
        logger.error(f"Failed to generate waveform image for session {session_id}, stem_type {stem_type}: {e}")
        
        # Generate a flatline image in case of error
        if waveform_image_path is None:
            # If path wasn't generated, create a new one for the flatline
            waveform_image_path = generate_temp_path(suffix='.png', prefix=f'flatline_{session_id}_{stem_type}_', directory=output_dir)
        
        generate_flatline_image(waveform_image_path)
        return FileResponse(waveform_image_path, media_type="image/png", 
                            background=BackgroundTasks([lambda: cleanup_file(waveform_image_path)]))


# Global parameters storage for each session
session_parameters = {}

# WebSocket connections for each session
active_websockets = {}  # session_id -> WebSocket connection
websocket_tasks = {}    # session_id -> asyncio.Task for streaming

def create_wav_header(num_samples, sample_rate, channels):
    """Create WAV file header for streaming audio."""
    import struct
    
    # Calculate data size
    bytes_per_sample = 2  # 16-bit
    data_size = num_samples * channels * bytes_per_sample
    file_size = data_size + 36  # 36 bytes for WAV header (excluding the first 8 bytes)
    
    # Create WAV header
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',           # ChunkID
        file_size,         # ChunkSize
        b'WAVE',           # Format
        b'fmt ',           # Subchunk1ID
        16,                # Subchunk1Size (PCM)
        1,                 # AudioFormat (PCM)
        channels,          # NumChannels
        sample_rate,       # SampleRate
        sample_rate * channels * bytes_per_sample,  # ByteRate
        channels * bytes_per_sample,  # BlockAlign
        16,                # BitsPerSample
        b'data',           # Subchunk2ID
        data_size          # Subchunk2Size
    )
    
    return header

# HTTP parameter update endpoint removed - WebSocket-only parameter updates via /ws/{session_id}


@frame_router.get("/websocket/status")
async def websocket_status():
    """Get status of active WebSocket connections."""
    return {
        "active_connections": len(active_websockets),
        "active_sessions": list(active_websockets.keys()),
        "streaming_tasks": len(websocket_tasks)
    }

@frame_router.get("/stream/{session_id}")
async def stream_audio(session_id: str, start_time: float = 0.0):
    """
    Streams audio with real-time processing using current parameters.
    Python generates audio frames on-demand (JIT) with current control settings.
    """
    if not session_id or session_id not in preview_generators:
        raise HTTPException(
            status_code=404,
            detail="Invalid or expired session ID"
        )

    try:
        session_data = preview_generators[session_id]
        original_path = session_data["original_audio_path"]
        processed_path = session_data["processed_audio_path"]
        
        # Get current parameters (defaults if not set)
        params = session_parameters.get(session_id, {
            "blend_ratio": 0.5,
            "master_gain_db": 0.0,
            "vocal_gain_db": 0.0,
            "instrumental_gain_db": 0.0,
            "limiter_enabled": True,
            "is_stem_mode": False
        })
        
        logger.info(f"Streaming with parameters: {params}")
        
        def generate_audio_stream():
            """
            Generator that yields audio chunks processed with current parameters.
            Reads parameters dynamically for each chunk to enable seamless updates.
            """
            import soundfile as sf
            import numpy as np
            import io
            import struct
            
            # Load original and processed audio once
            original_audio, sample_rate = sf.read(original_path)
            processed_audio, _ = sf.read(processed_path)
            
            # Ensure both have same length
            min_length = min(len(original_audio), len(processed_audio))
            original_audio = original_audio[:min_length]
            processed_audio = processed_audio[:min_length]
            
            # Calculate start sample from start_time
            start_sample_offset = int(start_time * sample_rate)
            start_sample_offset = max(0, min(start_sample_offset, len(original_audio) - 1))
            
            # Trim audio to start from seek position
            original_audio = original_audio[start_sample_offset:]
            processed_audio = processed_audio[start_sample_offset:]
            
            # Determine if stereo or mono
            is_stereo = len(original_audio.shape) > 1 and original_audio.shape[1] == 2
            channels = 2 if is_stereo else 1
            
            # Create WAV header for remaining audio
            wav_header = create_wav_header(len(original_audio), sample_rate, channels)
            yield wav_header
            
            # Process audio in chunks for seamless parameter updates
            chunk_samples = 4096  # Process 4096 samples at a time
            
            for start_sample in range(0, len(original_audio), chunk_samples):
                end_sample = min(start_sample + chunk_samples, len(original_audio))
                
                # Get current parameters (may have changed since last chunk)
                current_params = session_parameters.get(session_id, {
                    "blend_ratio": 0.5,
                    "master_gain_db": 0.0,
                    "limiter_enabled": True
                })
                
                # Extract chunk
                orig_chunk = original_audio[start_sample:end_sample]
                proc_chunk = processed_audio[start_sample:end_sample]
                
                # Apply blend ratio
                blend_ratio = current_params["blend_ratio"]
                blended_chunk = orig_chunk * (1.0 - blend_ratio) + proc_chunk * blend_ratio
                
                # Apply master gain
                master_gain_linear = 10 ** (current_params["master_gain_db"] / 20.0)
                blended_chunk = blended_chunk * master_gain_linear
                
                # Apply limiter if enabled
                if current_params["limiter_enabled"]:
                    blended_chunk = np.clip(blended_chunk, -0.95, 0.95)
                
                # Convert to 16-bit PCM and yield
                if is_stereo:
                    # Interleave stereo channels
                    pcm_data = (blended_chunk * 32767).astype(np.int16)
                    pcm_bytes = pcm_data.flatten().tobytes()
                else:
                    # Mono
                    pcm_data = (blended_chunk * 32767).astype(np.int16)
                    pcm_bytes = pcm_data.tobytes()
                
                yield pcm_bytes
        
        return StreamingResponse(
            generate_audio_stream(), 
            media_type="audio/wav",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache"
            }
        )

    except Exception as e:
        logger.error(f"Failed to stream audio for session {session_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@frame_router.websocket("/ws/{session_id}")
async def websocket_audio_stream(websocket: WebSocket, session_id: str):
    """
    WebSocket endpoint for real-time audio streaming with bidirectional communication.
    Provides audio chunks with position data and accepts parameter updates.
    """
    logger.info(f"WebSocket connection attempt for session: {session_id}")
    logger.info(f"Available sessions: {list(preview_generators.keys())}")
    
    await websocket.accept()
    
    if not session_id or session_id not in preview_generators:
        logger.error(f"Invalid session ID: {session_id}. Available: {list(preview_generators.keys())}")
        await websocket.close(code=1008, reason="Invalid or expired session ID")
        return
    
    session_data = preview_generators[session_id]
    is_stem_mode = session_data.get("is_stem_mode", False)
    logger.info(f"Session {session_id} is_stem_mode: {is_stem_mode}")
    
    # Store WebSocket connection
    active_websockets[session_id] = websocket
    
    try:
        session_data = preview_generators[session_id]
        is_stem_mode = session_data.get("is_stem_mode", False)
        
        if is_stem_mode:
            # Stem mode - load vocal and instrumental stems
            target_vocal_path = session_data["target_vocal_path"]
            target_instrumental_path = session_data["target_instrumental_path"]
            processed_vocal_path = session_data["processed_vocal_path"]
            processed_instrumental_path = session_data["processed_instrumental_path"]
            
            # Load all stem audio data
            target_vocal_audio, sample_rate = sf.read(target_vocal_path)
            target_instrumental_audio, _ = sf.read(target_instrumental_path)
            processed_vocal_audio, _ = sf.read(processed_vocal_path)
            processed_instrumental_audio, _ = sf.read(processed_instrumental_path)
            
            # Ensure all stems have same length
            min_length = min(len(target_vocal_audio), len(target_instrumental_audio),
                           len(processed_vocal_audio), len(processed_instrumental_audio))
            target_vocal_audio = target_vocal_audio[:min_length]
            target_instrumental_audio = target_instrumental_audio[:min_length]
            processed_vocal_audio = processed_vocal_audio[:min_length]
            processed_instrumental_audio = processed_instrumental_audio[:min_length]
            
            # For compatibility, set original_audio to combined target stems
            original_audio = target_vocal_audio + target_instrumental_audio
            processed_audio = processed_vocal_audio + processed_instrumental_audio
        else:
            # Non-stem mode - load single original and processed
            original_path = session_data["original_audio_path"]
            processed_path = session_data["processed_audio_path"]
            
            # Load audio data once
            original_audio, sample_rate = sf.read(original_path)
            processed_audio, _ = sf.read(processed_path)
        
        # Ensure both have same length
        min_length = min(len(original_audio), len(processed_audio))
        original_audio = original_audio[:min_length]
        processed_audio = processed_audio[:min_length]
        
        # Determine audio properties
        is_stereo = len(original_audio.shape) > 1 and original_audio.shape[1] == 2
        channels = 2 if is_stereo else 1
        total_duration = len(original_audio) / sample_rate
        
        # Streaming state
        current_position = 0  # Current sample position
        is_playing = False
        chunk_samples = 4096  # Balance between smoothness and responsiveness
        
        # Simple streaming task
        async def audio_streaming_task():
            nonlocal current_position, is_playing
            
            while True:
                if is_playing and current_position < len(original_audio):
                    # Get current parameters
                    if is_stem_mode:
                        params = session_parameters.get(session_id, {
                            "vocal_blend_ratio": 0.5,
                            "instrumental_blend_ratio": 0.5,
                            "vocal_gain_db": 0.0,
                            "instrumental_gain_db": 0.0,
                            "master_gain_db": 0.0,
                            "vocal_muted": False,
                            "instrumental_muted": False,
                            "limiter_enabled": True
                        })
                    else:
                        params = session_parameters.get(session_id, {
                            "blend_ratio": 0.5,
                            "master_gain_db": 0.0,
                            "limiter_enabled": True
                        })
                    
                    # Extract chunk
                    end_sample = min(current_position + chunk_samples, len(original_audio))
                    
                    if is_stem_mode:
                        # Stem mode processing
                        target_vocal_chunk = target_vocal_audio[current_position:end_sample]
                        target_instrumental_chunk = target_instrumental_audio[current_position:end_sample]
                        processed_vocal_chunk = processed_vocal_audio[current_position:end_sample]
                        processed_instrumental_chunk = processed_instrumental_audio[current_position:end_sample]
                        
                        if len(target_vocal_chunk) == 0:
                            # End of audio reached
                            is_playing = False
                            await websocket.send_json({
                                "type": "playback_ended",
                                "position": 1.0
                            })
                            continue
                        
                        # Apply blend ratios to each stem
                        vocal_blend_ratio = params["vocal_blend_ratio"]
                        instrumental_blend_ratio = params["instrumental_blend_ratio"]
                        
                        blended_vocal = target_vocal_chunk * (1.0 - vocal_blend_ratio) + processed_vocal_chunk * vocal_blend_ratio
                        blended_instrumental = target_instrumental_chunk * (1.0 - instrumental_blend_ratio) + processed_instrumental_chunk * instrumental_blend_ratio
                        
                        # Apply gain adjustments
                        vocal_gain_linear = 10 ** (params["vocal_gain_db"] / 20.0)
                        instrumental_gain_linear = 10 ** (params["instrumental_gain_db"] / 20.0)
                        
                        blended_vocal = blended_vocal * vocal_gain_linear
                        blended_instrumental = blended_instrumental * instrumental_gain_linear
                        
                        # Apply mute
                        if params["vocal_muted"]:
                            blended_vocal = np.zeros_like(blended_vocal)
                        if params["instrumental_muted"]:
                            blended_instrumental = np.zeros_like(blended_instrumental)
                        
                        # Combine stems
                        blended_chunk = blended_vocal + blended_instrumental
                        
                    else:
                        # Non-stem mode processing
                        orig_chunk = original_audio[current_position:end_sample]
                        proc_chunk = processed_audio[current_position:end_sample]
                        
                        if len(orig_chunk) == 0:
                            # End of audio reached
                            is_playing = False
                            await websocket.send_json({
                                "type": "playback_ended",
                                "position": 1.0
                            })
                            continue
                        
                        # Apply blend ratio
                        blend_ratio = params["blend_ratio"]
                        blended_chunk = orig_chunk * (1.0 - blend_ratio) + proc_chunk * blend_ratio
                    
                    # Apply master gain
                    master_gain_linear = 10 ** (params["master_gain_db"] / 20.0)
                    blended_chunk = blended_chunk * master_gain_linear
                    
                    # Apply limiter if enabled
                    if params["limiter_enabled"]:
                        blended_chunk = np.clip(blended_chunk, -0.95, 0.95)
                    
                    # Convert to 16-bit PCM
                    if is_stereo:
                        pcm_data = (blended_chunk * 32767).astype(np.int16)
                        pcm_bytes = pcm_data.flatten().tobytes()
                    else:
                        pcm_data = (blended_chunk * 32767).astype(np.int16)
                        pcm_bytes = pcm_data.tobytes()
                    
                    # Calculate position
                    position = current_position / len(original_audio)
                    
                    # Send audio chunk with position metadata
                    await websocket.send_json({
                        "type": "audio_chunk",
                        "position": position,
                        "sample_rate": sample_rate,
                        "channels": channels,
                        "chunk_size": len(pcm_bytes)
                    })
                    
                    # Send audio data as binary
                    await websocket.send_bytes(pcm_bytes)
                    
                    # Update position
                    current_position = end_sample
                    
                    # Wait based on chunk duration - simplified timing
                    chunk_duration = chunk_samples / sample_rate
                    await asyncio.sleep(chunk_duration * 0.9)  # Send 10% faster to prevent underruns
                
                else:
                    # Not playing or reached end, wait briefly
                    await asyncio.sleep(0.05)
        
        # Start streaming task
        streaming_task = asyncio.create_task(audio_streaming_task())
        websocket_tasks[session_id] = streaming_task
        
        # Handle incoming messages
        async for message in websocket.iter_text():
            try:
                data = json.loads(message)
                msg_type = data.get("type")
                
                if msg_type == "play":
                    is_playing = True
                    await websocket.send_json({"type": "status", "playing": True})
                    
                elif msg_type == "pause":
                    is_playing = False
                    await websocket.send_json({"type": "status", "playing": False})
                    
                elif msg_type == "stop":
                    is_playing = False
                    current_position = 0
                    await websocket.send_json({"type": "status", "playing": False, "position": 0.0})
                    
                elif msg_type == "seek":
                    seek_position = data.get("position", 0.0)  # 0.0 to 1.0
                    current_position = int(seek_position * len(original_audio))
                    current_position = max(0, min(current_position, len(original_audio) - 1))
                    await websocket.send_json({
                        "type": "seeked", 
                        "position": current_position / len(original_audio)
                    })
                    
                elif msg_type == "parameters":
                    # Update session parameters
                    params = data.get("params", {})
                    
                    if is_stem_mode:
                        # Stem mode parameters
                        session_parameters[session_id] = {
                            "vocal_blend_ratio": params.get('vocal_blend_ratio', 0.5),
                            "instrumental_blend_ratio": params.get('instrumental_blend_ratio', 0.5),
                            "vocal_gain_db": params.get('vocal_gain_db', 0.0),
                            "instrumental_gain_db": params.get('instrumental_gain_db', 0.0),
                            "master_gain_db": params.get('master_gain_db', 0.0),
                            "vocal_muted": params.get('vocal_muted', False),
                            "instrumental_muted": params.get('instrumental_muted', False),
                            "limiter_enabled": params.get('limiter_enabled', True),
                            "is_stem_mode": True
                        }
                    else:
                        # Non-stem mode parameters
                        session_parameters[session_id] = {
                            "blend_ratio": params.get('blend_ratio', 0.5),
                            "master_gain_db": params.get('master_gain_db', 0.0),
                            "vocal_gain_db": params.get('vocal_gain_db', 0.0),
                            "instrumental_gain_db": params.get('instrumental_gain_db', 0.0),
                            "limiter_enabled": params.get('limiter_enabled', True),
                            "is_stem_mode": False
                        }
                    await websocket.send_json({"type": "parameters_updated"})
                    
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
            except Exception as e:
                logger.error(f"WebSocket message handling error: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})
    
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error for session {session_id}: {e}")
    finally:
        # Cleanup
        if session_id in active_websockets:
            del active_websockets[session_id]
        if session_id in websocket_tasks:
            task = websocket_tasks[session_id]
            task.cancel()
            del websocket_tasks[session_id]