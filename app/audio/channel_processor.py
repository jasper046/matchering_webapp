"""
Channel Processing Module

Handles audio channel blending, volume adjustment, and muting operations.
This module provides a clean interface for processing individual audio channels
with consistent behavior across all application flows.
"""

import os
import numpy as np
import soundfile as sf
from typing import Optional
import logging

logger = logging.getLogger(__name__)


def process_channel(
    original_path: str,
    processed_path: str,
    output_path: str,
    blend_ratio: float,
    volume_adjust_db: float = 0.0,
    mute: bool = False
) -> str:
    """
    Process a single audio channel with blending, volume adjustment, and muting.
    
    Args:
        original_path: Path to original/dry audio file (.wav)
        processed_path: Path to processed/wet audio file (.wav) 
        output_path: Path for output blended audio file (.wav)
        blend_ratio: Float 0.0-1.0 (0=dry, 1=wet)
        volume_adjust_db: Float -12.0 to +12.0 (dB adjustment)
        mute: Boolean (if True, output silence)
        
    Returns:
        str: Path to the processed output file
        
    Raises:
        ValueError: If parameters are out of valid ranges
        FileNotFoundError: If input files don't exist
        RuntimeError: If audio processing fails
    """
    
    # Validate parameters
    if not (0.0 <= blend_ratio <= 1.0):
        raise ValueError(f"Blend ratio must be between 0.0 and 1.0, got {blend_ratio}")
    
    if not (-12.0 <= volume_adjust_db <= 12.0):
        raise ValueError(f"Volume adjustment must be between -12.0dB and +12.0dB, got {volume_adjust_db}")
    
    # Check input files exist
    if not os.path.exists(original_path):
        raise FileNotFoundError(f"Original audio file not found: {original_path}")
    
    if not os.path.exists(processed_path):
        raise FileNotFoundError(f"Processed audio file not found: {processed_path}")
    
    try:
        logger.info(f"Processing channel: blend={blend_ratio}, volume={volume_adjust_db}dB, mute={mute}")
        
        # Load audio files
        original_audio, sr_orig = sf.read(original_path)
        processed_audio, sr_proc = sf.read(processed_path)
        
        # Validate sample rates match
        if sr_orig != sr_proc:
            raise RuntimeError(f"Sample rates don't match: original={sr_orig}Hz, processed={sr_proc}Hz")
        
        # Ensure both arrays have the same shape
        original_audio, processed_audio = _align_audio_arrays(original_audio, processed_audio)
        
        # Handle mute case early
        if mute:
            logger.info("Channel is muted, outputting silence")
            output_audio = np.zeros_like(original_audio)
        else:
            # Apply blend ratio
            output_audio = (original_audio * (1.0 - blend_ratio)) + (processed_audio * blend_ratio)
            
            # Apply volume adjustment (convert dB to linear gain)
            if volume_adjust_db != 0.0:
                gain_linear = 10.0 ** (volume_adjust_db / 20.0)
                output_audio = output_audio * gain_linear
                logger.debug(f"Applied volume adjustment: {volume_adjust_db}dB (linear gain: {gain_linear:.3f})")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save processed audio
        sf.write(output_path, output_audio, sr_orig)
        
        logger.info(f"Channel processing complete: {output_path}")
        return output_path
        
    except Exception as e:
        logger.error(f"Channel processing failed: {str(e)}")
        raise RuntimeError(f"Audio processing failed: {str(e)}") from e


def _align_audio_arrays(audio1: np.ndarray, audio2: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Align two audio arrays to have the same shape and length.
    
    Args:
        audio1: First audio array
        audio2: Second audio array
        
    Returns:
        tuple: (aligned_audio1, aligned_audio2)
    """
    
    # Ensure both arrays have the same number of dimensions
    if audio1.ndim == 1:
        audio1 = np.expand_dims(audio1, axis=1)
    if audio2.ndim == 1:
        audio2 = np.expand_dims(audio2, axis=1)
    
    # Ensure both arrays have the same number of channels
    if audio1.shape[1] != audio2.shape[1]:
        # Convert to mono if channel counts differ
        if audio1.shape[1] > 1:
            audio1 = np.mean(audio1, axis=1, keepdims=True)
        if audio2.shape[1] > 1:
            audio2 = np.mean(audio2, axis=1, keepdims=True)
    
    # Pad the shorter audio with zeros to match the length of the longer one
    max_len = max(len(audio1), len(audio2))
    if len(audio1) < max_len:
        padding = ((0, max_len - len(audio1)), (0, 0))
        audio1 = np.pad(audio1, padding, 'constant')
    if len(audio2) < max_len:
        padding = ((0, max_len - len(audio2)), (0, 0))
        audio2 = np.pad(audio2, padding, 'constant')
    
    return audio1, audio2


def validate_audio_file(file_path: str) -> tuple[int, int, float]:
    """
    Validate an audio file and return its properties.
    
    Args:
        file_path: Path to audio file
        
    Returns:
        tuple: (sample_rate, channels, duration_seconds)
        
    Raises:
        FileNotFoundError: If file doesn't exist
        RuntimeError: If file is not a valid audio file
    """
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")
    
    try:
        info = sf.info(file_path)
        return info.samplerate, info.channels, info.duration
    except Exception as e:
        raise RuntimeError(f"Invalid audio file {file_path}: {str(e)}") from e