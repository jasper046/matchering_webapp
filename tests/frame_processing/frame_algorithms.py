"""
Frame-Based Audio Processing Algorithms

This module implements various frame-based audio processing approaches
for real-time parameter adjustment capabilities.
"""

import numpy as np
import soundfile as sf
from typing import Dict, List, Tuple, Any, Optional
from dataclasses import dataclass
import tempfile
import os


@dataclass
class FrameConfig:
    """Configuration for frame-based processing."""
    name: str
    full_frame_size: int
    overlap_size: int
    crossfade_type: str
    description: str
    
    @property
    def hop_size(self) -> int:
        """Calculate hop size (non-overlapping portion)."""
        return self.full_frame_size - self.overlap_size
    
    @property
    def overlap_percentage(self) -> float:
        """Calculate overlap percentage."""
        return (self.overlap_size / self.full_frame_size) * 100


@dataclass
class FrameInfo:
    """Metadata for individual audio frames."""
    index: int
    start_sample: int
    end_sample: int
    actual_size: int
    needs_crossfade_start: bool
    needs_crossfade_end: bool
    is_last_frame: bool


class CrossfadeGenerator:
    """Generates crossfade windows for frame overlaps."""
    
    @staticmethod
    def raised_cosine(length: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate raised cosine crossfade windows.
        
        Returns:
            Tuple of (fade_out, fade_in) windows
        """
        if length == 0:
            return np.array([]), np.array([])
        
        # Generate raised cosine (Hann-like) window
        t = np.linspace(0, np.pi, length)
        fade_out = np.cos(t * 0.5) ** 2  # Fade out: 1 -> 0
        fade_in = np.sin(t * 0.5) ** 2   # Fade in: 0 -> 1
        
        return fade_out, fade_in
    
    @staticmethod
    def linear(length: int) -> Tuple[np.ndarray, np.ndarray]:
        """
        Generate linear crossfade windows.
        
        Returns:
            Tuple of (fade_out, fade_in) windows
        """
        if length == 0:
            return np.array([]), np.array([])
        
        fade_out = np.linspace(1.0, 0.0, length)
        fade_in = np.linspace(0.0, 1.0, length)
        
        return fade_out, fade_in


class AudioFrameSegmenter:
    """Handles segmentation of audio into overlapping frames."""
    
    def __init__(self, config: FrameConfig):
        self.config = config
    
    def segment_audio(self, audio: np.ndarray) -> List[Tuple[np.ndarray, FrameInfo]]:
        """
        Segment audio into overlapping frames.
        
        Args:
            audio: Input audio array (mono or stereo)
            
        Returns:
            List of (frame_data, frame_info) tuples
        """
        frames = []
        audio_length = len(audio)
        
        # Handle edge case of very short audio
        if audio_length <= self.config.full_frame_size:
            frame_info = FrameInfo(
                index=0,
                start_sample=0,
                end_sample=audio_length,
                actual_size=audio_length,
                needs_crossfade_start=False,
                needs_crossfade_end=False,
                is_last_frame=True
            )
            return [(audio.copy(), frame_info)]
        
        frame_index = 0
        current_start = 0
        
        while current_start < audio_length:
            # Calculate frame boundaries
            frame_end = min(current_start + self.config.full_frame_size, audio_length)
            actual_frame_size = frame_end - current_start
            
            # Extract frame data
            if audio.ndim == 1:
                frame_data = audio[current_start:frame_end].copy()
            else:
                frame_data = audio[current_start:frame_end, :].copy()
            
            # Create frame info
            frame_info = FrameInfo(
                index=frame_index,
                start_sample=current_start,
                end_sample=frame_end,
                actual_size=actual_frame_size,
                needs_crossfade_start=current_start > 0,
                needs_crossfade_end=frame_end < audio_length,
                is_last_frame=frame_end >= audio_length
            )
            
            frames.append((frame_data, frame_info))
            
            # Move to next frame position
            current_start += self.config.hop_size
            frame_index += 1
            
            # Break if we're past the end
            if current_start >= audio_length:
                break
        
        return frames
    
    def reconstruct_audio(self, processed_frames: List[Tuple[np.ndarray, FrameInfo]], 
                         original_length: int) -> np.ndarray:
        """
        Reconstruct audio from processed frames with crossfading.
        
        Args:
            processed_frames: List of (processed_frame_data, frame_info) tuples
            original_length: Length of original audio for proper reconstruction
            
        Returns:
            Reconstructed audio array
        """
        if not processed_frames:
            return np.array([])
        
        # Determine output shape
        first_frame, _ = processed_frames[0]
        if first_frame.ndim == 1:
            output = np.zeros(original_length)
        else:
            output = np.zeros((original_length, first_frame.shape[1]))
        
        # Overlap-add reconstruction with crossfading
        for i, (frame_data, frame_info) in enumerate(processed_frames):
            start_pos = frame_info.start_sample
            end_pos = min(start_pos + len(frame_data), original_length)
            
            if end_pos <= start_pos:
                continue
            
            # Trim frame data if it extends beyond output
            if len(frame_data) > (end_pos - start_pos):
                if frame_data.ndim == 1:
                    frame_data = frame_data[:end_pos - start_pos]
                else:
                    frame_data = frame_data[:end_pos - start_pos, :]
            
            # Apply crossfading if needed
            if self.config.overlap_size > 0 and not frame_info.is_last_frame:
                frame_data = self._apply_crossfade(frame_data, frame_info, processed_frames, i)
            
            # Add to output
            if output.ndim == 1:
                output[start_pos:end_pos] += frame_data
            else:
                output[start_pos:end_pos, :] += frame_data
        
        return output
    
    def _apply_crossfade(self, frame_data: np.ndarray, frame_info: FrameInfo,
                        all_frames: List[Tuple[np.ndarray, FrameInfo]], 
                        current_index: int) -> np.ndarray:
        """Apply crossfading to overlapping regions."""
        if self.config.crossfade_type == "none" or self.config.overlap_size == 0:
            return frame_data
        
        # Create crossfade windows
        if self.config.crossfade_type == "raised_cosine":
            fade_out, fade_in = CrossfadeGenerator.raised_cosine(self.config.overlap_size)
        elif self.config.crossfade_type == "linear":
            fade_out, fade_in = CrossfadeGenerator.linear(self.config.overlap_size)
        else:
            return frame_data
        
        # Apply fade-out to the end of current frame
        if frame_info.needs_crossfade_end and len(frame_data) >= self.config.overlap_size:
            fade_region_start = len(frame_data) - self.config.overlap_size
            if frame_data.ndim == 1:
                frame_data[fade_region_start:] *= fade_out
            else:
                frame_data[fade_region_start:, :] *= fade_out[:, np.newaxis]
        
        return frame_data


class FrameProcessor:
    """Main frame-based audio processor."""
    
    def __init__(self, config: FrameConfig):
        self.config = config
        self.segmenter = AudioFrameSegmenter(config)
    
    def process_audio_with_parameters(self, original_path: str, processed_path: str,
                                    output_path: str, parameters: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process audio using frame-based approach with given parameters.
        
        Args:
            original_path: Path to original/dry audio
            processed_path: Path to processed/wet audio
            output_path: Path for final output
            parameters: Processing parameters dict
            
        Returns:
            Dict with processing results and metadata
        """
        # Load audio files
        original_audio, sample_rate = sf.read(original_path)
        processed_audio, _ = sf.read(processed_path)
        
        # Ensure same length
        min_length = min(len(original_audio), len(processed_audio))
        original_audio = original_audio[:min_length]
        processed_audio = processed_audio[:min_length]
        
        # Segment audio into frames
        original_frames = self.segmenter.segment_audio(original_audio)
        processed_frames = self.segmenter.segment_audio(processed_audio)
        
        # Process each frame
        processed_frame_results = []
        total_processing_time = 0
        
        for (orig_frame, frame_info), (proc_frame, _) in zip(original_frames, processed_frames):
            start_time = time.time()
            
            # Apply frame-level processing
            blended_frame = self._process_single_frame(
                orig_frame, proc_frame, parameters, frame_info
            )
            
            processing_time = time.time() - start_time
            total_processing_time += processing_time
            
            processed_frame_results.append((blended_frame, frame_info))
        
        # Reconstruct final audio
        final_audio = self.segmenter.reconstruct_audio(processed_frame_results, min_length)
        
        # Apply master processing if needed
        if parameters.get('master_gain_db', 0) != 0 or parameters.get('enable_limiter', False):
            final_audio = self._apply_master_processing(final_audio, parameters, sample_rate)
        
        # Save result
        sf.write(output_path, final_audio, sample_rate)
        
        return {
            'num_frames': len(original_frames),
            'total_processing_time': total_processing_time,
            'avg_frame_time': total_processing_time / len(original_frames) if original_frames else 0,
            'overhead_ms': total_processing_time * 1000,
            'frame_size': self.config.full_frame_size,
            'overlap_size': self.config.overlap_size
        }
    
    def _process_single_frame(self, original_frame: np.ndarray, processed_frame: np.ndarray,
                            parameters: Dict[str, Any], frame_info: FrameInfo) -> np.ndarray:
        """
        Process a single frame with given parameters.
        
        This simulates the channel processing stage.
        """
        # Extract parameters
        blend_ratio = parameters.get('blend_ratio', 0.5)
        volume_adjust_db = parameters.get('volume_adjust_db', 0.0)
        mute = parameters.get('mute', False)
        
        if mute:
            return np.zeros_like(original_frame)
        
        # Apply blending
        blended = (1.0 - blend_ratio) * original_frame + blend_ratio * processed_frame
        
        # Apply volume adjustment
        if volume_adjust_db != 0:
            volume_linear = 10 ** (volume_adjust_db / 20.0)
            blended *= volume_linear
        
        # Prevent clipping
        blended = np.clip(blended, -1.0, 1.0)
        
        return blended
    
    def _apply_master_processing(self, audio: np.ndarray, parameters: Dict[str, Any], 
                               sample_rate: int) -> np.ndarray:
        """
        Apply master gain and limiting to final audio.
        
        Note: This is a simplified version. Real implementation would need
        to handle limiter state across frames properly.
        """
        # Apply master gain
        master_gain_db = parameters.get('master_gain_db', 0.0)
        if master_gain_db != 0:
            gain_linear = 10 ** (master_gain_db / 20.0)
            audio *= gain_linear
        
        # Simple limiting (replace with proper frame-aware limiter)
        if parameters.get('enable_limiter', False):
            # Basic hard limiter as placeholder
            audio = np.clip(audio, -0.95, 0.95)
        
        return audio
    
    def update_parameters_realtime(self, frame_index: int, new_parameters: Dict[str, Any]) -> bool:
        """
        Update processing parameters for real-time use.
        
        This would be used in the webapp for live parameter changes.
        """
        # In real implementation, this would:
        # 1. Update parameter cache
        # 2. Mark affected frames for reprocessing  
        # 3. Trigger incremental update
        
        # For now, just return success
        return True


# Import time for timing measurements
import time