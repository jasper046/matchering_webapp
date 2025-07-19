#!/usr/bin/env python3
"""
Simple Passthrough Test

Test to isolate if the gain issue is in our modular processing 
or in the underlying file I/O operations.
"""

import os
import sys
import numpy as np
import soundfile as sf
import tempfile

# Add the app directory to the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.audio.master_limiter import process_limiter
from app.audio.channel_processor import process_channel


def test_simple_passthrough():
    """Test simple file passthrough to identify where gain changes occur."""
    
    print("🔧 Simple Passthrough Test")
    print("=" * 40)
    
    # Create a simple test signal at -20 dBFS
    duration = 1.0
    sample_rate = 44100
    samples = int(duration * sample_rate)
    
    # Generate a sine wave at -20 dBFS RMS
    t = np.linspace(0, duration, samples, False)
    sine_wave = np.sin(2 * np.pi * 440 * t)  # 440 Hz
    
    # Scale to -20 dBFS RMS
    target_rms_dbfs = -20.0
    target_rms_linear = 10**(target_rms_dbfs/20.0)
    current_rms = np.sqrt(np.mean(sine_wave**2))
    sine_wave = sine_wave * (target_rms_linear / current_rms)
    
    # Convert to stereo
    stereo_sine = np.column_stack([sine_wave, sine_wave])
    
    def measure_rms(audio):
        return 20 * np.log10(np.sqrt(np.mean(audio**2)))
    
    original_rms = measure_rms(stereo_sine)
    print(f"Original signal RMS: {original_rms:.3f} dBFS")
    
    with tempfile.TemporaryDirectory() as temp_dir:
        # Test 1: Direct file I/O
        input_path = os.path.join(temp_dir, "input.wav")
        sf.write(input_path, stereo_sine, sample_rate)
        
        # Read back immediately
        loaded_audio, _ = sf.read(input_path)
        loaded_rms = measure_rms(loaded_audio)
        print(f"After file I/O:       {loaded_rms:.3f} dBFS (diff: {loaded_rms - original_rms:+.3f} dB)")
        
        # Test 2: Master limiter bypass
        bypass_path = os.path.join(temp_dir, "bypass.wav")
        process_limiter(
            input_paths=[input_path],
            output_path=bypass_path,
            gain_adjust_db=0.0,
            enable_limiter=False
        )
        
        bypass_audio, _ = sf.read(bypass_path)
        bypass_rms = measure_rms(bypass_audio)
        print(f"After limiter bypass: {bypass_rms:.3f} dBFS (diff: {bypass_rms - original_rms:+.3f} dB)")
        
        # Test 3: Master limiter enabled
        limited_path = os.path.join(temp_dir, "limited.wav")
        process_limiter(
            input_paths=[input_path],
            output_path=limited_path,
            gain_adjust_db=0.0,
            enable_limiter=True
        )
        
        limited_audio, _ = sf.read(limited_path)
        limited_rms = measure_rms(limited_audio)
        print(f"After limiter enable: {limited_rms:.3f} dBFS (diff: {limited_rms - original_rms:+.3f} dB)")
        
        # Test 4: Channel processor (100% blend)
        channel_path = os.path.join(temp_dir, "channel.wav")
        process_channel(
            original_path=input_path,
            processed_path=input_path,  # Same file for 100% passthrough
            output_path=channel_path,
            blend_ratio=1.0,  # 100% of "processed" (which is same as original)
            volume_adjust_db=0.0,
            mute=False
        )
        
        channel_audio, _ = sf.read(channel_path)
        channel_rms = measure_rms(channel_audio)
        print(f"After channel proc:   {channel_rms:.3f} dBFS (diff: {channel_rms - original_rms:+.3f} dB)")
        
        # Test 5: 50% blend (should be identical to 100% when both files are the same)
        blend50_path = os.path.join(temp_dir, "blend50.wav")
        process_channel(
            original_path=input_path,
            processed_path=input_path,
            output_path=blend50_path,
            blend_ratio=0.5,  # 50% blend of identical files
            volume_adjust_db=0.0,
            mute=False
        )
        
        blend50_audio, _ = sf.read(blend50_path)
        blend50_rms = measure_rms(blend50_audio)
        print(f"After 50% blend:      {blend50_rms:.3f} dBFS (diff: {blend50_rms - original_rms:+.3f} dB)")
        
    print("\n📝 Analysis:")
    if abs(loaded_rms - original_rms) > 0.001:
        print("⚠️  File I/O introduces gain changes")
    else:
        print("✅ File I/O is transparent")
        
    if abs(bypass_rms - loaded_rms) > 0.001:
        print("⚠️  Limiter bypass introduces gain changes")
    else:
        print("✅ Limiter bypass is transparent")
        
    if abs(channel_rms - loaded_rms) > 0.001:
        print("⚠️  Channel processor introduces gain changes")
    else:
        print("✅ Channel processor is transparent")


if __name__ == "__main__":
    test_simple_passthrough()