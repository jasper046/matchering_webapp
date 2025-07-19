"""
Audio Quality Analysis Module

This module provides comprehensive audio quality metrics for comparing
frame-based processing against monolithic processing approaches.
"""

import numpy as np
import soundfile as sf
import scipy.signal as signal
import scipy.fft as fft
from typing import Dict, List, Tuple, Optional
import warnings
warnings.filterwarnings('ignore')


class AudioQualityAnalyzer:
    """Comprehensive audio quality analysis tools."""
    
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.frequency_bands = {
            'sub_bass': (20, 60),
            'bass': (60, 250),
            'low_mids': (250, 500),
            'mids': (500, 2000),
            'high_mids': (2000, 4000),
            'presence': (4000, 6000),
            'brilliance': (6000, 20000)
        }
    
    def compare_audio_files(self, reference_path: str, test_path: str) -> Dict[str, float]:
        """
        Compare two audio files and return comprehensive quality metrics.
        
        Args:
            reference_path: Path to reference (monolithic) audio
            test_path: Path to test (frame-based) audio
            
        Returns:
            Dictionary of quality metrics
        """
        # Load audio files
        ref_audio, ref_sr = sf.read(reference_path)
        test_audio, test_sr = sf.read(test_path)
        
        # Ensure same sample rate
        if ref_sr != test_sr:
            raise ValueError(f"Sample rate mismatch: {ref_sr} vs {test_sr}")
        
        self.sample_rate = ref_sr
        
        # Ensure same length
        min_length = min(len(ref_audio), len(test_audio))
        ref_audio = ref_audio[:min_length]
        test_audio = test_audio[:min_length]
        
        # Convert to mono for analysis if stereo
        if ref_audio.ndim > 1:
            ref_mono = np.mean(ref_audio, axis=1)
        else:
            ref_mono = ref_audio
            
        if test_audio.ndim > 1:
            test_mono = np.mean(test_audio, axis=1)
        else:
            test_mono = test_audio
        
        # Calculate all metrics
        metrics = {}
        
        # Basic amplitude metrics
        metrics.update(self._calculate_amplitude_metrics(ref_mono, test_mono))
        
        # Frequency domain metrics
        metrics.update(self._calculate_frequency_metrics(ref_mono, test_mono))
        
        # Perceptual metrics
        metrics.update(self._calculate_perceptual_metrics(ref_mono, test_mono))
        
        # Correlation metrics
        metrics.update(self._calculate_correlation_metrics(ref_mono, test_mono))
        
        # Artifact detection metrics
        metrics.update(self._calculate_artifact_metrics(ref_mono, test_mono))
        
        # Overall score (weighted combination)
        metrics['overall_score'] = self._calculate_overall_score(metrics)
        
        return metrics
    
    def _calculate_amplitude_metrics(self, ref: np.ndarray, test: np.ndarray) -> Dict[str, float]:
        """Calculate basic amplitude-based quality metrics."""
        metrics = {}
        
        # RMS difference
        ref_rms = np.sqrt(np.mean(ref**2))
        test_rms = np.sqrt(np.mean(test**2))
        metrics['rms_difference_db'] = 20 * np.log10(abs(test_rms / ref_rms)) if ref_rms > 0 else -np.inf
        metrics['rms_reference_db'] = 20 * np.log10(ref_rms) if ref_rms > 0 else -np.inf
        metrics['rms_test_db'] = 20 * np.log10(test_rms) if test_rms > 0 else -np.inf
        
        # Peak level difference
        ref_peak = np.max(np.abs(ref))
        test_peak = np.max(np.abs(test))
        metrics['peak_difference_db'] = 20 * np.log10(test_peak / ref_peak) if ref_peak > 0 else -np.inf
        
        # Crest factor (peak to RMS ratio)
        ref_crest = ref_peak / ref_rms if ref_rms > 0 else 0
        test_crest = test_peak / test_rms if test_rms > 0 else 0
        metrics['crest_factor_difference_db'] = 20 * np.log10(test_crest / ref_crest) if ref_crest > 0 else 0
        
        # Mean absolute difference
        metrics['mean_absolute_difference'] = np.mean(np.abs(ref - test))
        
        # Maximum absolute difference
        metrics['max_absolute_difference'] = np.max(np.abs(ref - test))
        
        return metrics
    
    def _calculate_frequency_metrics(self, ref: np.ndarray, test: np.ndarray) -> Dict[str, float]:
        """Calculate frequency domain quality metrics."""
        metrics = {}
        
        # FFT analysis
        fft_size = 4096
        ref_fft = fft.fft(ref[:fft_size] if len(ref) >= fft_size else ref, n=fft_size)
        test_fft = fft.fft(test[:fft_size] if len(test) >= fft_size else test, n=fft_size)
        
        # Magnitude spectra
        ref_mag = np.abs(ref_fft[:fft_size//2])
        test_mag = np.abs(test_fft[:fft_size//2])
        
        # Frequency vector
        freqs = np.fft.fftfreq(fft_size, 1/self.sample_rate)[:fft_size//2]
        
        # Spectral difference
        spectral_diff = np.mean(np.abs(20 * np.log10(test_mag + 1e-10) - 20 * np.log10(ref_mag + 1e-10)))
        metrics['spectral_difference_db'] = spectral_diff
        
        # Frequency band analysis
        for band_name, (low_freq, high_freq) in self.frequency_bands.items():
            band_mask = (freqs >= low_freq) & (freqs <= high_freq)
            if np.any(band_mask):
                ref_band_power = np.mean(ref_mag[band_mask]**2)
                test_band_power = np.mean(test_mag[band_mask]**2)
                
                if ref_band_power > 0:
                    band_diff = 10 * np.log10(test_band_power / ref_band_power)
                else:
                    band_diff = 0
                
                metrics[f'{band_name}_power_difference_db'] = band_diff
        
        # Spectral centroid difference
        ref_centroid = np.sum(freqs * ref_mag**2) / np.sum(ref_mag**2) if np.sum(ref_mag**2) > 0 else 0
        test_centroid = np.sum(freqs * test_mag**2) / np.sum(test_mag**2) if np.sum(test_mag**2) > 0 else 0
        metrics['spectral_centroid_difference_hz'] = test_centroid - ref_centroid
        
        # Spectral rolloff difference  
        def spectral_rolloff(magnitude, threshold=0.85):
            total_energy = np.sum(magnitude**2)
            cumulative_energy = np.cumsum(magnitude**2)
            rolloff_index = np.where(cumulative_energy >= threshold * total_energy)[0]
            return freqs[rolloff_index[0]] if len(rolloff_index) > 0 else freqs[-1]
        
        ref_rolloff = spectral_rolloff(ref_mag)
        test_rolloff = spectral_rolloff(test_mag)
        metrics['spectral_rolloff_difference_hz'] = test_rolloff - ref_rolloff
        
        return metrics
    
    def _calculate_perceptual_metrics(self, ref: np.ndarray, test: np.ndarray) -> Dict[str, float]:
        """Calculate perceptual quality metrics."""
        metrics = {}
        
        # A-weighted RMS (perceptual loudness)
        ref_a_weighted = self._apply_a_weighting(ref)
        test_a_weighted = self._apply_a_weighting(test)
        
        ref_a_rms = np.sqrt(np.mean(ref_a_weighted**2))
        test_a_rms = np.sqrt(np.mean(test_a_weighted**2))
        
        if ref_a_rms > 0:
            metrics['a_weighted_difference_db'] = 20 * np.log10(test_a_rms / ref_a_rms)
        else:
            metrics['a_weighted_difference_db'] = 0
        
        # Zero crossing rate difference
        ref_zcr = self._zero_crossing_rate(ref)
        test_zcr = self._zero_crossing_rate(test)
        metrics['zero_crossing_rate_difference'] = test_zcr - ref_zcr
        
        # Short-time energy difference
        ref_ste = self._short_time_energy(ref)
        test_ste = self._short_time_energy(test)
        metrics['short_time_energy_difference_db'] = 10 * np.log10(test_ste / ref_ste) if ref_ste > 0 else 0
        
        return metrics
    
    def _calculate_correlation_metrics(self, ref: np.ndarray, test: np.ndarray) -> Dict[str, float]:
        """Calculate correlation-based quality metrics."""
        metrics = {}
        
        # Pearson correlation coefficient
        if len(ref) == len(test) and len(ref) > 1:
            correlation_matrix = np.corrcoef(ref, test)
            metrics['pearson_correlation'] = correlation_matrix[0, 1] if not np.isnan(correlation_matrix[0, 1]) else 0
        else:
            metrics['pearson_correlation'] = 0
        
        # Normalized cross-correlation
        if len(ref) > 0 and len(test) > 0:
            # Normalize signals
            ref_norm = (ref - np.mean(ref)) / (np.std(ref) + 1e-10)
            test_norm = (test - np.mean(test)) / (np.std(test) + 1e-10)
            
            # Cross-correlation
            cross_corr = np.correlate(ref_norm, test_norm, mode='full')
            max_corr_index = np.argmax(np.abs(cross_corr))
            metrics['max_cross_correlation'] = cross_corr[max_corr_index] / len(ref_norm)
        else:
            metrics['max_cross_correlation'] = 0
        
        return metrics
    
    def _calculate_artifact_metrics(self, ref: np.ndarray, test: np.ndarray) -> Dict[str, float]:
        """Calculate metrics that indicate processing artifacts."""
        metrics = {}
        
        # Difference signal analysis
        diff_signal = test - ref
        
        # Artifact energy
        metrics['artifact_energy_db'] = 10 * np.log10(np.mean(diff_signal**2) + 1e-10)
        
        # High-frequency artifact detection
        # Look for high-frequency content in difference signal
        if len(diff_signal) >= 1024:
            diff_fft = fft.fft(diff_signal[:1024])
            diff_mag = np.abs(diff_fft[:512])
            freqs = np.fft.fftfreq(1024, 1/self.sample_rate)[:512]
            
            # High frequency energy (above 8kHz)
            hf_mask = freqs > 8000
            if np.any(hf_mask):
                hf_energy = np.mean(diff_mag[hf_mask]**2)
                metrics['high_freq_artifact_db'] = 10 * np.log10(hf_energy + 1e-10)
            else:
                metrics['high_freq_artifact_db'] = -100
        else:
            metrics['high_freq_artifact_db'] = -100
        
        # Click/pop detection using derivative
        diff_derivative = np.diff(diff_signal)
        metrics['click_detection_metric'] = np.max(np.abs(diff_derivative))
        
        return metrics
    
    def _apply_a_weighting(self, audio: np.ndarray) -> np.ndarray:
        """Apply A-weighting filter for perceptual loudness measurement."""
        # Simple A-weighting approximation using high-pass and low-pass filters
        # This is a simplified version - a proper implementation would use
        # the exact A-weighting filter coefficients
        
        nyquist = self.sample_rate / 2
        
        # High-pass at ~20Hz to simulate low-frequency rolloff
        sos_hp = signal.butter(2, 20/nyquist, btype='high', output='sos')
        
        # Peak around 2-4kHz, rolloff above 10kHz
        sos_lp = signal.butter(1, 10000/nyquist, btype='low', output='sos')
        
        # Apply filters
        filtered = signal.sosfilt(sos_hp, audio)
        filtered = signal.sosfilt(sos_lp, filtered)
        
        return filtered
    
    def _zero_crossing_rate(self, audio: np.ndarray) -> float:
        """Calculate zero crossing rate."""
        if len(audio) <= 1:
            return 0
        
        zero_crossings = np.where(np.diff(np.sign(audio)))[0]
        return len(zero_crossings) / len(audio)
    
    def _short_time_energy(self, audio: np.ndarray, frame_size: int = 1024) -> float:
        """Calculate average short-time energy."""
        if len(audio) < frame_size:
            return np.mean(audio**2)
        
        energies = []
        for i in range(0, len(audio) - frame_size, frame_size // 2):
            frame = audio[i:i + frame_size]
            energy = np.mean(frame**2)
            energies.append(energy)
        
        return np.mean(energies) if energies else 0
    
    def _calculate_overall_score(self, metrics: Dict[str, float]) -> float:
        """
        Calculate an overall quality score (0-100).
        
        Higher scores indicate better quality (closer to reference).
        """
        # Weight different metric categories
        weights = {
            'rms_difference_db': 0.2,
            'spectral_difference_db': 0.25,
            'pearson_correlation': 0.25,
            'artifact_energy_db': 0.15,
            'a_weighted_difference_db': 0.15
        }
        
        # Normalize and score individual metrics
        scores = {}
        
        # RMS difference: closer to 0 dB is better
        rms_diff = abs(metrics.get('rms_difference_db', 0))
        scores['rms_difference_db'] = max(0, 100 - rms_diff * 10)  # -10dB = 0 points
        
        # Spectral difference: closer to 0 dB is better
        spectral_diff = abs(metrics.get('spectral_difference_db', 0))
        scores['spectral_difference_db'] = max(0, 100 - spectral_diff * 5)  # -20dB = 0 points
        
        # Correlation: 1.0 is perfect, 0.0 is terrible
        correlation = metrics.get('pearson_correlation', 0)
        scores['pearson_correlation'] = max(0, correlation * 100)
        
        # Artifact energy: lower is better
        artifact_energy = metrics.get('artifact_energy_db', -60)
        scores['artifact_energy_db'] = max(0, 100 + artifact_energy)  # -100dB = 100 points, 0dB = 0 points
        
        # A-weighted difference: closer to 0 dB is better
        a_weighted_diff = abs(metrics.get('a_weighted_difference_db', 0))
        scores['a_weighted_difference_db'] = max(0, 100 - a_weighted_diff * 10)
        
        # Calculate weighted average
        total_score = 0
        total_weight = 0
        
        for metric, weight in weights.items():
            if metric in scores:
                total_score += scores[metric] * weight
                total_weight += weight
        
        return total_score / total_weight if total_weight > 0 else 0
    
    def detect_artifacts(self, audio_path: str, threshold_db: float = -40) -> List[str]:
        """
        Detect common audio artifacts in processed audio.
        
        Args:
            audio_path: Path to audio file to analyze
            threshold_db: Threshold for artifact detection
            
        Returns:
            List of detected artifact descriptions
        """
        artifacts = []
        
        try:
            audio, sample_rate = sf.read(audio_path)
            
            # Convert to mono if stereo
            if audio.ndim > 1:
                audio = np.mean(audio, axis=1)
            
            # Check for clipping
            clip_threshold = 0.95
            clipped_samples = np.sum(np.abs(audio) >= clip_threshold)
            if clipped_samples > 0:
                clip_percentage = (clipped_samples / len(audio)) * 100
                artifacts.append(f"Clipping detected: {clip_percentage:.2f}% of samples")
            
            # Check for DC offset
            dc_offset = np.mean(audio)
            if abs(dc_offset) > 0.01:
                artifacts.append(f"DC offset detected: {dc_offset:.4f}")
            
            # Check for discontinuities (clicks/pops)
            derivative = np.diff(audio)
            max_derivative = np.max(np.abs(derivative))
            if max_derivative > 0.1:
                artifacts.append(f"Large discontinuity detected: {max_derivative:.4f}")
            
            # Check for unusual frequency content
            if len(audio) >= 4096:
                fft_data = fft.fft(audio[:4096])
                magnitude = np.abs(fft_data[:2048])
                freqs = np.fft.fftfreq(4096, 1/sample_rate)[:2048]
                
                # Check for excessive high-frequency content
                hf_mask = freqs > sample_rate * 0.4  # Above 80% Nyquist
                if np.any(hf_mask):
                    hf_energy = np.mean(magnitude[hf_mask]**2)
                    total_energy = np.mean(magnitude**2)
                    if total_energy > 0 and (hf_energy / total_energy) > 0.1:
                        artifacts.append("Excessive high-frequency content detected")
                
                # Check for notches or peaks in spectrum
                smoothed_mag = signal.savgol_filter(magnitude, 51, 3)
                diff_from_smooth = magnitude - smoothed_mag
                if np.max(diff_from_smooth) > np.mean(magnitude) * 2:
                    artifacts.append("Spectral peaks detected")
                if np.min(diff_from_smooth) < -np.mean(magnitude) * 0.5:
                    artifacts.append("Spectral notches detected")
            
        except Exception as e:
            artifacts.append(f"Analysis error: {str(e)}")
        
        return artifacts