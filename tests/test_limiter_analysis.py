#!/usr/bin/env python3
"""
Master Limiter Analysis Test Script

This script generates pink noise at various levels (-25dBFS to -5dBFS in 5dB steps)
and analyzes the power difference between input and output when processed through
the master limiter.

Usage:
    python test_limiter_analysis.py
"""

import os
import sys
import numpy as np
import soundfile as sf
import matplotlib.pyplot as plt
from scipy import signal
import tempfile
import shutil
from pathlib import Path

# Add the app directory to the path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from app.audio.master_limiter import process_limiter, get_audio_info


def generate_pink_noise(duration=5.0, sample_rate=44100, target_dbfs=-20.0):
    """
    Generate pink noise with specified RMS level in dBFS.
    
    Args:
        duration: Duration in seconds
        sample_rate: Sample rate in Hz
        target_dbfs: Target RMS level in dBFS
    
    Returns:
        numpy array: Pink noise signal
    """
    # Generate white noise
    samples = int(duration * sample_rate)
    white_noise = np.random.randn(samples)
    
    # Create pink noise filter (1/f characteristic)
    # Pink noise has -3dB/octave rolloff
    freqs = np.fft.fftfreq(samples, 1/sample_rate)
    
    # Avoid division by zero at DC
    freqs[0] = 1e-10
    
    # Pink noise filter: 1/sqrt(f)
    pink_filter = 1.0 / np.sqrt(np.abs(freqs))
    pink_filter[0] = pink_filter[1]  # Fix DC component
    
    # Apply filter in frequency domain
    white_fft = np.fft.fft(white_noise)
    pink_fft = white_fft * pink_filter
    pink_noise = np.real(np.fft.ifft(pink_fft))
    
    # Normalize to target dBFS RMS level
    current_rms = np.sqrt(np.mean(pink_noise**2))
    target_rms = 10**(target_dbfs/20.0)  # Convert dBFS to linear
    pink_noise = pink_noise * (target_rms / current_rms)
    
    # Convert to stereo
    pink_stereo = np.column_stack([pink_noise, pink_noise])
    
    return pink_stereo


def measure_audio_power(audio_data):
    """
    Measure RMS power and peak level of audio data.
    
    Args:
        audio_data: numpy array (samples x channels)
    
    Returns:
        dict: Power measurements
    """
    if audio_data.ndim == 1:
        audio_data = audio_data.reshape(-1, 1)
    
    # RMS calculation (energy-based)
    rms_linear = np.sqrt(np.mean(audio_data**2))
    rms_dbfs = 20 * np.log10(rms_linear) if rms_linear > 0 else -np.inf
    
    # Peak level
    peak_linear = np.max(np.abs(audio_data))
    peak_dbfs = 20 * np.log10(peak_linear) if peak_linear > 0 else -np.inf
    
    # True peak (using oversampling estimation)
    # Simple approximation: interpolate and find peak
    upsampled = signal.resample(audio_data.flatten(), len(audio_data) * 4)
    true_peak_linear = np.max(np.abs(upsampled))
    true_peak_dbfs = 20 * np.log10(true_peak_linear) if true_peak_linear > 0 else -np.inf
    
    return {
        'rms_linear': rms_linear,
        'rms_dbfs': rms_dbfs,
        'peak_linear': peak_linear,
        'peak_dbfs': peak_dbfs,
        'true_peak_linear': true_peak_linear,
        'true_peak_dbfs': true_peak_dbfs
    }


def analyze_frequency_response(input_audio, output_audio, sample_rate=44100):
    """
    Analyze frequency response difference between input and output.
    
    Args:
        input_audio: Input audio data
        output_audio: Output audio data
        sample_rate: Sample rate
    
    Returns:
        dict: Frequency analysis results
    """
    # Use first channel for analysis
    input_mono = input_audio[:, 0] if input_audio.ndim > 1 else input_audio
    output_mono = output_audio[:, 0] if output_audio.ndim > 1 else output_audio
    
    # Ensure same length
    min_len = min(len(input_mono), len(output_mono))
    input_mono = input_mono[:min_len]
    output_mono = output_mono[:min_len]
    
    # Calculate PSDs using Welch's method
    freqs, input_psd = signal.welch(input_mono, sample_rate, nperseg=1024)
    _, output_psd = signal.welch(output_mono, sample_rate, nperseg=1024)
    
    # Calculate magnitude response (dB)
    # Avoid division by zero
    input_psd[input_psd == 0] = 1e-20
    output_psd[output_psd == 0] = 1e-20
    
    magnitude_response = 10 * np.log10(output_psd / input_psd)
    
    return {
        'frequencies': freqs,
        'magnitude_response_db': magnitude_response,
        'input_psd': input_psd,
        'output_psd': output_psd
    }


def test_limiter_with_pink_noise():
    """
    Main test function that analyzes limiter behavior with pink noise.
    """
    print("🎵 Master Limiter Analysis Test")
    print("=" * 50)
    
    # Test parameters
    test_levels_dbfs = list(range(-25, 0, 5))  # -25dBFS to -5dBFS in 5dB steps
    duration = 5.0  # seconds
    sample_rate = 44100
    
    # Results storage
    results = {
        'test_levels': test_levels_dbfs,
        'input_measurements': [],
        'output_measurements_limited': [],
        'output_measurements_bypass': [],
        'frequency_analysis': [],
        'gain_differences': []
    }
    
    # Create temporary directory for test files
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"Using temporary directory: {temp_dir}")
        
        for i, target_dbfs in enumerate(test_levels_dbfs):
            print(f"\n📊 Testing level {i+1}/{len(test_levels_dbfs)}: {target_dbfs} dBFS")
            
            # Generate pink noise at target level
            pink_noise = generate_pink_noise(duration, sample_rate, target_dbfs)
            
            # Save input file
            input_path = os.path.join(temp_dir, f"pink_noise_{target_dbfs}dBFS.wav")
            sf.write(input_path, pink_noise, sample_rate)
            
            # Measure input
            input_measurements = measure_audio_power(pink_noise)
            print(f"   Input:  RMS={input_measurements['rms_dbfs']:.2f} dBFS, "
                  f"Peak={input_measurements['peak_dbfs']:.2f} dBFS")
            
            # Process with limiter enabled
            output_path_limited = os.path.join(temp_dir, f"output_limited_{target_dbfs}dBFS.wav")
            try:
                process_limiter(
                    input_paths=[input_path],
                    output_path=output_path_limited,
                    gain_adjust_db=0.0,
                    enable_limiter=True
                )
                
                # Read and measure limited output
                output_limited, _ = sf.read(output_path_limited)
                output_measurements_limited = measure_audio_power(output_limited)
                print(f"   Limited: RMS={output_measurements_limited['rms_dbfs']:.2f} dBFS, "
                      f"Peak={output_measurements_limited['peak_dbfs']:.2f} dBFS")
                
            except Exception as e:
                print(f"   Error processing with limiter: {e}")
                output_measurements_limited = None
                output_limited = None
            
            # Process with limiter bypassed
            output_path_bypass = os.path.join(temp_dir, f"output_bypass_{target_dbfs}dBFS.wav")
            try:
                process_limiter(
                    input_paths=[input_path],
                    output_path=output_path_bypass,
                    gain_adjust_db=0.0,
                    enable_limiter=False
                )
                
                # Read and measure bypassed output
                output_bypass, _ = sf.read(output_path_bypass)
                output_measurements_bypass = measure_audio_power(output_bypass)
                print(f"   Bypass:  RMS={output_measurements_bypass['rms_dbfs']:.2f} dBFS, "
                      f"Peak={output_measurements_bypass['peak_dbfs']:.2f} dBFS")
                
            except Exception as e:
                print(f"   Error processing with bypass: {e}")
                output_measurements_bypass = None
                output_bypass = None
            
            # Calculate gain differences
            gain_diff_limited = None
            gain_diff_bypass = None
            freq_analysis = None
            
            if output_measurements_limited:
                gain_diff_limited = (output_measurements_limited['rms_dbfs'] - 
                                   input_measurements['rms_dbfs'])
                print(f"   Gain (Limited): {gain_diff_limited:+.3f} dB")
                
                # Frequency analysis for limited case
                if output_limited is not None:
                    freq_analysis = analyze_frequency_response(pink_noise, output_limited, sample_rate)
            
            if output_measurements_bypass:
                gain_diff_bypass = (output_measurements_bypass['rms_dbfs'] - 
                                  input_measurements['rms_dbfs'])
                print(f"   Gain (Bypass):  {gain_diff_bypass:+.3f} dB")
            
            # Store results
            results['input_measurements'].append(input_measurements)
            results['output_measurements_limited'].append(output_measurements_limited)
            results['output_measurements_bypass'].append(output_measurements_bypass)
            results['frequency_analysis'].append(freq_analysis)
            results['gain_differences'].append({
                'limited': gain_diff_limited,
                'bypass': gain_diff_bypass
            })
    
    return results


def plot_results(results):
    """
    Create plots showing the limiter analysis results.
    """
    print("\n📈 Generating analysis plots...")
    
    test_levels = results['test_levels']
    
    # Extract gain differences
    gain_limited = [r['limited'] if r['limited'] is not None else np.nan 
                   for r in results['gain_differences']]
    gain_bypass = [r['bypass'] if r['bypass'] is not None else np.nan 
                  for r in results['gain_differences']]
    
    # Create figure with subplots
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(15, 12))
    fig.suptitle('Master Limiter Analysis - Pink Noise Test', fontsize=16, fontweight='bold')
    
    # Plot 1: Gain differences
    ax1.plot(test_levels, gain_limited, 'ro-', label='Limiter Enabled', linewidth=2, markersize=8)
    ax1.plot(test_levels, gain_bypass, 'bo-', label='Limiter Bypassed', linewidth=2, markersize=8)
    ax1.axhline(y=0, color='gray', linestyle='--', alpha=0.7)
    ax1.set_xlabel('Input Level (dBFS)')
    ax1.set_ylabel('Gain Difference (dB)')
    ax1.set_title('RMS Gain: Output vs Input')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Plot 2: Input vs Output levels
    input_rms = [m['rms_dbfs'] for m in results['input_measurements']]
    output_rms_limited = [m['rms_dbfs'] if m else np.nan 
                         for m in results['output_measurements_limited']]
    output_rms_bypass = [m['rms_dbfs'] if m else np.nan 
                        for m in results['output_measurements_bypass']]
    
    ax2.plot(test_levels, input_rms, 'g^-', label='Input', linewidth=2, markersize=8)
    ax2.plot(test_levels, output_rms_limited, 'ro-', label='Output (Limited)', linewidth=2, markersize=8)
    ax2.plot(test_levels, output_rms_bypass, 'bo-', label='Output (Bypass)', linewidth=2, markersize=8)
    ax2.plot(test_levels, test_levels, 'k--', alpha=0.5, label='Unity (reference)')
    ax2.set_xlabel('Input Level (dBFS)')
    ax2.set_ylabel('Measured RMS Level (dBFS)')
    ax2.set_title('Input vs Output RMS Levels')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # Plot 3: Peak levels
    input_peaks = [m['peak_dbfs'] for m in results['input_measurements']]
    output_peaks_limited = [m['peak_dbfs'] if m else np.nan 
                           for m in results['output_measurements_limited']]
    output_peaks_bypass = [m['peak_dbfs'] if m else np.nan 
                          for m in results['output_measurements_bypass']]
    
    ax3.plot(test_levels, input_peaks, 'g^-', label='Input', linewidth=2, markersize=8)
    ax3.plot(test_levels, output_peaks_limited, 'ro-', label='Output (Limited)', linewidth=2, markersize=8)
    ax3.plot(test_levels, output_peaks_bypass, 'bo-', label='Output (Bypass)', linewidth=2, markersize=8)
    ax3.axhline(y=0, color='red', linestyle=':', alpha=0.7, label='0 dBFS')
    ax3.set_xlabel('Input Level (dBFS)')
    ax3.set_ylabel('Peak Level (dBFS)')
    ax3.set_title('Peak Level Comparison')
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    # Plot 4: Frequency response (example from one test level)
    # Use the highest level test that has frequency analysis
    freq_data = None
    freq_test_level = None
    for i, fa in enumerate(results['frequency_analysis']):
        if fa is not None:
            freq_data = fa
            freq_test_level = test_levels[i]
    
    if freq_data:
        freqs = freq_data['frequencies']
        mag_response = freq_data['magnitude_response_db']
        
        # Plot only up to Nyquist/2 for clarity
        max_freq_idx = len(freqs) // 2
        ax4.semilogx(freqs[:max_freq_idx], mag_response[:max_freq_idx], 'b-', linewidth=2)
        ax4.axhline(y=0, color='gray', linestyle='--', alpha=0.7)
        ax4.set_xlabel('Frequency (Hz)')
        ax4.set_ylabel('Magnitude Response (dB)')
        ax4.set_title(f'Frequency Response (@ {freq_test_level} dBFS)')
        ax4.grid(True, alpha=0.3)
        ax4.set_xlim([20, 20000])
    else:
        ax4.text(0.5, 0.5, 'No frequency data available', 
                ha='center', va='center', transform=ax4.transAxes, fontsize=12)
        ax4.set_title('Frequency Response')
    
    plt.tight_layout()
    
    # Save plot
    plot_path = 'limiter_analysis_results.png'
    plt.savefig(plot_path, dpi=300, bbox_inches='tight')
    print(f"Plot saved to: {plot_path}")
    
    plt.show()


def print_summary(results):
    """
    Print a summary of the analysis results.
    """
    print("\n" + "="*60)
    print("📋 MASTER LIMITER ANALYSIS SUMMARY")
    print("="*60)
    
    test_levels = results['test_levels']
    gain_diffs = results['gain_differences']
    
    print("\n🔍 Gain Analysis:")
    print(f"{'Input Level':<12} {'Limited Gain':<13} {'Bypass Gain':<12} {'Difference':<12}")
    print("-" * 50)
    
    for i, level in enumerate(test_levels):
        limited_gain = gain_diffs[i]['limited']
        bypass_gain = gain_diffs[i]['bypass']
        
        limited_str = f"{limited_gain:+.3f} dB" if limited_gain is not None else "N/A"
        bypass_str = f"{bypass_gain:+.3f} dB" if bypass_gain is not None else "N/A"
        
        if limited_gain is not None and bypass_gain is not None:
            diff = limited_gain - bypass_gain
            diff_str = f"{diff:+.3f} dB"
        else:
            diff_str = "N/A"
        
        print(f"{level:+3d} dBFS    {limited_str:<13} {bypass_str:<12} {diff_str:<12}")
    
    # Calculate statistics
    valid_limited_gains = [g['limited'] for g in gain_diffs if g['limited'] is not None]
    valid_bypass_gains = [g['bypass'] for g in gain_diffs if g['bypass'] is not None]
    
    if valid_limited_gains:
        avg_limited_gain = np.mean(valid_limited_gains)
        max_limited_gain = np.max(valid_limited_gains)
        min_limited_gain = np.min(valid_limited_gains)
        
        print(f"\n📊 Limiter Statistics:")
        print(f"   Average gain: {avg_limited_gain:+.3f} dB")
        print(f"   Maximum gain: {max_limited_gain:+.3f} dB")
        print(f"   Minimum gain: {min_limited_gain:+.3f} dB")
        print(f"   Gain variation: {max_limited_gain - min_limited_gain:.3f} dB")
        
        if abs(avg_limited_gain) > 0.1:
            print(f"\n⚠️  Warning: Average gain is {avg_limited_gain:+.3f} dB (expected ~0 dB)")
        else:
            print(f"\n✅ Average gain is within tolerance: {avg_limited_gain:+.3f} dB")
    
    if valid_bypass_gains:
        avg_bypass_gain = np.mean(valid_bypass_gains)
        print(f"\n🔄 Bypass mode average gain: {avg_bypass_gain:+.3f} dB")
        
        if abs(avg_bypass_gain) > 0.01:
            print(f"⚠️  Warning: Bypass mode should have 0 dB gain, measured {avg_bypass_gain:+.3f} dB")
        else:
            print("✅ Bypass mode gain is correct")


def main():
    """
    Main function to run the limiter analysis test.
    """
    try:
        print("Starting Master Limiter Analysis Test...")
        
        # Run the test
        results = test_limiter_with_pink_noise()
        
        # Print summary
        print_summary(results)
        
        # Generate plots
        plot_results(results)
        
        print("\n✅ Analysis complete! Check the generated plot for detailed results.")
        
    except Exception as e:
        print(f"\n❌ Error running analysis: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())