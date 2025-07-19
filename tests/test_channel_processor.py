"""
Unit tests for the channel_processor module.
"""

import os
import tempfile
import numpy as np
import soundfile as sf
import pytest
from unittest.mock import patch

# Add the app directory to the path for imports
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.audio.channel_processor import (
    process_channel,
    validate_audio_file,
    _align_audio_arrays
)
from tests.test_utils import (
    TemporaryAudioFile,
    create_test_audio,
    compare_audio_files,
    get_audio_properties
)


class TestChannelProcessor:
    """Test cases for the channel processor module."""
    
    def test_basic_blend_processing(self, temp_dir):
        """Test basic channel blending functionality."""
        
        # Create test audio files
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create original audio (lower amplitude)
        original_audio = create_test_audio(duration=0.5, amplitude=0.3, frequency=440)
        sf.write(original_path, original_audio, 44100)
        
        # Create processed audio (higher amplitude, different frequency)
        processed_audio = create_test_audio(duration=0.5, amplitude=0.7, frequency=880)
        sf.write(processed_path, processed_audio, 44100)
        
        # Test 50% blend
        result_path = process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path,
            blend_ratio=0.5
        )
        
        assert result_path == output_path
        assert os.path.exists(output_path)
        
        # Verify output properties
        props = get_audio_properties(output_path)
        assert props['sample_rate'] == 44100
        assert props['channels'] == 2
        assert props['duration'] == pytest.approx(0.5, abs=0.01)
        
        # Load and verify blended audio
        output_audio, _ = sf.read(output_path)
        expected_audio = (original_audio * 0.5) + (processed_audio * 0.5)
        
        # Check if blending is correct (within tolerance for audio file I/O)
        assert np.allclose(output_audio, expected_audio, atol=1e-4)
    
    def test_extreme_blend_ratios(self, temp_dir):
        """Test extreme blend ratios (0% and 100%)."""
        
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        
        # Create test files
        original_audio = create_test_audio(amplitude=0.3, frequency=440)
        processed_audio = create_test_audio(amplitude=0.7, frequency=880)
        sf.write(original_path, original_audio, 44100)
        sf.write(processed_path, processed_audio, 44100)
        
        # Test 0% blend (100% original)
        output_path_0 = os.path.join(temp_dir, "output_0.wav")
        process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path_0,
            blend_ratio=0.0
        )
        
        # Should match original
        assert compare_audio_files(original_path, output_path_0, tolerance=1e-4)
        
        # Test 100% blend (100% processed)
        output_path_100 = os.path.join(temp_dir, "output_100.wav")
        process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path_100,
            blend_ratio=1.0
        )
        
        # Should match processed
        assert compare_audio_files(processed_path, output_path_100, tolerance=1e-4)
    
    def test_volume_adjustment(self, temp_dir):
        """Test volume adjustment functionality."""
        
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio
        audio = create_test_audio(amplitude=0.5)
        sf.write(original_path, audio, 44100)
        sf.write(processed_path, audio, 44100)  # Same for simplicity
        
        # Test +6dB gain
        process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path,
            blend_ratio=1.0,  # 100% processed for easier testing
            volume_adjust_db=6.0
        )
        
        # Verify gain was applied
        output_audio, _ = sf.read(output_path)
        expected_gain = 10.0 ** (6.0 / 20.0)  # ~2.0
        expected_audio = audio * expected_gain
        
        assert np.allclose(output_audio, expected_audio, atol=1e-4)
        
        # Test -6dB gain
        output_path_neg = os.path.join(temp_dir, "output_neg.wav")
        process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path_neg,
            blend_ratio=1.0,
            volume_adjust_db=-6.0
        )
        
        output_audio_neg, _ = sf.read(output_path_neg)
        expected_gain_neg = 10.0 ** (-6.0 / 20.0)  # ~0.5
        expected_audio_neg = audio * expected_gain_neg
        
        assert np.allclose(output_audio_neg, expected_audio_neg, atol=1e-4)
    
    def test_mute_functionality(self, temp_dir):
        """Test mute functionality."""
        
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio
        audio = create_test_audio(amplitude=0.5)
        sf.write(original_path, audio, 44100)
        sf.write(processed_path, audio, 44100)
        
        # Test mute
        process_channel(
            original_path=original_path,
            processed_path=processed_path,
            output_path=output_path,
            blend_ratio=0.5,
            mute=True
        )
        
        # Verify output is silence
        output_audio, _ = sf.read(output_path)
        assert np.allclose(output_audio, np.zeros_like(audio), atol=1e-10)
    
    def test_parameter_validation(self, temp_dir):
        """Test parameter validation."""
        
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test files
        audio = create_test_audio()
        sf.write(original_path, audio, 44100)
        sf.write(processed_path, audio, 44100)
        
        # Test invalid blend ratio
        with pytest.raises(ValueError, match="Blend ratio must be between 0.0 and 1.0"):
            process_channel(
                original_path=original_path,
                processed_path=processed_path,
                output_path=output_path,
                blend_ratio=1.5
            )
        
        with pytest.raises(ValueError, match="Blend ratio must be between 0.0 and 1.0"):
            process_channel(
                original_path=original_path,
                processed_path=processed_path,
                output_path=output_path,
                blend_ratio=-0.1
            )
        
        # Test invalid volume adjustment
        with pytest.raises(ValueError, match="Volume adjustment must be between -12.0dB and \\+12.0dB"):
            process_channel(
                original_path=original_path,
                processed_path=processed_path,
                output_path=output_path,
                blend_ratio=0.5,
                volume_adjust_db=15.0
            )
        
        with pytest.raises(ValueError, match="Volume adjustment must be between -12.0dB and \\+12.0dB"):
            process_channel(
                original_path=original_path,
                processed_path=processed_path,
                output_path=output_path,
                blend_ratio=0.5,
                volume_adjust_db=-15.0
            )
    
    def test_file_not_found_errors(self, temp_dir):
        """Test file not found error handling."""
        
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Test non-existent original file
        with pytest.raises(FileNotFoundError, match="Original audio file not found"):
            process_channel(
                original_path="/nonexistent/original.wav",
                processed_path="/nonexistent/processed.wav",
                output_path=output_path,
                blend_ratio=0.5
            )
    
    def test_mismatched_sample_rates(self, temp_dir):
        """Test handling of mismatched sample rates."""
        
        original_path = os.path.join(temp_dir, "original.wav")
        processed_path = os.path.join(temp_dir, "processed.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create files with different sample rates
        audio = create_test_audio()
        sf.write(original_path, audio, 44100)
        sf.write(processed_path, audio, 48000)  # Different sample rate
        
        # Should raise runtime error
        with pytest.raises(RuntimeError, match="Sample rates don't match"):
            process_channel(
                original_path=original_path,
                processed_path=processed_path,
                output_path=output_path,
                blend_ratio=0.5
            )


class TestAudioAlignment:
    """Test cases for audio array alignment functionality."""
    
    def test_align_same_shape_arrays(self):
        """Test aligning arrays that already have the same shape."""
        
        audio1 = np.random.random((1000, 2))
        audio2 = np.random.random((1000, 2))
        
        aligned1, aligned2 = _align_audio_arrays(audio1, audio2)
        
        assert aligned1.shape == aligned2.shape == (1000, 2)
        assert np.array_equal(aligned1, audio1)
        assert np.array_equal(aligned2, audio2)
    
    def test_align_different_lengths(self):
        """Test aligning arrays with different lengths."""
        
        audio1 = np.random.random((500, 2))
        audio2 = np.random.random((1000, 2))
        
        aligned1, aligned2 = _align_audio_arrays(audio1, audio2)
        
        # Both should now have length 1000
        assert aligned1.shape == aligned2.shape == (1000, 2)
        
        # First 500 samples of aligned1 should match original audio1
        assert np.array_equal(aligned1[:500], audio1)
        
        # Last 500 samples of aligned1 should be zeros (padding)
        assert np.allclose(aligned1[500:], 0)
        
        # aligned2 should be unchanged
        assert np.array_equal(aligned2, audio2)
    
    def test_align_mono_to_stereo(self):
        """Test converting mono arrays to consistent format."""
        
        mono_audio = np.random.random(1000)  # 1D mono
        stereo_audio = np.random.random((1000, 2))
        
        aligned1, aligned2 = _align_audio_arrays(mono_audio, stereo_audio)
        
        # Both should be 2D with same number of channels
        assert aligned1.shape[1] == aligned2.shape[1]
        assert aligned1.shape[0] == aligned2.shape[0] == 1000
        # In our implementation, when channels differ, we convert both to mono
        # This is the expected behavior for channel processing


class TestAudioValidation:
    """Test cases for audio file validation."""
    
    def test_validate_valid_audio_file(self, temp_dir):
        """Test validation of a valid audio file."""
        
        file_path = os.path.join(temp_dir, "test.wav")
        audio = create_test_audio(duration=2.0, sample_rate=48000, channels=1)
        sf.write(file_path, audio, 48000)
        
        sample_rate, channels, duration = validate_audio_file(file_path)
        
        assert sample_rate == 48000
        assert channels == 1
        assert duration == pytest.approx(2.0, abs=0.01)
    
    def test_validate_nonexistent_file(self):
        """Test validation of non-existent file."""
        
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            validate_audio_file("/nonexistent/file.wav")
    
    def test_validate_invalid_audio_file(self, temp_dir):
        """Test validation of invalid audio file."""
        
        # Create a text file instead of audio
        invalid_path = os.path.join(temp_dir, "invalid.wav")
        with open(invalid_path, "w") as f:
            f.write("This is not an audio file")
        
        with pytest.raises(RuntimeError, match="Invalid audio file"):
            validate_audio_file(invalid_path)