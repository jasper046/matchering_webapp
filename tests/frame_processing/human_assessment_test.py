#!/usr/bin/env python3
"""
Human Assessment Test Application

Processes user-provided audio clips with both frame-aware and monolithic
limiters to enable subjective quality comparison.
"""

import os
import sys
import numpy as np
import soundfile as sf
import time
from pathlib import Path
from typing import List, Tuple, Dict

# Add project paths
project_root = os.path.join(os.path.dirname(__file__), '../..')
sys.path.insert(0, project_root)
sys.path.insert(0, os.path.join(project_root, 'matchering-fork'))

# Import frame-aware limiter
from frame_aware_limiter import FrameAwareLimiterProcessor, LimiterConfig

# Try to import original limiter
try:
    import matchering as mg
    from matchering.limiter import limit
    from matchering.defaults import Config
    ORIGINAL_LIMITER_AVAILABLE = True
    print("✓ Original Hyrax limiter available")
except ImportError as e:
    print(f"⚠ Original limiter not available: {e}")
    ORIGINAL_LIMITER_AVAILABLE = False


class HumanAssessmentTest:
    """Application for human assessment of limiter implementations."""
    
    def __init__(self, input_dir: str = "test_audio", output_dir: str = "human_assessment_results"):
        self.input_dir = input_dir
        self.output_dir = output_dir
        
        # Create directories
        os.makedirs(input_dir, exist_ok=True)
        os.makedirs(output_dir, exist_ok=True)
        
        # Supported audio formats
        self.supported_formats = ['.wav', '.flac', '.aiff', '.mp3', '.m4a']
        
        # Test configurations
        self.test_configs = {
            'default': {
                'name': 'Default Settings',
                'params': {}
            },
            'gentle': {
                'name': 'Gentle Limiting',
                'params': {
                    'threshold_db': -0.01,
                    'attack_ms': 2.0,
                    'release_ms': 1000.0
                }
            },
            'aggressive': {
                'name': 'Aggressive Limiting', 
                'params': {
                    'threshold_db': -1.0,
                    'attack_ms': 0.5,
                    'release_ms': 500.0
                }
            }
        }
    
    def find_audio_files(self) -> List[Path]:
        """Find all supported audio files in the input directory."""
        audio_files = []
        
        for ext in self.supported_formats:
            pattern = f"*{ext}"
            audio_files.extend(Path(self.input_dir).glob(pattern))
            audio_files.extend(Path(self.input_dir).glob(pattern.upper()))
        
        return sorted(audio_files)
    
    def load_audio_file(self, file_path: Path) -> Tuple[np.ndarray, int]:
        """Load audio file and ensure stereo format."""
        try:
            audio, sample_rate = sf.read(str(file_path))
            
            # Convert to stereo if needed
            if audio.ndim == 1:
                audio = np.column_stack([audio, audio])
            elif audio.shape[1] == 1:
                audio = np.column_stack([audio[:, 0], audio[:, 0]])
            elif audio.shape[1] > 2:
                # Take first two channels for stereo
                audio = audio[:, :2]
            
            print(f"  Loaded: {audio.shape[0]} samples, {sample_rate}Hz, {audio.shape[1]} channels")
            return audio, sample_rate
            
        except Exception as e:
            print(f"  ❌ Failed to load {file_path}: {e}")
            return None, None
    
    def process_with_original_limiter(self, audio: np.ndarray, config_params: Dict,
                                    sample_rate: int) -> Tuple[np.ndarray, float]:
        """Process audio with original monolithic limiter."""
        if not ORIGINAL_LIMITER_AVAILABLE:
            print("    ⚠ Original limiter not available, returning scaled audio")
            return audio * 0.9, 0.0
        
        try:
            start_time = time.time()
            
            # Create matchering config
            config = Config()
            config.internal_sample_rate = sample_rate
            
            # Apply custom parameters
            if 'attack_ms' in config_params:
                config.attack = config_params['attack_ms']
            if 'hold_ms' in config_params:
                config.hold = config_params['hold_ms'] 
            if 'release_ms' in config_params:
                config.release = config_params['release_ms']
            
            # Apply limiter
            limited_audio = limit(audio, config)
            processing_time = time.time() - start_time
            
            return limited_audio, processing_time
            
        except Exception as e:
            print(f"    ❌ Original limiter failed: {e}")
            return audio * 0.9, 0.0
    
    def process_with_frame_limiter(self, audio: np.ndarray, config_params: Dict,
                                 sample_rate: int) -> Tuple[np.ndarray, float]:
        """Process audio with frame-aware limiter."""
        try:
            start_time = time.time()
            
            # Initialize frame processor
            processor = FrameAwareLimiterProcessor(sample_rate=sample_rate, frame_size=4096)
            processor.initialize_limiter(config_params)
            
            # Process in frames
            frame_size = 4096
            frame_results = []
            
            for start_idx in range(0, len(audio), frame_size):
                end_idx = min(start_idx + frame_size, len(audio))
                frame = audio[start_idx:end_idx]
                
                processed_frame = processor.process_audio_frame(frame, enable_limiter=True)
                frame_results.append(processed_frame)
            
            # Concatenate results
            limited_audio = np.vstack(frame_results)
            processing_time = time.time() - start_time
            
            return limited_audio, processing_time
            
        except Exception as e:
            print(f"    ❌ Frame limiter failed: {e}")
            return audio * 0.9, 0.0
    
    def process_single_file(self, file_path: Path) -> Dict:
        """Process a single audio file with all configurations."""
        print(f"\n🎵 Processing: {file_path.name}")
        
        # Load audio
        audio, sample_rate = self.load_audio_file(file_path)
        if audio is None:
            return {'error': 'Failed to load audio'}
        
        results = {
            'filename': file_path.name,
            'sample_rate': sample_rate,
            'duration_seconds': len(audio) / sample_rate,
            'configurations': {}
        }
        
        # Process with each configuration
        for config_id, config_info in self.test_configs.items():
            print(f"  📋 Config: {config_info['name']}")
            
            config_results = {
                'name': config_info['name'],
                'params': config_info['params'],
                'files': {}
            }
            
            # Create output filenames
            base_name = file_path.stem
            original_filename = f"{base_name}_{config_id}_original.wav"
            frame_filename = f"{base_name}_{config_id}_frame.wav"
            input_filename = f"{base_name}_input.wav"
            
            # Save input file for reference
            input_path = os.path.join(self.output_dir, input_filename)
            if not os.path.exists(input_path):
                sf.write(input_path, audio, sample_rate)
                print(f"    💾 Saved input: {input_filename}")
            
            # Process with original limiter
            print("    🔧 Processing with original limiter...")
            original_audio, original_time = self.process_with_original_limiter(
                audio, config_info['params'], sample_rate
            )
            
            original_path = os.path.join(self.output_dir, original_filename)
            sf.write(original_path, original_audio, sample_rate)
            print(f"    💾 Saved: {original_filename} ({original_time:.2f}s)")
            
            # Process with frame limiter
            print("    🔧 Processing with frame limiter...")
            frame_audio, frame_time = self.process_with_frame_limiter(
                audio, config_info['params'], sample_rate
            )
            
            frame_path = os.path.join(self.output_dir, frame_filename)
            sf.write(frame_path, frame_audio, sample_rate)
            print(f"    💾 Saved: {frame_filename} ({frame_time:.2f}s)")
            
            # Store results
            config_results['files'] = {
                'input': input_filename,
                'original': original_filename,
                'frame': frame_filename
            }
            config_results['processing_times'] = {
                'original': original_time,
                'frame': frame_time
            }
            
            results['configurations'][config_id] = config_results
        
        return results
    
    def generate_listening_guide(self, all_results: List[Dict]) -> str:
        """Generate a listening guide for human assessment."""
        guide_path = os.path.join(self.output_dir, "LISTENING_GUIDE.md")
        
        with open(guide_path, 'w') as f:
            f.write("# Human Assessment Listening Guide\n\n")
            f.write(f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("## How to Use This Guide\n\n")
            f.write("1. Use high-quality headphones or studio monitors\n")
            f.write("2. Listen to each pair of files (original vs frame) at moderate volume\n")
            f.write("3. Pay attention to:\n")
            f.write("   - Overall loudness and dynamics\n")
            f.write("   - Transient response (drums, percussion)\n")
            f.write("   - Musical character and clarity\n")
            f.write("   - Any audible artifacts or distortion\n")
            f.write("4. Note your preferences and observations\n\n")
            
            f.write("## Test Files\n\n")
            
            for result in all_results:
                if 'error' in result:
                    continue
                    
                f.write(f"### {result['filename']}\n")
                f.write(f"- Duration: {result['duration_seconds']:.1f} seconds\n")
                f.write(f"- Sample Rate: {result['sample_rate']} Hz\n\n")
                
                f.write("**File Comparisons:**\n\n")
                
                for config_id, config_data in result['configurations'].items():
                    f.write(f"#### {config_data['name']}\n")
                    f.write(f"- Input: `{config_data['files']['input']}`\n")
                    f.write(f"- Original Limiter: `{config_data['files']['original']}`\n")
                    f.write(f"- Frame Limiter: `{config_data['files']['frame']}`\n")
                    
                    if config_data['params']:
                        f.write(f"- Settings: {config_data['params']}\n")
                    
                    f.write("\\n")
                
                f.write("---\\n\\n")
            
            f.write("## Assessment Questions\n\n")
            f.write("For each file pair, consider:\n\n")
            f.write("1. **Overall Quality**: Which version sounds better overall?\n")
            f.write("2. **Loudness**: Do both versions achieve similar perceived loudness?\n")
            f.write("3. **Dynamics**: How well are the dynamics preserved?\n")
            f.write("4. **Transients**: Are drum hits and percussive elements handled well?\n")
            f.write("5. **Artifacts**: Do you hear any pumping, distortion, or other artifacts?\n")
            f.write("6. **Musical Character**: Which version maintains the musical character better?\n\n")
            
            f.write("## Notes Section\n\n")
            f.write("Use this space for your observations:\n\n")
            f.write("```\n")
            f.write("File: ________________\n")
            f.write("Config: ______________\n")
            f.write("Preference: Original / Frame / No difference\n")
            f.write("Notes: \n\n\n")
            f.write("```\n\n")
        
        return guide_path
    
    def run_assessment(self) -> None:
        """Run the complete human assessment process."""
        print("🎧 Human Assessment Test Application")
        print("=" * 50)
        
        # Check for input directory
        if not os.path.exists(self.input_dir):
            print(f"\n📁 Creating input directory: {self.input_dir}")
            print("   Place your 20-second audio clips in this folder")
            print("   Supported formats: .wav, .flac, .aiff, .mp3, .m4a")
            return
        
        # Find audio files
        audio_files = self.find_audio_files()
        
        if not audio_files:
            print(f"\n❌ No audio files found in {self.input_dir}")
            print("   Supported formats: " + ", ".join(self.supported_formats))
            print(f"   Place your audio clips in {self.input_dir} and run again")
            return
        
        print(f"\n🔍 Found {len(audio_files)} audio file(s):")
        for file_path in audio_files:
            print(f"   - {file_path.name}")
        
        # Process all files
        all_results = []
        
        for file_path in audio_files:
            result = self.process_single_file(file_path)
            all_results.append(result)
        
        # Generate listening guide
        guide_path = self.generate_listening_guide(all_results)
        
        print(f"\n🎉 Processing complete!")
        print(f"📁 Output directory: {self.output_dir}")
        print(f"📋 Listening guide: {guide_path}")
        print(f"🎧 Ready for human assessment!")
        
        # Summary
        successful_files = sum(1 for r in all_results if 'error' not in r)
        total_configs = len(self.test_configs)
        total_comparisons = successful_files * total_configs
        
        print(f"\n📊 Generated {total_comparisons} comparison pairs from {successful_files} files")
        print(f"   Each file processed with {total_configs} different limiter configurations")


def main():
    """Main entry point."""
    # Check for command line arguments
    if len(sys.argv) > 1:
        input_dir = sys.argv[1]
        output_dir = sys.argv[2] if len(sys.argv) > 2 else "human_assessment_results"
    else:
        input_dir = "test_audio"
        output_dir = "human_assessment_results"
    
    # Create and run assessment
    assessment = HumanAssessmentTest(input_dir, output_dir)
    assessment.run_assessment()


if __name__ == '__main__':
    main()