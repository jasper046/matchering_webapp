"""
Master Limiter Module

Handles final limiting and master output processing for both single channel
and multi-channel (stem) audio processing workflows.
"""

import os
import numpy as np
import soundfile as sf
from typing import List, Optional
import logging

# Import the existing matchering limiter
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '../../matchering-fork'))
import matchering as mg
from matchering.limiter import limit

logger = logging.getLogger(__name__)


def process_limiter(
    input_paths: List[str],
    output_path: str,
    gain_adjust_db: float = 0.0,
    enable_limiter: bool = True
) -> str:
    """
    Process final master output with optional gain adjustment and limiting.
    
    Args:
        input_paths: List of 1-2 audio file paths (.wav)
                    - Single file mode: [blended_audio.wav]
                    - Stem mode: [vocal_channel.wav, instrumental_channel.wav]
        output_path: Path for final master output (.wav)
        gain_adjust_db: Float -12.0 to +12.0 (master gain before limiter)
        enable_limiter: Boolean (apply Hyrax limiter or not)
        
    Returns:
        str: Path to the processed master output file
        
    Raises:
        ValueError: If parameters are out of valid ranges
        FileNotFoundError: If input files don't exist
        RuntimeError: If audio processing fails
    """
    
    # Validate parameters
    if not input_paths:
        raise ValueError("At least one input file path must be provided")
    
    if len(input_paths) > 2:
        raise ValueError(f"Maximum 2 input files supported, got {len(input_paths)}")
    
    if not (-12.0 <= gain_adjust_db <= 12.0):
        raise ValueError(f"Gain adjustment must be between -12.0dB and +12.0dB, got {gain_adjust_db}")
    
    # Check all input files exist
    for path in input_paths:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Input audio file not found: {path}")
    
    try:
        logger.info(f"Processing master limiter: {len(input_paths)} inputs, gain={gain_adjust_db}dB, limiter={enable_limiter}")
        
        # Load and sum input audio files
        master_audio = None
        sample_rate = None
        
        for i, input_path in enumerate(input_paths):
            audio, sr = sf.read(input_path)
            
            # Set sample rate from first file
            if sample_rate is None:
                sample_rate = sr
            elif sr != sample_rate:
                raise RuntimeError(f"Sample rate mismatch: expected {sample_rate}Hz, got {sr}Hz in {input_path}")
            
            # Ensure audio is 2D (samples, channels)
            if audio.ndim == 1:
                audio = np.expand_dims(audio, axis=1)
            
            if master_audio is None:
                master_audio = audio.copy()
                logger.debug(f"Loaded first input: {input_path} ({audio.shape})")
            else:
                # Align and sum with existing audio
                master_audio, audio = _align_audio_arrays(master_audio, audio)
                master_audio = master_audio + audio
                logger.debug(f"Summed input: {input_path} ({audio.shape})")
        
        # Apply master gain adjustment
        if gain_adjust_db != 0.0:
            gain_linear = 10.0 ** (gain_adjust_db / 20.0)
            master_audio = master_audio * gain_linear
            logger.debug(f"Applied master gain: {gain_adjust_db}dB (linear gain: {gain_linear:.3f})")
        
        # Apply limiter if enabled
        if enable_limiter:
            logger.info("Applying Hyrax limiter")
            # Use the existing matchering limiter
            master_audio = limit(master_audio, mg.Config())
        else:
            logger.info("Limiter bypassed")
        
        # Ensure output directory exists
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Save master output
        sf.write(output_path, master_audio, sample_rate)
        
        logger.info(f"Master processing complete: {output_path}")
        return output_path
        
    except Exception as e:
        logger.error(f"Master limiter processing failed: {str(e)}")
        raise RuntimeError(f"Master processing failed: {str(e)}") from e


def _align_audio_arrays(audio1: np.ndarray, audio2: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Align two audio arrays to have the same shape and length for summing.
    
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
    target_channels = max(audio1.shape[1], audio2.shape[1])
    
    if audio1.shape[1] < target_channels:
        # Duplicate mono to stereo if needed
        if audio1.shape[1] == 1 and target_channels == 2:
            audio1 = np.repeat(audio1, 2, axis=1)
        else:
            # Pad with zeros for other channel mismatches
            padding = ((0, 0), (0, target_channels - audio1.shape[1]))
            audio1 = np.pad(audio1, padding, 'constant')
    
    if audio2.shape[1] < target_channels:
        # Duplicate mono to stereo if needed
        if audio2.shape[1] == 1 and target_channels == 2:
            audio2 = np.repeat(audio2, 2, axis=1)
        else:
            # Pad with zeros for other channel mismatches
            padding = ((0, 0), (0, target_channels - audio2.shape[1]))
            audio2 = np.pad(audio2, padding, 'constant')
    
    # Pad the shorter audio with zeros to match the length of the longer one
    max_len = max(len(audio1), len(audio2))
    if len(audio1) < max_len:
        padding = ((0, max_len - len(audio1)), (0, 0))
        audio1 = np.pad(audio1, padding, 'constant')
    if len(audio2) < max_len:
        padding = ((0, max_len - len(audio2)), (0, 0))
        audio2 = np.pad(audio2, padding, 'constant')
    
    return audio1, audio2


def get_audio_info(file_path: str) -> dict:
    """
    Get comprehensive information about an audio file.
    
    Args:
        file_path: Path to audio file
        
    Returns:
        dict: Audio file information including sample rate, channels, duration, etc.
        
    Raises:
        FileNotFoundError: If file doesn't exist
        RuntimeError: If file is not a valid audio file
    """
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Audio file not found: {file_path}")
    
    try:
        info = sf.info(file_path)
        return {
            'sample_rate': info.samplerate,
            'channels': info.channels,
            'duration': info.duration,
            'frames': info.frames,
            'format': info.format,
            'subtype': info.subtype,
            'file_size_bytes': os.path.getsize(file_path)
        }
    except Exception as e:
        raise RuntimeError(f"Cannot read audio file info {file_path}: {str(e)}") from e