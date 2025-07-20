"""
Frame-Based Audio Processing Integration

This module provides a clean abstraction layer for frame-based audio processing
in the web application. It integrates the frame processing algorithms with the
existing webapp architecture while maintaining separation of concerns.
"""

import numpy as np
import soundfile as sf
import os
import logging
from typing import Dict, Any, Optional, Tuple, Callable
from dataclasses import dataclass
from pathlib import Path

# Import frame processing components
import sys
from pathlib import Path

# Add frame processing directory to path
frame_processing_dir = Path(__file__).parent.parent.parent / 'tests' / 'frame_processing'
if frame_processing_dir.exists():
    sys.path.insert(0, str(frame_processing_dir))

try:
    from frame_algorithms import FrameProcessor, FrameConfig
    from frame_aware_limiter import FrameAwareLimiterProcessor
    FRAME_PROCESSING_AVAILABLE = True
    logging.info("Frame processing components loaded successfully")
except ImportError as e:
    logging.warning(f"Frame processing not available: {e}")
    FRAME_PROCESSING_AVAILABLE = False

logger = logging.getLogger(__name__)


@dataclass
class ProcessingParameters:
    """Parameters for real-time audio processing."""
    # Channel parameters
    vocal_gain_db: float = 0.0
    instrumental_gain_db: float = 0.0
    
    # Master parameters
    master_gain_db: float = 0.0
    limiter_enabled: bool = True
    
    # Processing mode
    is_stem_mode: bool = False


class FrameBasedProcessor:
    """
    High-level frame-based audio processor for webapp integration.
    
    Provides a clean interface that abstracts frame processing complexity
    from the UI layer. Changes to frame algorithms should only require
    updates within this class.
    """
    
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.frame_processor = None
        self.limiter_processor = None
        self.is_initialized = False
        
        # Processing state
        self.current_params = ProcessingParameters()
        self.audio_cache = {}
        
        # Frame configuration (can be adjusted without UI changes)
        self.frame_config = FrameConfig(
            frame_size=4096,
            overlap_ratio=4,  # 4:1 ratio - good balance of quality/performance
            crossfade_type="raised_cosine"
        )
        
    def initialize(self, preset_data: Optional[Dict] = None) -> bool:
        """
        Initialize frame-based processing components.
        
        Args:
            preset_data: Optional matchering preset data
            
        Returns:
            True if initialization successful
        """
        if not FRAME_PROCESSING_AVAILABLE:
            logger.warning("Frame processing not available, falling back to monolithic")
            return False
            
        try:
            # Initialize frame processor for channel processing
            self.frame_processor = FrameProcessor(
                config=self.frame_config,
                sample_rate=self.sample_rate
            )
            
            # Initialize frame-aware limiter
            self.limiter_processor = FrameAwareLimiterProcessor(
                sample_rate=self.sample_rate,
                frame_size=self.frame_config.frame_size
            )
            self.limiter_processor.initialize_limiter()
            
            # Load preset if provided
            if preset_data:
                self.frame_processor.load_preset(preset_data)
            
            self.is_initialized = True
            logger.info("Frame-based processing initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize frame processing: {e}")
            self.is_initialized = False
            return False
    
    def update_parameters(self, params: ProcessingParameters) -> None:
        """Update processing parameters for real-time adjustment."""
        self.current_params = params
        
        if self.frame_processor:
            # Update channel gains in frame processor
            self.frame_processor.update_real_time_params({
                'vocal_gain_db': params.vocal_gain_db,
                'instrumental_gain_db': params.instrumental_gain_db,
                'master_gain_db': params.master_gain_db
            })
    
    def process_audio_preview(self, audio_data: np.ndarray, 
                            progress_callback: Optional[Callable] = None) -> np.ndarray:
        """
        Process audio data using frame-based approach for real-time preview.
        
        Args:
            audio_data: Input audio data (samples × channels)
            progress_callback: Optional callback for progress updates
            
        Returns:
            Processed audio data
        """
        if not self.is_initialized:
            logger.warning("Frame processor not initialized, returning unprocessed audio")
            return audio_data
        
        try:
            # Process in frames for smooth real-time performance
            return self._process_frames(audio_data, progress_callback)
            
        except Exception as e:
            logger.error(f"Frame processing failed: {e}")
            return audio_data
    
    def _process_frames(self, audio_data: np.ndarray,
                       progress_callback: Optional[Callable] = None) -> np.ndarray:
        """Internal frame processing implementation."""
        
        # Calculate frame parameters
        frame_size = self.frame_config.frame_size
        overlap_size = frame_size // self.frame_config.overlap_ratio
        hop_size = frame_size - overlap_size
        
        total_frames = (len(audio_data) + hop_size - 1) // hop_size
        processed_frames = []
        
        # Process audio in overlapping frames
        for frame_idx in range(total_frames):
            start_idx = frame_idx * hop_size
            end_idx = min(start_idx + frame_size, len(audio_data))
            
            # Extract frame with zero padding if needed
            if end_idx - start_idx < frame_size:
                frame = np.zeros((frame_size, audio_data.shape[1]))
                frame[:end_idx - start_idx] = audio_data[start_idx:end_idx]
            else:
                frame = audio_data[start_idx:end_idx]
            
            # Process frame through channel processing
            if self.current_params.is_stem_mode:
                processed_frame = self._process_stem_frame(frame)
            else:
                processed_frame = self._process_standard_frame(frame)
            
            # Apply master limiter if enabled
            if self.current_params.limiter_enabled:
                processed_frame = self.limiter_processor.process_audio_frame(
                    processed_frame,
                    gain_adjust_db=self.current_params.master_gain_db,
                    enable_limiter=True
                )
            else:
                # Apply master gain without limiting
                if self.current_params.master_gain_db != 0:
                    gain_linear = 10 ** (self.current_params.master_gain_db / 20.0)
                    processed_frame = processed_frame * gain_linear
            
            processed_frames.append(processed_frame)
            
            # Report progress
            if progress_callback and frame_idx % 10 == 0:
                progress = (frame_idx + 1) / total_frames * 100
                progress_callback(progress)
        
        # Combine frames using overlap-add
        return self._overlap_add_frames(processed_frames, hop_size, len(audio_data))
    
    def _process_stem_frame(self, frame: np.ndarray) -> np.ndarray:
        """Process frame in stem separation mode."""
        # In stem mode, each channel represents vocal/instrumental
        processed = frame.copy()
        
        # Apply individual channel gains
        vocal_gain = 10 ** (self.current_params.vocal_gain_db / 20.0)
        instrumental_gain = 10 ** (self.current_params.instrumental_gain_db / 20.0)
        
        if processed.shape[1] >= 2:
            processed[:, 0] *= vocal_gain       # Left = vocal
            processed[:, 1] *= instrumental_gain  # Right = instrumental
        
        return processed
    
    def _process_standard_frame(self, frame: np.ndarray) -> np.ndarray:
        """Process frame in standard matchering mode."""
        if not self.frame_processor:
            return frame
            
        # Apply matchering processing to frame
        # This would integrate with the frame_algorithms.py processing
        return self.frame_processor.process_frame(frame)
    
    def _overlap_add_frames(self, frames: list, hop_size: int, 
                           original_length: int) -> np.ndarray:
        """Combine processed frames using overlap-add reconstruction."""
        if not frames:
            return np.array([])
        
        frame_size = len(frames[0])
        overlap_size = frame_size - hop_size
        channels = frames[0].shape[1]
        
        # Initialize output buffer
        output_length = original_length
        output = np.zeros((output_length, channels))
        
        # Raised cosine window for smooth blending
        window = self._create_crossfade_window(overlap_size)
        
        for frame_idx, frame in enumerate(frames):
            start_pos = frame_idx * hop_size
            end_pos = min(start_pos + frame_size, output_length)
            
            if start_pos >= output_length:
                break
                
            # Apply crossfade window to overlapping regions
            frame_to_add = frame[:end_pos - start_pos].copy()
            
            if frame_idx > 0 and overlap_size > 0:
                # Apply fade-in to beginning of frame
                fade_end = min(overlap_size, len(frame_to_add))
                for ch in range(channels):
                    frame_to_add[:fade_end, ch] *= window[:fade_end]
            
            if frame_idx < len(frames) - 1 and overlap_size > 0:
                # Apply fade-out to end of frame
                fade_start = max(0, len(frame_to_add) - overlap_size)
                for ch in range(channels):
                    frame_to_add[fade_start:, ch] *= window[:len(frame_to_add) - fade_start][::-1]
            
            # Add to output buffer
            output[start_pos:end_pos] += frame_to_add
        
        return output
    
    def _create_crossfade_window(self, size: int) -> np.ndarray:
        """Create raised cosine crossfade window."""
        if size <= 1:
            return np.ones(size)
        
        t = np.linspace(0, 1, size)
        return 0.5 * (1 - np.cos(np.pi * t))
    
    def get_processing_info(self) -> Dict[str, Any]:
        """Get current processing information and statistics."""
        info = {
            "frame_processing_available": FRAME_PROCESSING_AVAILABLE,
            "initialized": self.is_initialized,
            "sample_rate": self.sample_rate,
            "frame_config": {
                "frame_size": self.frame_config.frame_size,
                "overlap_ratio": self.frame_config.overlap_ratio,
                "crossfade_type": self.frame_config.crossfade_type
            },
            "current_parameters": {
                "vocal_gain_db": self.current_params.vocal_gain_db,
                "instrumental_gain_db": self.current_params.instrumental_gain_db,
                "master_gain_db": self.current_params.master_gain_db,
                "limiter_enabled": self.current_params.limiter_enabled,
                "is_stem_mode": self.current_params.is_stem_mode
            }
        }
        
        if self.limiter_processor:
            limiter_info = self.limiter_processor.get_processing_info()
            info["limiter_state"] = limiter_info
        
        return info
    
    def reset(self):
        """Reset processor state for new processing session."""
        if self.frame_processor:
            self.frame_processor.reset()
        if self.limiter_processor:
            self.limiter_processor.reset()
        
        self.audio_cache.clear()
        self.current_params = ProcessingParameters()


class FrameBasedPreviewGenerator:
    """
    Generates real-time preview audio using frame-based processing.
    
    This class handles the webapp's preview generation needs while
    maintaining compatibility with the existing API structure.
    """
    
    def __init__(self, output_dir: str, sample_rate: int = 44100):
        self.output_dir = output_dir
        self.sample_rate = sample_rate
        self.processor = FrameBasedProcessor(sample_rate)
        
    def initialize_for_session(self, preset_data: Optional[Dict] = None) -> bool:
        """Initialize processor for a new processing session."""
        return self.processor.initialize(preset_data)
    
    def generate_preview(self, audio_file_path: str, 
                        params: ProcessingParameters,
                        output_filename: str) -> str:
        """
        Generate preview audio file using frame-based processing.
        
        Args:
            audio_file_path: Path to input audio file
            params: Processing parameters
            output_filename: Name for output file
            
        Returns:
            Path to generated preview file
        """
        try:
            # Load audio file
            audio_data, sr = sf.read(audio_file_path)
            
            # Resample if needed
            if sr != self.sample_rate:
                # Simple resampling - could be improved with proper resampling
                logger.warning(f"Sample rate mismatch: {sr} vs {self.sample_rate}")
            
            # Ensure stereo
            if audio_data.ndim == 1:
                audio_data = np.column_stack([audio_data, audio_data])
            
            # Update processor parameters
            self.processor.update_parameters(params)
            
            # Process audio
            processed_audio = self.processor.process_audio_preview(audio_data)
            
            # Save preview file
            output_path = os.path.join(self.output_dir, output_filename)
            sf.write(output_path, processed_audio, self.sample_rate)
            
            logger.info(f"Frame-based preview generated: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"Failed to generate frame-based preview: {e}")
            raise
    
    def cleanup(self):
        """Clean up processor resources."""
        self.processor.reset()


# Factory function for webapp integration
def create_frame_processor(sample_rate: int = 44100) -> FrameBasedProcessor:
    """Factory function to create frame-based processor instance."""
    return FrameBasedProcessor(sample_rate)


def is_frame_processing_available() -> bool:
    """Check if frame processing is available in current environment."""
    return FRAME_PROCESSING_AVAILABLE