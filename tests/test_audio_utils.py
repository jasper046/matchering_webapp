"""
Unit tests for the audio utilities module.
"""

import os
import tempfile
import pytest

# Add the app directory to the path for imports
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.audio.utils import (
    generate_temp_path,
    ensure_directory,
    cleanup_file,
    validate_db_range,
    validate_blend_ratio,
    db_to_linear,
    linear_to_db,
    get_safe_filename
)


class TestTempPathGeneration:
    """Test cases for temporary path generation."""
    
    def test_generate_temp_path_defaults(self):
        """Test generating temp path with default parameters."""
        
        path = generate_temp_path()
        
        assert path.endswith('.wav')
        assert 'audio_' in os.path.basename(path)
        assert len(os.path.basename(path)) > 10  # Should have UUID
    
    def test_generate_temp_path_custom_params(self):
        """Test generating temp path with custom parameters."""
        
        custom_dir = "/tmp/test"
        path = generate_temp_path(
            suffix='.mp3',
            prefix='custom_',
            directory=custom_dir
        )
        
        assert path.startswith(custom_dir)
        assert path.endswith('.mp3')
        assert 'custom_' in os.path.basename(path)
    
    def test_generate_unique_paths(self):
        """Test that generated paths are unique."""
        
        paths = [generate_temp_path() for _ in range(10)]
        
        # All paths should be unique
        assert len(set(paths)) == 10


class TestDirectoryEnsuring:
    """Test cases for directory creation."""
    
    def test_ensure_existing_directory(self, temp_dir):
        """Test ensuring a directory that already exists."""
        
        file_path = os.path.join(temp_dir, "test.wav")
        result = ensure_directory(file_path)
        
        assert result == file_path
        assert os.path.exists(temp_dir)
    
    def test_ensure_new_directory(self, temp_dir):
        """Test creating a new directory."""
        
        new_dir = os.path.join(temp_dir, "new", "nested", "dir")
        file_path = os.path.join(new_dir, "test.wav")
        
        result = ensure_directory(file_path)
        
        assert result == file_path
        assert os.path.exists(new_dir)
    
    def test_ensure_directory_no_directory(self):
        """Test with a file path that has no directory component."""
        
        file_path = "test.wav"  # No directory
        result = ensure_directory(file_path)
        
        assert result == file_path


class TestFileCleanup:
    """Test cases for file cleanup."""
    
    def test_cleanup_existing_file(self, temp_dir):
        """Test cleaning up an existing file."""
        
        file_path = os.path.join(temp_dir, "test.txt")
        
        # Create file
        with open(file_path, "w") as f:
            f.write("test content")
        
        assert os.path.exists(file_path)
        
        # Clean up
        result = cleanup_file(file_path)
        
        assert result is True
        assert not os.path.exists(file_path)
    
    def test_cleanup_nonexistent_file(self):
        """Test cleaning up a non-existent file."""
        
        result = cleanup_file("/nonexistent/file.txt")
        
        assert result is False
    
    def test_cleanup_with_permission_error(self, temp_dir):
        """Test cleanup when permission error occurs."""
        
        file_path = os.path.join(temp_dir, "test.txt")
        
        # Create file
        with open(file_path, "w") as f:
            f.write("test content")
        
        # Test with ignore_errors=True (should not raise)
        result = cleanup_file(file_path, ignore_errors=True)
        assert result is True  # File should be cleaned up normally


class TestParameterValidation:
    """Test cases for parameter validation functions."""
    
    def test_validate_db_range_valid_values(self):
        """Test dB range validation with valid values."""
        
        assert validate_db_range(0.0) == 0.0
        assert validate_db_range(-12.0) == -12.0
        assert validate_db_range(12.0) == 12.0
        assert validate_db_range(6.0) == 6.0
    
    def test_validate_db_range_invalid_values(self):
        """Test dB range validation with invalid values."""
        
        with pytest.raises(ValueError, match="dB value must be between"):
            validate_db_range(15.0)
        
        with pytest.raises(ValueError, match="dB value must be between"):
            validate_db_range(-15.0)
    
    def test_validate_db_range_custom_range(self):
        """Test dB range validation with custom range."""
        
        assert validate_db_range(20.0, min_db=-24.0, max_db=24.0) == 20.0
        
        with pytest.raises(ValueError):
            validate_db_range(30.0, min_db=-24.0, max_db=24.0)
    
    def test_validate_blend_ratio_valid_values(self):
        """Test blend ratio validation with valid values."""
        
        assert validate_blend_ratio(0.0) == 0.0
        assert validate_blend_ratio(1.0) == 1.0
        assert validate_blend_ratio(0.5) == 0.5
        assert validate_blend_ratio(0.75) == 0.75
    
    def test_validate_blend_ratio_invalid_values(self):
        """Test blend ratio validation with invalid values."""
        
        with pytest.raises(ValueError, match="Blend ratio must be between 0.0 and 1.0"):
            validate_blend_ratio(1.5)
        
        with pytest.raises(ValueError, match="Blend ratio must be between 0.0 and 1.0"):
            validate_blend_ratio(-0.1)


class TestAudioConversions:
    """Test cases for audio conversion functions."""
    
    def test_db_to_linear_conversion(self):
        """Test dB to linear gain conversion."""
        
        # Test common values
        assert db_to_linear(0.0) == pytest.approx(1.0, abs=1e-6)
        assert db_to_linear(6.0) == pytest.approx(1.995, abs=0.01)  # ~2x
        assert db_to_linear(-6.0) == pytest.approx(0.501, abs=0.01)  # ~0.5x
        assert db_to_linear(20.0) == pytest.approx(10.0, abs=0.01)
        assert db_to_linear(-20.0) == pytest.approx(0.1, abs=0.01)
    
    def test_linear_to_db_conversion(self):
        """Test linear gain to dB conversion."""
        
        # Test common values
        assert linear_to_db(1.0) == pytest.approx(0.0, abs=1e-6)
        assert linear_to_db(2.0) == pytest.approx(6.02, abs=0.1)
        assert linear_to_db(0.5) == pytest.approx(-6.02, abs=0.1)
        assert linear_to_db(10.0) == pytest.approx(20.0, abs=0.1)
        assert linear_to_db(0.1) == pytest.approx(-20.0, abs=0.1)
    
    def test_linear_to_db_edge_cases(self):
        """Test edge cases for linear to dB conversion."""
        
        # Zero and negative values should return negative infinity
        assert linear_to_db(0.0) == float('-inf')
        assert linear_to_db(-1.0) == float('-inf')
    
    def test_db_linear_roundtrip(self):
        """Test that dB <-> linear conversions are consistent."""
        
        test_db_values = [0.0, 6.0, -6.0, 12.0, -12.0]
        
        for db_val in test_db_values:
            linear_val = db_to_linear(db_val)
            roundtrip_db = linear_to_db(linear_val)
            assert roundtrip_db == pytest.approx(db_val, abs=1e-6)


class TestSafeFilename:
    """Test cases for safe filename generation."""
    
    def test_safe_filename_basic(self):
        """Test basic safe filename generation."""
        
        result = get_safe_filename("test_audio")
        assert result == "test_audio.wav"
    
    def test_safe_filename_with_unsafe_chars(self):
        """Test safe filename with unsafe characters."""
        
        unsafe_name = "test<>:\"/\\|?*audio"
        result = get_safe_filename(unsafe_name)
        
        # Unsafe characters should be replaced with underscores
        assert "<" not in result
        assert ">" not in result
        assert ":" not in result
        assert '"' not in result
        assert "/" not in result
        assert "\\" not in result
        assert "|" not in result
        assert "?" not in result
        assert "*" not in result
        assert result.endswith(".wav")
    
    def test_safe_filename_multiple_underscores(self):
        """Test that multiple consecutive underscores are collapsed."""
        
        name_with_multiple_underscores = "test___audio___file"
        result = get_safe_filename(name_with_multiple_underscores)
        
        # Should not have consecutive underscores
        assert "___" not in result
        assert "__" not in result
    
    def test_safe_filename_empty_name(self):
        """Test safe filename with empty or whitespace-only name."""
        
        result = get_safe_filename("")
        assert result == "audio.wav"
        
        result = get_safe_filename("   ")
        assert result == "audio.wav"
    
    def test_safe_filename_long_name(self):
        """Test safe filename with very long name."""
        
        long_name = "a" * 100  # 100 characters
        result = get_safe_filename(long_name)
        
        # Should be truncated to reasonable length
        assert len(result) <= 54  # 50 chars + ".wav"
        assert result.endswith(".wav")
    
    def test_safe_filename_custom_extension(self):
        """Test safe filename with custom extension."""
        
        result = get_safe_filename("test_audio", ".mp3")
        assert result == "test_audio.mp3"