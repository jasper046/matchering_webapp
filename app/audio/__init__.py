"""
Audio processing modules for the Matchering webapp.

This package contains modular audio processing components:
- channel_processor: Handles channel blending, volume adjustment, and muting
- master_limiter: Handles final limiting and master output processing
- utils: Shared audio processing utilities
"""

from .channel_processor import process_channel
from .master_limiter import process_limiter

__all__ = ['process_channel', 'process_limiter']