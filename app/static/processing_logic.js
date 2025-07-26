
// processing_logic.js

let isProcessing = false; // Global processing state to prevent double submissions and tab switching
let isJITInitializing = false; // New state for JIT initialization

let originalFilePath = null; // Path to original audio file
let processedFilePath = null; // Path to processed audio file

// Processing state management functions
function setProcessingState(processing) {
    isProcessing = processing;
    
    // Disable/enable process button
    const processFileButton = document.getElementById('process-file-button');
    if (processFileButton) {
        processFileButton.disabled = processing;
        processFileButton.textContent = processing ? 'Processing...' : 'Process File';
    }
    
    // Disable/enable tab switching
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (processing) {
            link.style.pointerEvents = 'none';
            link.style.opacity = '0.5';
        } else {
            link.style.pointerEvents = 'auto';
            link.style.opacity = '1';
        }
    });
    
    // Disable/enable other form submissions
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        const submitButtons = form.querySelectorAll('button[type="submit"]');
        submitButtons.forEach(button => {
            if (button !== processFileButton) {
                button.disabled = processing;
            }
        });
    });
}

// Function to check and update process button visibility
function checkProcessButtonVisibility() {
    const useStemSeparation = document.getElementById('use-stem-separation').checked;
    const isVocalPresetSelected = document.getElementById('vocal-preset-file-single').files.length > 0;
    const isInstrumentalPresetSelected = document.getElementById('instrumental-preset-file-single').files.length > 0;
    const isTargetFileSelected = document.getElementById('target-file-single').files.length > 0;
    let isRequiredFilesSelected = false;

    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    const processFileButton = document.getElementById('process-file-button');

    if (radioReference.checked) {
        // Reference mode: always just need reference file (stem separation happens on backend)
        isRequiredFilesSelected = document.getElementById('reference-file-single').files.length > 0;
    } else if (radioPreset.checked) {
        if (useStemSeparation) {
            // Preset mode with stem separation: need both vocal and instrumental presets
            isRequiredFilesSelected = isVocalPresetSelected && isInstrumentalPresetSelected;
        } else {
            // Standard preset mode: need single preset file
            isRequiredFilesSelected = document.getElementById('preset-file-single').files.length > 0;
        }
    }

    if (isTargetFileSelected && isRequiredFilesSelected) {
        processFileButton.style.display = 'block';
    } else {
        processFileButton.style.display = 'none';
    }
}

// Function to toggle reference input visibility based on radio selection
function toggleReferenceInput() {
    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    const useStemSeparation = document.getElementById('use-stem-separation');
    
    const referenceFileDiv = document.getElementById('reference-file-single-div');
    const presetFileDiv = document.getElementById('preset-file-single-div');
    const vocalPresetDiv = document.getElementById('vocal-preset-file-single-div');
    const instrumentalPresetDiv = document.getElementById('instrumental-preset-file-single-div');
    
    if (!radioReference || !radioPreset) return;
    
    // Hide all divs first
    if (referenceFileDiv) referenceFileDiv.style.display = 'none';
    if (presetFileDiv) presetFileDiv.style.display = 'none';
    if (vocalPresetDiv) vocalPresetDiv.style.display = 'none';
    if (instrumentalPresetDiv) instrumentalPresetDiv.style.display = 'none';
    
    if (radioReference.checked) {
        // Show reference file input
        if (referenceFileDiv) referenceFileDiv.style.display = 'block';
    } else if (radioPreset.checked) {
        // Check if stem separation is enabled
        const stemSeparationEnabled = useStemSeparation && useStemSeparation.checked;
        
        if (stemSeparationEnabled) {
            // Show vocal and instrumental preset inputs
            if (vocalPresetDiv) vocalPresetDiv.style.display = 'block';
            if (instrumentalPresetDiv) instrumentalPresetDiv.style.display = 'block';
        } else {
            // Show single preset input
            if (presetFileDiv) presetFileDiv.style.display = 'block';
        }
    }
    
    // Update process button visibility
    checkProcessButtonVisibility();
}

// Export variables and functions that need to be accessed globally
window.setProcessingState = setProcessingState;
window.checkProcessButtonVisibility = checkProcessButtonVisibility;
window.toggleReferenceInput = toggleReferenceInput;
window.isProcessing = isProcessing;
window.isJITInitializing = isJITInitializing;
window.originalFilePath = originalFilePath;
window.processedFilePath = processedFilePath;

// Generate blend preview function for real-time mixing
// Handle save blend functionality
window.handleSaveBlend = async () => {
    if (!window.originalFilePath || !window.processedFilePath) {
        alert('No processed audio available to save.');
        return;
    }
    
    const blendValue = window.currentBlendValue || 50;
    const blendRatio = blendValue / 100.0;
    const statusDiv = document.getElementById('save-blend-status');
    
    try {
        statusDiv.innerHTML = '<div class="alert alert-info">Saving blended audio...</div>';
        
        const formData = new FormData();
        formData.append('original_path', window.originalFilePath);
        formData.append('processed_path', window.processedFilePath);
        formData.append('blend_ratio', blendRatio);
        formData.append('apply_limiter', true);
        
        const response = await fetch('/api/blend_and_save', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.blended_file_path) {
                // Extract filename from path for download URL
                const filename = result.blended_file_path.split('/').pop();
                console.log('Save result:', result);
                console.log('Extracted filename:', filename);
                statusDiv.innerHTML = `
                    <div class="alert alert-success">
                        Blend saved successfully! 
                        <a href="/download/output/${filename}" target="_blank" class="btn btn-sm btn-outline-success ms-2">Download</a>
                    </div>
                `;
            } else {
                console.warn('No blended_file_path in response:', result);
                statusDiv.innerHTML = '<div class="alert alert-success">Blend saved successfully!</div>';
            }
        } else {
            const error = await response.json();
            statusDiv.innerHTML = `<div class="alert alert-danger">Error saving blend: ${error.detail || 'Save failed'}</div>`;
        }
    } catch (error) {
        console.error('Error saving blend:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error: Failed to save blend</div>';
    }
};

// Throttle blend preview generation to prevent flooding
let blendPreviewTimeout = null;

window.generateBlendPreview = async (forceUpdate = false) => {
    // Skip preview generation if audio is currently playing (unless forced)
    const isCurrentlyPlaying = window.previewAudioElement && !window.previewAudioElement.paused;
    
    if (isCurrentlyPlaying && !forceUpdate) {
        console.log('Skipping preview generation during playback - will update when stopped');
        return;
    }
    
    // Cancel any pending preview generation
    if (blendPreviewTimeout) {
        clearTimeout(blendPreviewTimeout);
    }
    
    // Throttle the actual generation
    return new Promise((resolve, reject) => {
        blendPreviewTimeout = setTimeout(async () => {
            try {
                await generateBlendPreviewInternal();
                resolve();
            } catch (error) {
                reject(error);
            }
        }, 150); // 150ms throttle
    });
};

// Internal function that does the actual work
async function generateBlendPreviewInternal() {
    if (!window.originalFilePath || !window.processedFilePath) {
        console.warn('Original or processed file path not available for blend preview');
        return;
    }
    
    // Get current blend value from knob (0-100, convert to 0.0-1.0)
    const blendValue = (typeof window.currentBlendValue !== 'undefined') ? window.currentBlendValue : 50;
    const blendRatio = blendValue / 100.0;
    
    // Get master gain value (if available)
    const masterGainValue = (typeof window.currentMasterGain !== 'undefined') ? window.currentMasterGain : 0;
    
    console.log('Generating blend preview with ratio:', blendRatio, 'master gain:', masterGainValue);
    
    try {
        const formData = new FormData();
        formData.append('original_path', window.originalFilePath);
        formData.append('processed_path', window.processedFilePath);
        formData.append('blend_ratio', blendRatio);
        formData.append('apply_limiter', true); // Default to applying limiter
        
        const response = await fetch('/api/preview_blend', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.preview_file_path) {
                // Extract filename from path for download URL
                const filename = result.preview_file_path.split('/').pop();
                const audioUrl = `/download/output/${filename}`;
                
                // Update the global preview audio element
                if (!window.previewAudioElement) {
                    window.previewAudioElement = new Audio();
                    console.log('Created new audio element');
                }
                
                window.previewAudioElement.src = audioUrl;
                window.currentPreviewPath = audioUrl;
                
                // Make sure the audio_playback.js variables are synced
                // Force update the window reference since modules might have stale references
                window.previewAudioElement = window.previewAudioElement;
                
                console.log('Audio element check:', !!window.previewAudioElement, 'path:', window.currentPreviewPath);
                
                console.log('Preview audio set up:', audioUrl);
                
                // Wait for audio to load
                window.previewAudioElement.addEventListener('loadeddata', () => {
                    console.log('Preview audio loaded successfully, duration:', window.previewAudioElement.duration);
                }, { once: true });
                
                window.previewAudioElement.addEventListener('error', (e) => {
                    console.error('Preview audio failed to load:', e, window.previewAudioElement.error);
                }, { once: true });
                
                // Force load
                window.previewAudioElement.load();
            }
        } else {
            console.error('Failed to generate blend preview:', response.statusText);
        }
    } catch (error) {
        console.error('Error generating blend preview:', error);
    }
}

// Form submit handler for single file processing
window.handleProcessSingleFormSubmit = async (event) => {
    event.preventDefault(); // Prevent default form submission
    
    const form = event.target;
    const statusDiv = document.getElementById('process-single-status');
    
    // Create FormData manually to only include relevant files
    const formData = new FormData();
    
    // Always include target file
    const targetFile = document.getElementById('target-file-single');
    if (targetFile.files.length > 0) {
        formData.append('target_file', targetFile.files[0]);
    }
    
    // Include stem separation setting
    const useStemSeparation = document.getElementById('use-stem-separation');
    formData.append('use_stem_separation', useStemSeparation ? useStemSeparation.checked : false);
    
    // Include files based on selected mode
    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    
    if (radioReference && radioReference.checked) {
        // Reference mode - include reference file
        const referenceFile = document.getElementById('reference-file-single');
        if (referenceFile && referenceFile.files.length > 0) {
            formData.append('reference_file', referenceFile.files[0]);
        }
    } else if (radioPreset && radioPreset.checked) {
        // Preset mode - check if stem separation is enabled
        if (useStemSeparation && useStemSeparation.checked) {
            // Include vocal and instrumental presets for stem separation
            const vocalPreset = document.getElementById('vocal-preset-file-single');
            const instrumentalPreset = document.getElementById('instrumental-preset-file-single');
            if (vocalPreset && vocalPreset.files.length > 0) {
                formData.append('vocal_preset_file', vocalPreset.files[0]);
            }
            if (instrumentalPreset && instrumentalPreset.files.length > 0) {
                formData.append('instrumental_preset_file', instrumentalPreset.files[0]);
            }
        } else {
            // Include single preset for standard processing
            const presetFile = document.getElementById('preset-file-single');
            if (presetFile && presetFile.files.length > 0) {
                formData.append('preset_file', presetFile.files[0]);
            }
        }
    }
    
    try {
        // Set processing state
        setProcessingState(true);
        statusDiv.innerHTML = '<div class="alert alert-info">Processing audio file...</div>';
        
        // Show dummy waveform while processing
        const waveformImage = document.getElementById('combined-waveform-image');
        if (waveformImage) {
            waveformImage.src = '/api/waveform/dummy?' + new Date().getTime();
            waveformImage.alt = 'Processing...';
        }
        
        // Make API call
        const response = await fetch('/api/process_single', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            statusDiv.innerHTML = '<div class="alert alert-success">Processing completed successfully!</div>';
            
            // Show results or handle response
            if (result.processed_file_path) {
                const resultsDiv = document.getElementById('single-conversion-results');
                if (resultsDiv) {
                    resultsDiv.style.display = 'block';
                    
                    // Store file paths for blending
                    if (typeof window !== 'undefined') {
                        window.originalFilePath = result.original_file_path;
                        window.processedFilePath = result.processed_file_path;
                    }
                    
                    // Show the appropriate channel based on processing mode
                    const useStemSeparation = document.getElementById('use-stem-separation');
                    const isStemMode = useStemSeparation && useStemSeparation.checked;
                    
                    if (isStemMode) {
                        // Show stem mode channels
                        const vocalChannel = document.getElementById('vocal-channel');
                        const instrumentalChannel = document.getElementById('instrumental-channel');
                        if (vocalChannel) vocalChannel.style.display = 'block';
                        if (instrumentalChannel) instrumentalChannel.style.display = 'block';
                        
                        // Hide standard channel
                        const standardChannel = document.getElementById('standard-channel');
                        if (standardChannel) standardChannel.style.display = 'none';
                    } else {
                        // Show standard channel for non-stem mode
                        const standardChannel = document.getElementById('standard-channel');
                        if (standardChannel) standardChannel.style.display = 'block';
                        
                        // Hide stem channels
                        const vocalChannel = document.getElementById('vocal-channel');
                        const instrumentalChannel = document.getElementById('instrumental-channel');
                        if (vocalChannel) vocalChannel.style.display = 'none';
                        if (instrumentalChannel) instrumentalChannel.style.display = 'none';
                    }
                    
                    // Initialize the knob controls
                    if (typeof window.initializeKnob === 'function') {
                        window.initializeKnob();
                    }
                    
                    // Generate actual waveform from processed audio
                    const waveformImage = document.getElementById('combined-waveform-image');
                    if (waveformImage && result.original_file_path && result.processed_file_path) {
                        setTimeout(async () => {
                            try {
                                console.log('Generating waveform...');
                                
                                const formData = new FormData();
                                formData.append('original_path', result.original_file_path);
                                formData.append('processed_path', result.processed_file_path);
                                
                                const waveformResponse = await fetch('/api/waveform/generate', {
                                    method: 'POST',
                                    body: formData
                                });
                                
                                if (waveformResponse.ok) {
                                    // Create a blob URL for the waveform image
                                    const blob = await waveformResponse.blob();
                                    const imageUrl = URL.createObjectURL(blob);
                                    waveformImage.src = imageUrl;
                                    waveformImage.alt = 'Audio Waveform (Original ↑ / Processed ↓)';
                                    console.log('Waveform generated successfully');
                                } else {
                                    console.error('Failed to generate waveform');
                                    waveformImage.alt = 'Failed to generate waveform';
                                }
                            } catch (error) {
                                console.error('Error generating waveform:', error);
                                waveformImage.alt = 'Error generating waveform';
                            }
                        }, 100); // Small delay to ensure everything is set up
                    }
                    
                    // Initialize audio playback if available
                    if (typeof window.initializeAudioPlayback === 'function') {
                        window.initializeAudioPlayback();
                    }
                    
                    // Generate initial blend preview
                    setTimeout(() => {
                        console.log('Generating initial blend preview...');
                        if (typeof window.generateBlendPreview === 'function') {
                            window.generateBlendPreview(true).catch(error => {
                                console.error('Failed to generate initial blend preview:', error);
                            });
                        }
                    }, 500);
                }
            }
        } else {
            const error = await response.json();
            statusDiv.innerHTML = `<div class="alert alert-danger">Error: ${error.detail || 'Processing failed'}</div>`;
        }
    } catch (error) {
        console.error('Error processing file:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error: Failed to process file</div>';
    } finally {
        setProcessingState(false);
    }
};

// Step-by-step display logic for Single File Conversion
window.handleTargetFileSingleChange = () => {
    console.log('handleTargetFileSingleChange triggered');
    const processSingleStatus = document.getElementById('process-single-status');
    const singleConversionResults = document.getElementById('single-conversion-results');
    const targetFileSingle = document.getElementById('target-file-single');

    console.log('targetFileSingle.files.length:', targetFileSingle.files.length);
    processSingleStatus.textContent = ''; // Clear status
    if (targetFileSingle.files.length > 0) {
        console.log('File selected, attempting to show elements.');
        // Show stem separation option first
        document.getElementById('stem-separation-selection').style.display = 'block';
        document.getElementById('reference-type-selection').style.display = 'block';
        
        // Only auto-select radioReference if no radio button is currently selected
        const radioReference = document.getElementById('radioReference');
        const radioPreset = document.getElementById('radioPreset');
        if (!radioReference.checked && !radioPreset.checked) {
            // Automatically check radioReference by default for non-stem mode
            radioReference.checked = true;
            // Trigger the change event for radioReference to update the UI
            const event = new Event('change');
            radioReference.dispatchEvent(event);
        } else {
            // If a radio button is already selected, just trigger its change event to update UI
            if (radioReference.checked) {
                const event = new Event('change');
                radioReference.dispatchEvent(event);
            } else if (radioPreset.checked) {
                const event = new Event('change');
                radioPreset.dispatchEvent(event);
            }
        }
    } else {
        console.log('No file selected, hiding elements.');
        document.getElementById('stem-separation-selection').style.display = 'none';
        document.getElementById('reference-type-selection').style.display = 'none';
        document.getElementById('reference-file-single-div').style.display = 'none';
        document.getElementById('preset-file-single-div').style.display = 'none';
        document.getElementById('vocal-preset-file-single-div').style.display = 'none';
        document.getElementById('instrumental-preset-file-single-div').style.display = 'none';
    }
    window.checkProcessButtonVisibility(); // Check visibility after target file changes
    // Hide results section if target file changes
    singleConversionResults.style.display = 'none';
};


    

