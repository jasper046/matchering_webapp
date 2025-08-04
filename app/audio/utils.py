"""
Audio Processing Utilities

Shared utility functions for audio processing modules.
"""

import os
import uuid
import tempfile
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)


def generate_temp_path(suffix: str = '.wav', prefix: str = 'audio_', directory: Optional[str] = None) -> str:
    """
    Generate a unique temporary file path for audio processing.
    
    Args:
        suffix: File extension (default: '.wav')
        prefix: Filename prefix (default: 'audio_')
        directory: Directory for temp file (default: system temp)
        
    Returns:
        str: Unique temporary file path
    """
    
    if directory is None:
        directory = tempfile.gettempdir()
    
    unique_id = str(uuid.uuid4())[:8]  # Short UUID for readability
    filename = f"{prefix}{unique_id}{suffix}"
    return os.path.join(directory, filename)


def ensure_directory(file_path: str) -> str:
    """
    Ensure the directory for a file path exists.
    
    Args:
        file_path: Full path to a file
        
    Returns:
        str: The input file path (unchanged)
    """
    
    directory = os.path.dirname(file_path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    
    return file_path


def cleanup_file(file_path: str, ignore_errors: bool = True) -> bool:
    """
    Clean up a temporary file safely.
    
    Args:
        file_path: Path to file to delete
        ignore_errors: If True, don't raise exceptions on errors
        
    Returns:
        bool: True if file was deleted successfully, False otherwise
    """
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.debug(f"Cleaned up file: {file_path}")
            return True
        return False
    except Exception as e:
        if ignore_errors:
            logger.warning(f"Failed to cleanup file {file_path}: {str(e)}")
            return False
        else:
            raise


def validate_db_range(value: float, min_db: float = -12.0, max_db: float = 12.0) -> float:
    """
    Validate a dB value is within acceptable range.
    
    Args:
        value: dB value to validate
        min_db: Minimum allowed dB value
        max_db: Maximum allowed dB value
        
    Returns:
        float: The validated value
        
    Raises:
        ValueError: If value is outside the valid range
    """
    
    if not (min_db <= value <= max_db):
        raise ValueError(f"dB value must be between {min_db} and {max_db}, got {value}")
    
    return value


def validate_blend_ratio(value: float) -> float:
    """
    Validate a blend ratio is within 0.0 to 1.0 range.
    
    Args:
        value: Blend ratio to validate
        
    Returns:
        float: The validated value
        
    Raises:
        ValueError: If value is outside the valid range
    """
    
    if not (0.0 <= value <= 1.0):
        raise ValueError(f"Blend ratio must be between 0.0 and 1.0, got {value}")
    
    return value


def db_to_linear(db_value: float) -> float:
    """
    Convert dB value to linear gain.
    
    Args:
        db_value: Value in dB
        
    Returns:
        float: Linear gain value
    """
    
    return 10.0 ** (db_value / 20.0)


def linear_to_db(linear_value: float) -> float:
    """
    Convert linear gain to dB value.
    
    Args:
        linear_value: Linear gain value
        
    Returns:
        float: Value in dB
    """
    
    if linear_value <= 0:
        return float('-inf')  # Negative infinity for zero/negative values
    
    import math
    return 20.0 * math.log10(linear_value)


def get_safe_filename(base_name: str, extension: str = '.wav') -> str:
    """
    Create a safe filename by removing/replacing unsafe characters.
    
    Args:
        base_name: Base filename without extension
        extension: File extension to append
        
    Returns:
        str: Safe filename
    """
    
    import re
    
    # Remove or replace unsafe characters
    safe_name = re.sub(r'[<>:"/\\|?*]', '_', base_name)
    
    # Remove multiple consecutive underscores
    safe_name = re.sub(r'_+', '_', safe_name)
    
    # Trim whitespace and underscores from ends
    safe_name = safe_name.strip(' _')
    
    # Ensure we have a name
    if not safe_name:
        safe_name = 'audio'
    
    # Limit length
    if len(safe_name) > 50:
        safe_name = safe_name[:50]
    
    return safe_name + extension


def generate_waveform_image(audio_path: str, output_path: str, width: int = 800, height: int = 120) -> None:
    """
    Generates a waveform image (PNG) from an audio file.

    Args:
        audio_path: Path to the audio file.
        output_path: Path to save the generated PNG image.
        width: Width of the output image in pixels.
        height: Height of the output image in pixels.
    """
    import soundfile as sf
    import numpy as np
    import matplotlib.pyplot as plt
    import io

    try:
        data, samplerate = sf.read(audio_path, dtype='float32')

        if data.ndim > 1:
            data = np.mean(data, axis=1)  # Convert to mono

        # Create a figure and axes with specified size in inches
        # 1 inch = 100 pixels (approx for default dpi)
        fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)

        ax.plot(data, color='#007bff', linewidth=0.5)
        ax.set_facecolor('#212529')  # Dark background
        fig.patch.set_facecolor('#212529') # Dark background for the figure itself

        ax.axis('off')  # Turn off axes
        
        # Improved Y scaling with 25% margin
        data_max = np.max(np.abs(data))
        y_limit = data_max * 1.25 if data_max > 0 else 1.0
        ax.set_ylim([-y_limit, y_limit])  # Dynamic y-axis range with margin
        ax.set_xlim([0, len(data)]) # Set x-axis limits to data length

        plt.subplots_adjust(left=0, right=1, top=1, bottom=0) # Remove padding

        # Save to a BytesIO object
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', pad_inches=0)
        buffer.seek(0)

        with open(output_path, 'wb') as f:
            f.write(buffer.getvalue())

        plt.close(fig) # Close the figure to free memory

    except Exception as e:
        logger.error(f"Error generating waveform image for {audio_path}: {e}")
        # Create a flatline image in case of error
        fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
        ax.plot([0, width], [0, 0], color='#007bff', linewidth=0.5) # Flat line
        ax.set_facecolor('#212529')
        fig.patch.set_facecolor('#212529')
        ax.axis('off')
        ax.set_ylim([-1, 1])
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', pad_inches=0)
        buffer.seek(0)
        with open(output_path, 'wb') as f:
            f.write(buffer.getvalue())
        plt.close(fig)

def generate_flatline_image(output_path: str, width: int = 800, height: int = 120) -> None:
    """
    Generates a flatline waveform image (PNG).

    Args:
        output_path: Path to save the generated PNG image.
        width: Width of the output image in pixels.
        height: Height of the output image in pixels.
    """
    import matplotlib.pyplot as plt
    import io
    try:
        fig, ax = plt.subplots(figsize=(width / 100, height / 100), dpi=100)
        ax.plot([0, width], [0, 0], color='#007bff', linewidth=0.5) # Flat line
        ax.set_facecolor('#212529')
        fig.patch.set_facecolor('#212529')
        ax.axis('off')
        ax.set_ylim([-1, 1])
        plt.subplots_adjust(left=0, right=1, top=1, bottom=0)
        buffer = io.BytesIO()
        plt.savefig(buffer, format='png', bbox_inches='tight', pad_inches=0)
        buffer.seek(0)
        with open(output_path, 'wb') as f:
            f.write(buffer.getvalue())
        plt.close(fig)
    except Exception as e:
        logger.error(f"Error generating flatline image: {e}")