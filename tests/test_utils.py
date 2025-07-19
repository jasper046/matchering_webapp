"""
Test utilities for creating test audio files and common test functions.
"""

import os
import tempfile
import numpy as np
import soundfile as sf
from typing import Tuple, Optional
import pytest


def create_test_audio(
    duration: float = 1.0,
    sample_rate: int = 44100,
    channels: int = 2,
    frequency: float = 440.0,
    amplitude: float = 0.5
) -> np.ndarray:
    """
    Create a test audio signal (sine wave).
    
    Args:
        duration: Duration in seconds
        sample_rate: Sample rate in Hz
        channels: Number of channels (1=mono, 2=stereo)
        frequency: Frequency of sine wave in Hz
        amplitude: Amplitude (0.0 to 1.0)
        
    Returns:
        np.ndarray: Audio data array
    """
    
    samples = int(duration * sample_rate)
    t = np.linspace(0, duration, samples, endpoint=False)
    
    # Generate sine wave
    audio = amplitude * np.sin(2 * np.pi * frequency * t)
    
    # Convert to stereo if needed
    if channels == 2:
        audio = np.column_stack([audio, audio])
    elif channels == 1:
        audio = audio.reshape(-1, 1)
    
    return audio


def create_test_audio_file(
    file_path: str,
    duration: float = 1.0,
    sample_rate: int = 44100,
    channels: int = 2,
    frequency: float = 440.0,
    amplitude: float = 0.5
) -> str:
    """
    Create a test audio file on disk.
    
    Args:
        file_path: Path where to save the audio file
        duration: Duration in seconds
        sample_rate: Sample rate in Hz
        channels: Number of channels (1=mono, 2=stereo)
        frequency: Frequency of sine wave in Hz
        amplitude: Amplitude (0.0 to 1.0)
        
    Returns:
        str: Path to created file
    """
    
    audio_data = create_test_audio(duration, sample_rate, channels, frequency, amplitude)
    
    # Ensure directory exists
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    
    # Save audio file
    sf.write(file_path, audio_data, sample_rate)
    
    return file_path


class TemporaryAudioFile:
    """Context manager for creating temporary audio files."""
    
    def __init__(
        self,
        duration: float = 1.0,
        sample_rate: int = 44100,
        channels: int = 2,
        frequency: float = 440.0,
        amplitude: float = 0.5,
        suffix: str = '.wav'
    ):
        self.duration = duration
        self.sample_rate = sample_rate
        self.channels = channels
        self.frequency = frequency
        self.amplitude = amplitude
        self.suffix = suffix
        self.file_path = None
        
    def __enter__(self) -> str:
        # Create temporary file
        fd, self.file_path = tempfile.mkstemp(suffix=self.suffix)
        os.close(fd)  # Close file descriptor, we'll write with soundfile
        
        # Create test audio file
        create_test_audio_file(
            self.file_path,
            self.duration,
            self.sample_rate,
            self.channels,
            self.frequency,
            self.amplitude
        )
        
        return self.file_path
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        # Clean up temporary file
        if self.file_path and os.path.exists(self.file_path):
            os.remove(self.file_path)


def compare_audio_files(file1: str, file2: str, tolerance: float = 1e-6) -> bool:
    """
    Compare two audio files for similarity within tolerance.
    
    Args:
        file1: Path to first audio file
        file2: Path to second audio file
        tolerance: Maximum difference allowed between samples
        
    Returns:
        bool: True if files are similar within tolerance
    """
    
    try:
        audio1, sr1 = sf.read(file1)
        audio2, sr2 = sf.read(file2)
        
        # Check sample rates match
        if sr1 != sr2:
            return False
        
        # Ensure same shape
        if audio1.shape != audio2.shape:
            return False
        
        # Check if difference is within tolerance
        max_diff = np.max(np.abs(audio1 - audio2))
        return max_diff <= tolerance
        
    except Exception:
        return False


def get_audio_properties(file_path: str) -> dict:
    """
    Get properties of an audio file for testing.
    
    Args:
        file_path: Path to audio file
        
    Returns:
        dict: Audio properties
    """
    
    try:
        info = sf.info(file_path)
        audio_data, _ = sf.read(file_path)
        
        return {
            'sample_rate': info.samplerate,
            'channels': info.channels,
            'duration': info.duration,
            'frames': info.frames,
            'max_amplitude': np.max(np.abs(audio_data)),
            'rms': np.sqrt(np.mean(audio_data ** 2)),
            'shape': audio_data.shape
        }
    except Exception as e:
        return {'error': str(e)}


@pytest.fixture
def temp_dir():
    """Pytest fixture for temporary directory."""
    with tempfile.TemporaryDirectory() as temp_dir:
        yield temp_dir


@pytest.fixture
def test_audio_mono():
    """Pytest fixture for mono test audio file."""
    with TemporaryAudioFile(duration=0.5, channels=1, frequency=1000) as file_path:
        yield file_path


@pytest.fixture
def test_audio_stereo():
    """Pytest fixture for stereo test audio file."""
    with TemporaryAudioFile(duration=0.5, channels=2, frequency=500) as file_path:
        yield file_path


@pytest.fixture
def test_audio_pair():
    """Pytest fixture for a pair of test audio files (original and processed)."""
    with TemporaryAudioFile(duration=0.3, frequency=440, amplitude=0.3) as original:
        with TemporaryAudioFile(duration=0.3, frequency=880, amplitude=0.7) as processed:
            yield original, processed