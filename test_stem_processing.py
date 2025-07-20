#!/usr/bin/env python3
"""
Test script for debugging stem mode processing workflow
"""

import requests
import time
import os
import json

BASE_URL = "http://localhost:8000"

def test_stem_processing_with_reference():
    """Test stem processing using a reference file"""
    print("🔧 Testing stem mode processing with reference file...")
    
    # Use the separated stems and a reference file
    target_file = "audio/payback.wav"  # Original file as target
    reference_file = "audio/sbmt.wav"  # Different file as reference
    
    if not all(os.path.exists(f) for f in [target_file, reference_file]):
        print(f"❌ Required files not found")
        return None
    
    try:
        # Submit processing request with stem separation enabled
        with open(target_file, 'rb') as tf, open(reference_file, 'rb') as rf:
            files = {
                'target_file': tf,
                'reference_file': rf
            }
            data = {
                'use_stem_separation': 'true'
            }
            response = requests.post(f"{BASE_URL}/api/process_single", files=files, data=data)
        
        if response.status_code == 200:
            result = response.json()
            job_id = result.get('job_id')
            print(f"✓ Stem processing started with job_id: {job_id}")
            return job_id
        else:
            print(f"❌ Stem processing failed: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Error during stem processing: {e}")
        return None

def test_jit_stem_playback():
    """Test JIT playback with stem mode files"""
    print("🔧 Testing JIT stem playback...")
    
    # Check if we have the separated stem files available via temp_files endpoint
    stem_files = [
        "payback_Vocal.wav",
        "payback_Instrumental.wav"
    ]
    
    for stem_file in stem_files:
        try:
            response = requests.get(f"{BASE_URL}/temp_files/{stem_file}")
            if response.status_code == 200:
                print(f"✓ {stem_file} accessible via temp_files")
            else:
                print(f"❌ {stem_file} not accessible: {response.status_code}")
        except Exception as e:
            print(f"❌ Error accessing {stem_file}: {e}")

def monitor_stem_processing(job_id):
    """Monitor stem processing progress"""
    print(f"📊 Monitoring stem processing for job {job_id}...")
    
    max_attempts = 120  # 10 minutes max  
    attempt = 0
    
    while attempt < max_attempts:
        try:
            response = requests.get(f"{BASE_URL}/api/progress/{job_id}")
            
            if response.status_code == 200:
                data = response.json()
                stage = data.get('stage', 'unknown')
                progress = data.get('progress', 0)
                message = data.get('message', '')
                
                print(f"  [{progress:3d}%] {stage}: {message}")
                
                if stage == "completed":
                    print("✓ Stem processing completed!")
                    return data
                elif stage == "error":
                    print(f"❌ Stem processing failed: {message}")
                    return None
                    
            else:
                print(f"❌ Progress check failed: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Error checking progress: {e}")
        
        attempt += 1
        time.sleep(5)
    
    print("❌ Timeout waiting for stem processing to complete")
    return None

def test_stem_ui_elements():
    """Test if stem mode UI elements are present"""
    print("🔧 Testing stem mode UI elements...")
    
    try:
        response = requests.get(BASE_URL)
        if response.status_code == 200:
            content = response.text
            
            # Check for stem mode UI elements
            stem_elements = [
                'id="use-stem-separation"',
                'id="vocal-channel"', 
                'id="instrumental-channel"',
                'id="vocal-knob"',
                'id="instrumental-knob"'
            ]
            
            for element in stem_elements:
                if element in content:
                    print(f"✓ Found {element}")
                else:
                    print(f"❌ Missing {element}")
                    
        else:
            print(f"❌ Failed to load main page: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error testing UI elements: {e}")

def main():
    print("🧪 Starting comprehensive stem mode testing...")
    print("=" * 60)
    
    # Test 1: UI elements
    test_stem_ui_elements()
    print()
    
    # Test 2: JIT playback accessibility  
    test_jit_stem_playback()
    print()
    
    # Test 3: Stem processing workflow
    job_id = test_stem_processing_with_reference()
    if job_id:
        print()
        # Test 4: Monitor processing
        result = monitor_stem_processing(job_id)
        if result:
            print("\n📋 Final stem processing result:")
            print(json.dumps(result, indent=2))
    
    print("\n🧪 Comprehensive stem mode testing complete!")

if __name__ == "__main__":
    main()