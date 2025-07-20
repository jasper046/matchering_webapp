"""
Frame-Based Processing API Endpoints

Provides RESTful API endpoints for frame-based audio processing functionality.
These endpoints integrate with the existing webapp while enabling real-time
parameter adjustments and smooth preview generation.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, File, UploadFile, Form
from fastapi.responses import FileResponse
from typing import Optional, Dict, Any
from pydantic import BaseModel
import os
import logging
import uuid
import soundfile as sf

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
    audio_file: UploadFile = File(...),
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
        audio_path = os.path.join(output_dir, f"frame_session_{session_id}.wav")
        with open(audio_path, "wb") as buffer:
            content = await audio_file.read()
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
            preview_generators[session_id] = {
                "generator": generator,
                "audio_path": audio_path,
                "output_dir": output_dir
            }
            
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


@frame_router.get("/sessions")
async def list_active_sessions():
    """List all active frame processing sessions."""
    return {
        "active_sessions": list(preview_generators.keys()),
        "total_sessions": len(preview_generators)
    }


@frame_router.get("/performance")
async def get_performance_metrics():
    """Get frame processing performance metrics."""
    if not preview_generators:
        return {
            "message": "No active sessions",
            "metrics": {}
        }
    
    # Aggregate metrics from active sessions
    total_sessions = len(preview_generators)
    processing_info = []
    
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