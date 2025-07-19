"""
Unit tests for the master_limiter module.
"""

import os
import tempfile
import numpy as np
import soundfile as sf
import pytest
from unittest.mock import patch, MagicMock

# Add the app directory to the path for imports
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.audio.master_limiter import (
    process_limiter,
    get_audio_info,
    _align_audio_arrays
)
from tests.test_utils import (
    create_test_audio,
    get_audio_properties,
    compare_audio_files
)


class TestMasterLimiter:
    """Test cases for the master limiter module."""
    
    def test_single_input_processing(self, temp_dir):
        """Test processing with a single input file."""
        
        input_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio
        audio = create_test_audio(duration=0.5, amplitude=0.3)
        sf.write(input_path, audio, 44100)
        
        # Process without limiter for predictable results
        result_path = process_limiter(
            input_paths=[input_path],
            output_path=output_path,
            gain_adjust_db=0.0,
            enable_limiter=False
        )
        
        assert result_path == output_path
        assert os.path.exists(output_path)
        
        # Verify output matches input (no processing applied)
        assert compare_audio_files(input_path, output_path, tolerance=1e-4)
    
    def test_dual_input_summing(self, temp_dir):
        """Test processing with two input files (stem mode)."""
        
        input1_path = os.path.join(temp_dir, "input1.wav")
        input2_path = os.path.join(temp_dir, "input2.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio with different frequencies
        audio1 = create_test_audio(amplitude=0.3, frequency=440)
        audio2 = create_test_audio(amplitude=0.2, frequency=880)
        sf.write(input1_path, audio1, 44100)
        sf.write(input2_path, audio2, 44100)
        
        # Process without limiter
        result_path = process_limiter(
            input_paths=[input1_path, input2_path],
            output_path=output_path,
            gain_adjust_db=0.0,
            enable_limiter=False
        )
        
        assert result_path == output_path
        assert os.path.exists(output_path)
        
        # Verify output is sum of inputs
        output_audio, _ = sf.read(output_path)
        expected_audio = audio1 + audio2
        
        assert np.allclose(output_audio, expected_audio, atol=1e-4)
    
    def test_gain_adjustment(self, temp_dir):
        """Test master gain adjustment functionality."""
        
        input_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio
        audio = create_test_audio(amplitude=0.5)
        sf.write(input_path, audio, 44100)
        
        # Test +6dB gain
        process_limiter(
            input_paths=[input_path],
            output_path=output_path,
            gain_adjust_db=6.0,
            enable_limiter=False
        )
        
        # Verify gain was applied
        output_audio, _ = sf.read(output_path)
        expected_gain = 10.0 ** (6.0 / 20.0)  # ~2.0
        expected_audio = audio * expected_gain
        
        assert np.allclose(output_audio, expected_audio, atol=1e-4)
    
    @patch('app.audio.master_limiter.limit')
    @patch('app.audio.master_limiter.mg.Config')
    def test_limiter_enabled(self, mock_config, mock_limit, temp_dir):
        """Test that the limiter is called when enabled."""
        
        input_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio
        audio = create_test_audio(amplitude=0.8)  # Higher amplitude to trigger limiting
        sf.write(input_path, audio, 44100)
        
        # Mock the limiter to return the same audio (for testing)
        mock_limit.return_value = audio
        mock_config.return_value = MagicMock()
        
        # Process with limiter enabled
        process_limiter(
            input_paths=[input_path],
            output_path=output_path,
            gain_adjust_db=0.0,
            enable_limiter=True
        )
        
        # Verify limiter was called
        mock_limit.assert_called_once()
        mock_config.assert_called_once()
    
    def test_limiter_disabled(self, temp_dir):
        """Test processing with limiter disabled."""
        
        input_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test audio that would normally be limited
        audio = create_test_audio(amplitude=1.2)  # Over 0dB
        sf.write(input_path, audio, 44100)
        
        # Process with limiter disabled
        process_limiter(
            input_paths=[input_path],
            output_path=output_path,
            gain_adjust_db=0.0,
            enable_limiter=False
        )
        
        # Verify output matches input (no limiting applied)
        assert compare_audio_files(input_path, output_path, tolerance=1e-4)
    
    def test_parameter_validation(self, temp_dir):
        """Test parameter validation."""
        
        input_path = os.path.join(temp_dir, "input.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create test file
        audio = create_test_audio()
        sf.write(input_path, audio, 44100)
        
        # Test empty input list
        with pytest.raises(ValueError, match="At least one input file path must be provided"):
            process_limiter(
                input_paths=[],
                output_path=output_path
            )
        
        # Test too many inputs
        with pytest.raises(ValueError, match="Maximum 2 input files supported"):
            process_limiter(
                input_paths=[input_path, input_path, input_path],
                output_path=output_path
            )
        
        # Test invalid gain value
        with pytest.raises(ValueError, match="Gain adjustment must be between -12.0dB and \\+12.0dB"):
            process_limiter(
                input_paths=[input_path],
                output_path=output_path,
                gain_adjust_db=15.0
            )
        
        with pytest.raises(ValueError, match="Gain adjustment must be between -12.0dB and \\+12.0dB"):
            process_limiter(
                input_paths=[input_path],
                output_path=output_path,
                gain_adjust_db=-15.0
            )
    
    def test_file_not_found_error(self, temp_dir):
        """Test file not found error handling."""
        
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Test non-existent input file
        with pytest.raises(FileNotFoundError, match="Input audio file not found"):
            process_limiter(
                input_paths=["/nonexistent/file.wav"],
                output_path=output_path
            )
    
    def test_sample_rate_mismatch(self, temp_dir):
        """Test handling of sample rate mismatches between inputs."""
        
        input1_path = os.path.join(temp_dir, "input1.wav")
        input2_path = os.path.join(temp_dir, "input2.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create files with different sample rates
        audio = create_test_audio()
        sf.write(input1_path, audio, 44100)
        sf.write(input2_path, audio, 48000)  # Different sample rate
        
        # Should raise runtime error
        with pytest.raises(RuntimeError, match="Sample rate mismatch"):
            process_limiter(
                input_paths=[input1_path, input2_path],
                output_path=output_path
            )
    
    def test_different_length_inputs(self, temp_dir):
        """Test processing inputs with different lengths."""
        
        input1_path = os.path.join(temp_dir, "input1.wav")
        input2_path = os.path.join(temp_dir, "input2.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create audio with different lengths
        audio1 = create_test_audio(duration=0.5, amplitude=0.3)
        audio2 = create_test_audio(duration=1.0, amplitude=0.2)
        sf.write(input1_path, audio1, 44100)
        sf.write(input2_path, audio2, 44100)
        
        # Process
        process_limiter(
            input_paths=[input1_path, input2_path],
            output_path=output_path,
            enable_limiter=False
        )
        
        # Verify output length matches longer input
        props = get_audio_properties(output_path)
        assert props['duration'] == pytest.approx(1.0, abs=0.01)
    
    def test_mono_to_stereo_conversion(self, temp_dir):
        """Test handling of mono inputs in dual input mode."""
        
        input1_path = os.path.join(temp_dir, "input1.wav")
        input2_path = os.path.join(temp_dir, "input2.wav")
        output_path = os.path.join(temp_dir, "output.wav")
        
        # Create one mono and one stereo file
        mono_audio = create_test_audio(channels=1, amplitude=0.3)
        stereo_audio = create_test_audio(channels=2, amplitude=0.2)
        sf.write(input1_path, mono_audio, 44100)
        sf.write(input2_path, stereo_audio, 44100)
        
        # Process
        process_limiter(
            input_paths=[input1_path, input2_path],
            output_path=output_path,
            enable_limiter=False
        )
        
        # Verify output is stereo
        props = get_audio_properties(output_path)
        assert props['channels'] == 2


class TestAudioInfo:
    """Test cases for audio info functionality."""
    
    def test_get_audio_info_valid_file(self, temp_dir):
        """Test getting audio info from a valid file."""
        
        file_path = os.path.join(temp_dir, "test.wav")
        audio = create_test_audio(duration=2.5, sample_rate=48000, channels=1)
        sf.write(file_path, audio, 48000)
        
        info = get_audio_info(file_path)
        
        assert info['sample_rate'] == 48000
        assert info['channels'] == 1
        assert info['duration'] == pytest.approx(2.5, abs=0.01)
        assert 'frames' in info
        assert 'format' in info
        assert 'file_size_bytes' in info
    
    def test_get_audio_info_nonexistent_file(self):
        """Test getting audio info from non-existent file."""
        
        with pytest.raises(FileNotFoundError, match="Audio file not found"):
            get_audio_info("/nonexistent/file.wav")
    
    def test_get_audio_info_invalid_file(self, temp_dir):
        """Test getting audio info from invalid file."""
        
        # Create a text file instead of audio
        invalid_path = os.path.join(temp_dir, "invalid.wav")
        with open(invalid_path, "w") as f:
            f.write("This is not an audio file")
        
        with pytest.raises(RuntimeError, match="Cannot read audio file info"):
            get_audio_info(invalid_path)


class TestLimiterAudioAlignment:
    """Test cases for audio array alignment in master limiter."""
    
    def test_align_different_channel_counts(self):
        """Test aligning mono and stereo audio."""
        
        mono_audio = np.random.random((1000, 1))
        stereo_audio = np.random.random((1000, 2))
        
        aligned1, aligned2 = _align_audio_arrays(mono_audio, stereo_audio)
        
        # Both should now be stereo
        assert aligned1.shape == aligned2.shape == (1000, 2)
        
        # Mono should be duplicated to both channels
        assert np.array_equal(aligned1[:, 0], aligned1[:, 1])
    
    def test_align_different_lengths_and_channels(self):
        """Test comprehensive alignment with different lengths and channels."""
        
        mono_short = np.random.random((500, 1))
        stereo_long = np.random.random((1000, 2))
        
        aligned1, aligned2 = _align_audio_arrays(mono_short, stereo_long)
        
        # Both should be (1000, 2)
        assert aligned1.shape == aligned2.shape == (1000, 2)
        
        # First 500 samples should match original (duplicated for stereo)
        assert np.array_equal(aligned1[:500, 0], mono_short[:, 0])
        assert np.array_equal(aligned1[:500, 1], mono_short[:, 0])
        
        # Last 500 samples should be zero-padded
        assert np.allclose(aligned1[500:], 0)
        
        # Second array should be unchanged
        assert np.array_equal(aligned2, stereo_long)