"""
Frame-Aware Master Limiter Implementation

This module implements a stateful, frame-aware version of the Hyrax limiter
for smooth real-time parameter adjustments in the web application.

The implementation maintains internal state (lookahead buffers, filter states,
gain history) across frame boundaries to ensure seamless audio processing.
"""

import numpy as np
import scipy.signal as signal
from scipy import ndimage
from typing import Optional, Tuple, Dict, Any
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class LimiterConfig:
    """Configuration for frame-aware limiter."""
    attack_ms: float = 1.0
    hold_ms: float = 1.0
    release_ms: float = 3000.0
    attack_filter_coefficient: float = -2.0
    hold_filter_order: int = 1
    hold_filter_coefficient: float = 7.0
    release_filter_order: int = 1
    release_filter_coefficient: float = 800.0
    threshold_db: float = -0.1
    sample_rate: int = 44100
    frame_size: int = 4096
    overlap_size: int = 1024


@dataclass 
class LimiterState:
    """Internal state for frame-aware limiter."""
    # Lookahead and overlap buffers
    lookahead_buffer: np.ndarray
    overlap_buffer: np.ndarray
    
    # Filter states for gain smoothing
    attack_filter_state: Optional[np.ndarray]
    hold_filter_state: Optional[np.ndarray] 
    release_filter_state: Optional[np.ndarray]
    
    # Gain reduction history
    previous_gain_envelope: np.ndarray
    current_gain_level: float
    
    # Frame processing metadata
    samples_processed: int
    frame_count: int
    
    def __post_init__(self):
        """Initialize arrays if they're None."""
        if self.lookahead_buffer is None:
            self.lookahead_buffer = np.array([])
        if self.overlap_buffer is None:
            self.overlap_buffer = np.array([])
        if self.previous_gain_envelope is None:
            self.previous_gain_envelope = np.array([1.0])


class StatefulSlidingWindow:
    """Stateful implementation of sliding window maximum for peak detection."""
    
    def __init__(self, window_size: int):
        self.window_size = window_size
        self.buffer = np.zeros(window_size)
        self.position = 0
        self.filled = False
    
    def process(self, new_samples: np.ndarray) -> np.ndarray:
        """
        Process new samples and return sliding window maximum.
        
        Args:
            new_samples: Input audio samples
            
        Returns:
            Array of maximum values for each position
        """
        output = np.zeros(len(new_samples))
        
        for i, sample in enumerate(new_samples):
            # Add new sample to circular buffer
            self.buffer[self.position] = abs(sample)
            self.position = (self.position + 1) % self.window_size
            
            if not self.filled and self.position == 0:
                self.filled = True
            
            # Calculate maximum in current window
            if self.filled:
                output[i] = np.max(self.buffer)
            else:
                # Partial window - only consider filled portion
                active_length = self.position if self.position > 0 else self.window_size
                output[i] = np.max(self.buffer[:active_length])
        
        return output


class FrameAwareLimiter:
    """
    Frame-aware implementation of the Hyrax limiter.
    
    Maintains internal state across frame boundaries to enable smooth
    real-time parameter adjustments while preserving limiting quality.
    """
    
    def __init__(self, config: LimiterConfig):
        self.config = config
        self.state = None
        self._initialize_filters()
        self._calculate_sample_parameters()
    
    def _initialize_filters(self):
        """Initialize filter coefficients for gain smoothing."""
        # Attack filter (exponential smoothing)
        attack_coeff = self.config.attack_filter_coefficient
        self.attack_alpha = np.exp(attack_coeff / (self.config.sample_rate * self.config.attack_ms / 1000))
        
        # Hold filter (Butterworth low-pass)
        hold_freq = self.config.hold_filter_coefficient
        hold_nyquist = self.config.sample_rate / 2
        hold_normalized_freq = min(hold_freq / hold_nyquist, 0.99)
        
        self.hold_filter_b, self.hold_filter_a = signal.butter(
            self.config.hold_filter_order, 
            hold_normalized_freq, 
            btype='low'
        )
        
        # Release filter (Butterworth low-pass)
        release_freq = self.config.release_filter_coefficient
        release_normalized_freq = min(release_freq / hold_nyquist, 0.99)
        
        self.release_filter_b, self.release_filter_a = signal.butter(
            self.config.release_filter_order,
            release_normalized_freq,
            btype='low'
        )
    
    def _calculate_sample_parameters(self):
        """Calculate sample-based parameters from millisecond values."""
        sr = self.config.sample_rate
        
        self.attack_samples = max(1, int(self.config.attack_ms * sr / 1000))
        self.hold_samples = max(1, int(self.config.hold_ms * sr / 1000))
        self.release_samples = max(1, int(self.config.release_ms * sr / 1000))
        
        # Make attack window odd for symmetry
        if self.attack_samples % 2 == 0:
            self.attack_samples += 1
        
        # Lookahead buffer size (largest window needed)
        self.lookahead_size = max(self.attack_samples, self.hold_samples)
        
        # Overlap size for seamless processing
        self.overlap_size = min(self.config.overlap_size, self.lookahead_size)
        
        logger.debug(f"Limiter parameters: attack={self.attack_samples}, "
                    f"hold={self.hold_samples}, lookahead={self.lookahead_size}")
    
    def reset_state(self):
        """Reset internal state for new processing session."""
        channels = 2  # Assume stereo
        
        self.state = LimiterState(
            lookahead_buffer=np.zeros((self.lookahead_size, channels)),
            overlap_buffer=np.zeros((self.overlap_size, channels)),
            attack_filter_state=None,
            hold_filter_state=None,
            release_filter_state=None,
            previous_gain_envelope=np.ones(self.overlap_size),
            current_gain_level=1.0,
            samples_processed=0,
            frame_count=0
        )
        
        # Initialize sliding window for peak detection
        self.sliding_windows = [
            StatefulSlidingWindow(self.attack_samples) for _ in range(channels)
        ]
    
    def process_frame(self, audio_frame: np.ndarray, 
                     gain_adjust_db: float = 0.0) -> np.ndarray:
        """
        Process a single audio frame with limiting.
        
        Args:
            audio_frame: Input audio frame (samples × channels)
            gain_adjust_db: Pre-limiter gain adjustment in dB
            
        Returns:
            Limited audio frame
        """
        if self.state is None:
            self.reset_state()
        
        # Ensure stereo input
        if audio_frame.ndim == 1:
            audio_frame = np.column_stack([audio_frame, audio_frame])
        elif audio_frame.shape[1] == 1:
            audio_frame = np.column_stack([audio_frame[:, 0], audio_frame[:, 0]])
        
        # Apply pre-limiter gain
        if gain_adjust_db != 0:
            gain_linear = 10 ** (gain_adjust_db / 20.0)
            audio_frame = audio_frame * gain_linear
        
        # Add frame to lookahead buffer
        buffered_audio = self._update_lookahead_buffer(audio_frame)
        
        # Process with limiting if buffer is full enough
        if len(buffered_audio) >= self.config.frame_size:
            limited_frame = self._process_with_limiting(
                buffered_audio[:self.config.frame_size]
            )
        else:
            # Not enough samples for full processing - return dry signal
            limited_frame = buffered_audio[:len(audio_frame)]
        
        self.state.frame_count += 1
        self.state.samples_processed += len(audio_frame)
        
        return limited_frame
    
    def _update_lookahead_buffer(self, new_frame: np.ndarray) -> np.ndarray:
        """Update lookahead buffer with new audio frame."""
        # Append new frame to buffer
        self.state.lookahead_buffer = np.vstack([
            self.state.lookahead_buffer,
            new_frame
        ])
        
        # Keep buffer size manageable
        max_buffer_size = self.lookahead_size + self.config.frame_size
        if len(self.state.lookahead_buffer) > max_buffer_size:
            excess = len(self.state.lookahead_buffer) - max_buffer_size
            self.state.lookahead_buffer = self.state.lookahead_buffer[excess:]
        
        return self.state.lookahead_buffer
    
    def _process_with_limiting(self, audio_buffer: np.ndarray) -> np.ndarray:
        """Apply limiting algorithm to audio buffer."""
        channels = audio_buffer.shape[1]
        output_frame = np.zeros_like(audio_buffer)
        
        # Process each channel
        for ch in range(channels):
            channel_audio = audio_buffer[:, ch]
            
            # Step 1: Peak detection with sliding window
            peaks = self.sliding_windows[ch].process(channel_audio)
            
            # Step 2: Calculate gain reduction
            threshold_linear = 10 ** (self.config.threshold_db / 20.0)
            gain_reduction = np.minimum(1.0, threshold_linear / (peaks + 1e-10))
            
            # Step 3: Smooth gain reduction (attack stage)
            smooth_gain = self._apply_attack_smoothing(gain_reduction, ch)
            
            # Step 4: Apply hold and release stages  
            final_gain = self._apply_hold_release(smooth_gain, ch)
            
            # Step 5: Apply gain to audio
            output_frame[:, ch] = channel_audio * final_gain
        
        return output_frame
    
    def _apply_attack_smoothing(self, gain_reduction: np.ndarray, 
                               channel: int) -> np.ndarray:
        """Apply attack stage smoothing to gain reduction."""
        # Use exponential smoothing instead of filtfilt for causality
        smoothed = np.zeros_like(gain_reduction)
        
        # Initialize with previous state
        if len(self.state.previous_gain_envelope) > 0:
            prev_gain = self.state.previous_gain_envelope[-1]
        else:
            prev_gain = 1.0
        
        # Apply exponential smoothing
        for i, gain in enumerate(gain_reduction):
            if i == 0:
                smoothed[i] = self.attack_alpha * prev_gain + (1 - self.attack_alpha) * gain
            else:
                smoothed[i] = self.attack_alpha * smoothed[i-1] + (1 - self.attack_alpha) * gain
        
        return smoothed
    
    def _apply_hold_release(self, gain_envelope: np.ndarray, 
                           channel: int) -> np.ndarray:
        """Apply hold and release stages using stateful filters."""
        # Initialize filter states if needed
        if self.state.hold_filter_state is None:
            self.state.hold_filter_state = signal.lfilter_zi(
                self.hold_filter_b, self.hold_filter_a
            ) * gain_envelope[0]
        
        if self.state.release_filter_state is None:
            self.state.release_filter_state = signal.lfilter_zi(
                self.release_filter_b, self.release_filter_a  
            ) * gain_envelope[0]
        
        # Apply hold filter
        hold_output, self.state.hold_filter_state = signal.lfilter(
            self.hold_filter_b, self.hold_filter_a, gain_envelope,
            zi=self.state.hold_filter_state
        )
        
        # Apply release filter  
        final_output, self.state.release_filter_state = signal.lfilter(
            self.release_filter_b, self.release_filter_a, hold_output,
            zi=self.state.release_filter_state
        )
        
        # Update state for next frame
        if len(final_output) >= self.overlap_size:
            self.state.previous_gain_envelope = final_output[-self.overlap_size:]
        
        return final_output
    
    def get_state_info(self) -> Dict[str, Any]:
        """Get current state information for debugging."""
        if self.state is None:
            return {"initialized": False}
        
        return {
            "initialized": True,
            "frame_count": self.state.frame_count,
            "samples_processed": self.state.samples_processed,
            "buffer_size": len(self.state.lookahead_buffer),
            "current_gain": self.state.current_gain_level,
            "config": {
                "attack_ms": self.config.attack_ms,
                "hold_ms": self.config.hold_ms,
                "release_ms": self.config.release_ms,
                "threshold_db": self.config.threshold_db,
                "frame_size": self.config.frame_size
            }
        }


class FrameAwareLimiterProcessor:
    """
    High-level processor that integrates frame-aware limiting with channel processing.
    
    This class provides a simplified interface for the webapp integration.
    """
    
    def __init__(self, sample_rate: int = 44100, frame_size: int = 4096):
        self.sample_rate = sample_rate
        self.frame_size = frame_size
        self.limiter = None
    
    def initialize_limiter(self, config_params: Optional[Dict[str, Any]] = None) -> None:
        """Initialize limiter with optional custom parameters."""
        config = LimiterConfig(
            sample_rate=self.sample_rate,
            frame_size=self.frame_size
        )
        
        # Override with custom parameters
        if config_params:
            for key, value in config_params.items():
                if hasattr(config, key):
                    setattr(config, key, value)
        
        self.limiter = FrameAwareLimiter(config)
        self.limiter.reset_state()
    
    def process_audio_frame(self, audio_frame: np.ndarray,
                           gain_adjust_db: float = 0.0,
                           enable_limiter: bool = True) -> np.ndarray:
        """
        Process audio frame with optional limiting.
        
        Args:
            audio_frame: Input audio (samples × channels)
            gain_adjust_db: Pre-limiter gain adjustment
            enable_limiter: Whether to apply limiting
            
        Returns:
            Processed audio frame
        """
        if not enable_limiter:
            # Apply gain without limiting
            if gain_adjust_db != 0:
                gain_linear = 10 ** (gain_adjust_db / 20.0)
                return audio_frame * gain_linear
            return audio_frame
        
        if self.limiter is None:
            self.initialize_limiter()
        
        return self.limiter.process_frame(audio_frame, gain_adjust_db)
    
    def reset(self):
        """Reset limiter state."""
        if self.limiter is not None:
            self.limiter.reset_state()
    
    def get_processing_info(self) -> Dict[str, Any]:
        """Get processing information and statistics."""
        if self.limiter is None:
            return {"limiter_initialized": False}
        
        info = self.limiter.get_state_info()
        info.update({
            "processor_sample_rate": self.sample_rate,
            "processor_frame_size": self.frame_size
        })
        
        return info