
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
    
    // Clear any existing preset download data when switching between modes
    const processSingleStatus = document.getElementById('process-single-status');
    if (processSingleStatus) {
        delete processSingleStatus.dataset.vocalPresetPath;
        delete processSingleStatus.dataset.instrumentalPresetPath;
        delete processSingleStatus.dataset.vocalPresetFilename;
        delete processSingleStatus.dataset.instrumentalPresetFilename;
        delete processSingleStatus.dataset.createdPresetPath;
        delete processSingleStatus.dataset.createdPresetFilename;
    }
    
    // Remove any existing preset download section
    const existingPresetSection = document.getElementById('preset-download-section');
    if (existingPresetSection) {
        existingPresetSection.remove();
    }
    
    // Update process button visibility
    checkProcessButtonVisibility();
}

// Simple function to send current parameters to backend (seamless updates)
// Legacy HTTP parameter update function removed - we now use WebSocket-only updates via unified audio controller

// Update preview function for master gain compatibility
window.updatePreview = () => {
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
};

// Utility to check if we're in stem mode
window.isCurrentlyStemMode = () => {
    const useStemSeparation = document.getElementById('use-stem-separation');
    return useStemSeparation && useStemSeparation.checked;
};

// Update dual stem mix for stem mode processing
window.updateDualStemMix = () => {
    // Use unified controller for all parameter updates
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    } else {
        console.warn('Unified audio controller not available');
    }
};

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
    console.log('handleSaveBlend called');
    console.log('originalFilePath:', window.originalFilePath);
    console.log('processedFilePath:', window.processedFilePath);
    console.log('referenceFilename:', window.referenceFilename);
    
    if (!window.originalFilePath || !window.processedFilePath) {
        console.warn('Missing required paths for saving');
        alert('No processed audio available to save. Please process a file first.');
        return;
    }
    
    const blendValue = window.currentBlendValue || 50;
    const blendRatio = blendValue / 100.0;
    const statusDiv = document.getElementById('save-blend-status');
    
    try {
        statusDiv.innerHTML = '<div class="alert alert-info">Saving blended audio...</div>';
        
        // Extract original filename from the file path or stored filename
        let originalFilename = null;
        if (window.originalFilePath) {
            // Extract filename from path
            originalFilename = window.originalFilePath.split('/').pop();
        }
        
        const formData = new FormData();
        formData.append('original_path', window.originalFilePath);
        formData.append('processed_path', window.processedFilePath);
        formData.append('blend_ratio', blendRatio);
        formData.append('apply_limiter', true);
        
        // Add master gain value
        const masterGainValue = document.getElementById('master-gain-value');
        if (masterGainValue) {
            formData.append('master_gain', parseFloat(masterGainValue.value));
        }
        
        if (originalFilename) {
            formData.append('original_filename', originalFilename);
        }
        if (window.referenceFilename) {
            formData.append('reference_filename', window.referenceFilename);
        }
        
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
    
    // Try frame processing first if available (supports both blend ratio and master gain)
    if (window.frameProcessingManager && window.frameProcessingManager.sessionId) {
        try {
            console.log('Using frame processing for blend preview with blend ratio:', blendRatio, 'and master gain:', masterGainValue);
            
            // Update frame processing parameters
            window.frameProcessingManager.handleParameterChange({
                blend_ratio: blendRatio,
                master_gain_db: masterGainValue,
                limiter_enabled: true
            });
            
            // The frame processing manager will handle the preview generation
            return;
        } catch (error) {
            console.warn('Frame processing failed, falling back to basic blend:', error);
        }
    }
    
    // Fallback to basic blend preview (no master gain support)
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
            
            // Handle stem processing (background job) vs regular processing
            if (result.job_id) {
                // Stem processing - poll for progress
                statusDiv.innerHTML = '<div class="alert alert-info">Starting stem separation processing...</div>';
                pollStemProcessingProgress(result.job_id, statusDiv);
                return;
            }
            
            statusDiv.innerHTML = '<div class="alert alert-success">Processing completed successfully!</div>';
            
            // Show results or handle response
            if (result.processed_file_path) {
                const resultsDiv = document.getElementById('single-conversion-results');
                if (resultsDiv) {
                    resultsDiv.style.display = 'block';
                    
                    // Store streaming session ID for parameter updates
                    if (result.session_id) {
                        window.streamingSessionId = result.session_id;
                        console.log('Streaming session established:', result.session_id);
                    }
                    
                    // Store file paths for fallback
                    if (typeof window !== 'undefined') {
                        window.originalFilePath = result.original_file_path;
                        window.processedFilePath = result.processed_file_path;
                        window.referenceFilename = result.reference_filename;
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
                    
                    // Set preset data for download links (if preset was created from reference audio)
                    const processSingleStatus = document.getElementById('process-single-status');
                    if (processSingleStatus && result.created_preset_path && result.created_preset_filename) {
                        processSingleStatus.dataset.createdPresetPath = result.created_preset_path;
                        processSingleStatus.dataset.createdPresetFilename = result.created_preset_filename;
                        
                        // Show preset download links immediately after processing completion
                        if (window.showPresetDownloadLinks) {
                            window.showPresetDownloadLinks();
                        }
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
                                    
                                    // Add click event listener for seeking
                                    waveformImage.style.cursor = 'pointer';
                                    waveformImage.onclick = window.seekAudio;
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
                    
                    // WebSocket audio will be initialized lazily on first play button press
                    
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
    
    // Clean up any previous sessions to prevent interference
    if (window.stemWebSocketAudioStream && window.stemWebSocketAudioStream.isConnected()) {
        console.log('Cleaning up previous stem WebSocket connection');
        window.stemWebSocketAudioStream.disconnect();
        window.stemWebSocketAudioStream = null;
    }
    
    if (window.webSocketAudioStream && window.webSocketAudioStream.isConnected()) {
        console.log('Cleaning up previous WebSocket connection');
        window.webSocketAudioStream.disconnect();
        window.webSocketAudioStream = null;
    }
    
    // Clear session IDs
    window.stemStreamingSessionId = null;
    window.streamingSessionId = null;
    
    // Clear previous preset download data to prevent state pollution
    if (processSingleStatus) {
        delete processSingleStatus.dataset.vocalPresetPath;
        delete processSingleStatus.dataset.instrumentalPresetPath;
        delete processSingleStatus.dataset.vocalPresetFilename;
        delete processSingleStatus.dataset.instrumentalPresetFilename;
        delete processSingleStatus.dataset.createdPresetPath;
        delete processSingleStatus.dataset.createdPresetFilename;
    }
    
    // Remove any existing preset download section
    const existingPresetSection = document.getElementById('preset-download-section');
    if (existingPresetSection) {
        existingPresetSection.remove();
    }
    
    // Stop any active audio playback
    if (window.stopAudio) {
        window.stopAudio();
    }
    
    // Reset processing state to ensure no deadlocks
    setProcessingState(false);
    
    // Hide any results from previous processing
    if (singleConversionResults) {
        singleConversionResults.style.display = 'none';
    }
    
    // Clear all secondary file inputs when target changes to prevent mode confusion
    const referenceFileInput = document.getElementById('reference-file-single');
    const presetFileInput = document.getElementById('preset-file-single');
    const vocalPresetInput = document.getElementById('vocal-preset-file-single');
    const instrumentalPresetInput = document.getElementById('instrumental-preset-file-single');
    
    if (referenceFileInput) referenceFileInput.value = '';
    if (presetFileInput) presetFileInput.value = '';
    if (vocalPresetInput) vocalPresetInput.value = '';
    if (instrumentalPresetInput) instrumentalPresetInput.value = '';
    
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

// Handle stem separation mode change with cleanup
window.handleStemSeparationChange = () => {
    console.log('Stem separation mode changed');
    
    // Only update UI visibility, don't clear active processing
    // This allows users to switch between stem/non-stem modes without losing their session
    
    // Update the reference input display (show/hide appropriate preset inputs)
    window.toggleReferenceInput();
    
    // Update process button visibility
    window.checkProcessButtonVisibility();
    
    // Note: We intentionally DON'T clear:
    // - Active audio sessions (streamingSessionId, webSocketAudioStream)
    // - Processing results (single-conversion-results)  
    // - File paths (originalFilePath, processedFilePath)
    // - Audio playback state
    // - Waveform displays
    // - Knob control values
    // This allows seamless switching between processing modes without interrupting active sessions
};

// Poll for stem processing progress and handle completion
async function pollStemProcessingProgress(jobId, statusDiv) {
    const maxAttempts = 300; // 5 minutes max (300 * 1000ms)
    let attempts = 0;
    
    const poll = async () => {
        try {
            attempts++;
            const response = await fetch(`/api/progress/${jobId}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const progress = await response.json();
            console.log('Stem processing progress:', progress);
            
            // Update status display
            statusDiv.innerHTML = `
                <div class="alert alert-info">
                    <div class="d-flex justify-content-between align-items-center">
                        <span>${progress.message}</span>
                        <span class="badge bg-primary">${progress.progress}%</span>
                    </div>
                    <div class="progress mt-2">
                        <div class="progress-bar" style="width: ${progress.progress}%"></div>
                    </div>
                </div>
            `;
            
            if (progress.stage === 'complete') {
                // Processing completed successfully
                statusDiv.innerHTML = '<div class="alert alert-success">Stem processing completed successfully!</div>';
                
                // Handle stem processing completion
                handleStemProcessingComplete(progress);
                
            } else if (progress.stage === 'error') {
                // Processing failed
                statusDiv.innerHTML = `<div class="alert alert-danger">Stem processing failed: ${progress.message}</div>`;
                setProcessingState(false);
                
            } else if (attempts < maxAttempts) {
                // Continue polling
                setTimeout(poll, 1000);
            } else {
                // Timeout
                statusDiv.innerHTML = '<div class="alert alert-warning">Processing timeout. Please check server status.</div>';
                setProcessingState(false);
            }
            
        } catch (error) {
            console.error('Error polling stem progress:', error);
            if (attempts < maxAttempts) {
                setTimeout(poll, 2000); // Retry with longer delay
            } else {
                statusDiv.innerHTML = '<div class="alert alert-danger">Failed to get processing status</div>';
                setProcessingState(false);
            }
        }
    };
    
    // Start polling
    poll();
}

// Handle stem processing completion
async function handleStemProcessingComplete(progressData) {
    console.log('Stem processing complete:', progressData);
    
    // Store stem file paths
    if (typeof window !== 'undefined') {
        window.targetVocalPath = progressData.target_vocal_path;
        window.targetInstrumentalPath = progressData.target_instrumental_path;
        window.processedVocalPath = progressData.processed_vocal_path;
        window.processedInstrumentalPath = progressData.processed_instrumental_path;
        window.vocalPresetPath = progressData.vocal_preset_path;
        window.instrumentalPresetPath = progressData.instrumental_preset_path;
        window.vocalPresetFilename = progressData.vocal_preset_filename;
        window.instrumentalPresetFilename = progressData.instrumental_preset_filename;
    }
    
    // Show results section
    const resultsDiv = document.getElementById('single-conversion-results');
    if (resultsDiv) {
        resultsDiv.style.display = 'block';
        
        // Show stem mode channels (hide standard channel)
        const standardChannel = document.getElementById('standard-channel');
        const vocalChannel = document.getElementById('vocal-channel');
        const instrumentalChannel = document.getElementById('instrumental-channel');
        
        if (standardChannel) standardChannel.style.display = 'none';
        if (vocalChannel) vocalChannel.style.display = 'block';
        if (instrumentalChannel) instrumentalChannel.style.display = 'block';
        
        // Initialize stem waveforms
        initializeStemWaveforms();
        
        // Initialize dual knob controls for stem mode
        if (window.initializeDualKnobs) {
            console.log('Initializing dual knob controls for stem mode');
            window.initializeDualKnobs();
        }
        
        // Set preset data for download links (if presets were created from reference audio)
        const processSingleStatus = document.getElementById('process-single-status');
        if (processSingleStatus && progressData.vocal_preset_path && progressData.instrumental_preset_path) {
            processSingleStatus.dataset.vocalPresetPath = progressData.vocal_preset_path;
            processSingleStatus.dataset.instrumentalPresetPath = progressData.instrumental_preset_path;
            processSingleStatus.dataset.vocalPresetFilename = progressData.vocal_preset_filename;
            processSingleStatus.dataset.instrumentalPresetFilename = progressData.instrumental_preset_filename;
            
            // Show preset download links
            if (window.showPresetDownloadLinks) {
                window.showPresetDownloadLinks();
            }
        }
        
        // Stem streaming session will be created lazily on first play button press
    }
    
    setProcessingState(false);
}

// Initialize stem waveforms display
function initializeStemWaveforms() {
    console.log('Initializing stem waveforms');
    
    // Set up dummy waveforms while loading
    const vocalWaveformImage = document.getElementById('vocal-combined-waveform-image');
    const instrumentalWaveformImage = document.getElementById('instrumental-combined-waveform-image');
    
    if (vocalWaveformImage) {
        vocalWaveformImage.src = '/api/waveform/dummy?' + new Date().getTime();
        vocalWaveformImage.alt = 'Loading vocal waveform...';
    }
    
    if (instrumentalWaveformImage) {
        instrumentalWaveformImage.src = '/api/waveform/dummy?' + new Date().getTime();
        instrumentalWaveformImage.alt = 'Loading instrumental waveform...';
    }
    
    // Generate actual waveforms using the existing endpoints
    if (window.targetVocalPath && window.processedVocalPath) {
        generateStemWaveform('vocal', window.targetVocalPath, window.processedVocalPath);
    }
    
    if (window.targetInstrumentalPath && window.processedInstrumentalPath) {
        generateStemWaveform('instrumental', window.targetInstrumentalPath, window.processedInstrumentalPath);
    }
}

// Generate waveform for a specific stem
async function generateStemWaveform(stemType, originalPath, processedPath) {
    try {
        console.log(`Generating ${stemType} waveform`, { originalPath, processedPath });
        
        const formData = new FormData();
        formData.append('original_path', originalPath);
        formData.append('processed_path', processedPath);
        
        const response = await fetch('/api/waveform/generate', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const imageBlob = await response.blob();
            const imageUrl = URL.createObjectURL(imageBlob);
            
            const waveformImage = document.getElementById(`${stemType}-combined-waveform-image`);
            if (waveformImage) {
                waveformImage.src = imageUrl;
                waveformImage.alt = `${stemType.charAt(0).toUpperCase() + stemType.slice(1)} waveform`;
                
                // Add click-to-seek functionality
                waveformImage.style.cursor = 'pointer';
                waveformImage.onclick = (event) => handleStemWaveformClick(event, stemType);
            }
        } else {
            console.error(`Failed to generate ${stemType} waveform:`, response.status);
        }
    } catch (error) {
        console.error(`Error generating ${stemType} waveform:`, error);
    }
}

// Handle waveform click for seeking in stem mode
function handleStemWaveformClick(event, stemType) {
    if (!window.stemWebSocketAudioStream || !window.stemWebSocketAudioStream.isConnected()) {
        console.warn('Cannot seek: Stem WebSocket audio not connected');
        return;
    }
    
    const rect = event.target.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const position = clickX / rect.width; // 0.0 to 1.0
    
    console.log(`Seeking ${stemType} to position:`, position);
    window.stemWebSocketAudioStream.seek(position);
}

// Create streaming session for stem mode
async function createStemStreamingSession() {
    try {
        console.log('Creating stem streaming session');
        console.log('Stem paths:', {
            vocal: window.targetVocalPath,
            instrumental: window.targetInstrumentalPath,
            processedVocal: window.processedVocalPath,
            processedInstrumental: window.processedInstrumentalPath
        });
        
        // Validate that all paths are available
        if (!window.targetVocalPath || !window.targetInstrumentalPath || 
            !window.processedVocalPath || !window.processedInstrumentalPath) {
            console.error('Missing required stem paths for session creation');
            return false;
        }
        
        const formData = new FormData();
        formData.append('target_vocal_path', window.targetVocalPath);
        formData.append('target_instrumental_path', window.targetInstrumentalPath);
        formData.append('processed_vocal_path', window.processedVocalPath);
        formData.append('processed_instrumental_path', window.processedInstrumentalPath);
        
        const response = await fetch('/api/create_stem_session', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            window.stemStreamingSessionId = result.session_id;
            console.log('Stem streaming session created:', result.session_id);
            return true;
        } else {
            console.error('Failed to create stem streaming session:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error creating stem streaming session:', error);
        return false;
    }
}

// Initialize stem audio playback
async function initializeStemAudioPlayback() {
    console.log('Initializing stem audio playback');
    console.log('Current window.stemStreamingSessionId:', window.stemStreamingSessionId);
    console.log('Type of session ID:', typeof window.stemStreamingSessionId);
    
    if (!window.stemStreamingSessionId) {
        console.error('Cannot initialize stem audio: no session ID');
        console.error('All window properties with "session":', Object.keys(window).filter(key => key.toLowerCase().includes('session')));
        return;
    }
    
    try {
        // Initialize WebSocket audio stream for stems
        console.log('Looking for WebSocketAudioStream...', typeof window.WebSocketAudioStream);
        const WebSocketAudioStream = window.WebSocketAudioStream;
        if (!WebSocketAudioStream) {
            console.error('WebSocketAudioStream not available on window object');
            console.log('Available window properties:', Object.keys(window).filter(key => key.includes('WebSocket') || key.includes('Audio')));
            return;
        }
        
        console.log('Creating WebSocketAudioStream with session:', window.stemStreamingSessionId);
        window.stemWebSocketAudioStream = new WebSocketAudioStream(window.stemStreamingSessionId);
        
        // Set up position tracking for stems
        window.stemWebSocketAudioStream.onPositionUpdate = (position) => {
            updateStemPlaybackPosition(position);
        };
        
        // Set up playback state changes for stems
        window.stemWebSocketAudioStream.onPlaybackStateChange = (playing, position) => {
            window.updatePlaybackButtons(playing ? 'play' : 'pause');
            if (position !== undefined) {
                updateStemPlaybackPosition(position);
            }
        };
        
        // Set up error handling for stems
        window.stemWebSocketAudioStream.onError = (error) => {
            console.error('Stem WebSocket audio error:', error);
        };
        
        // Connect to WebSocket
        console.log('Attempting to connect stem WebSocket...');
        await window.stemWebSocketAudioStream.connect();
        console.log('Stem WebSocket audio stream connected successfully');
        
        // Initialize stem parameter sending
        window.sendStemParametersToBackendWS = () => {
            if (!window.stemWebSocketAudioStream || !window.stemWebSocketAudioStream.isConnected()) {
                return;
            }
            
            const params = {
                vocal_blend_ratio: (window.currentVocalBlend || 50) / 100.0,
                instrumental_blend_ratio: (window.currentInstrumentalBlend || 50) / 100.0,
                vocal_gain_db: window.currentVocalGain || 0.0,
                instrumental_gain_db: window.currentInstrumentalGain || 0.0,
                master_gain_db: window.currentMasterGain || 0.0,
                vocal_muted: window.vocalMuted || false,
                instrumental_muted: window.instrumentalMuted || false,
                limiter_enabled: window.limiterEnabled !== undefined ? window.limiterEnabled : true
            };
            
            window.stemWebSocketAudioStream.updateParameters(params);
        };
        
    } catch (error) {
        console.error('Error initializing stem audio playback:', error);
    }
}

// Update stem playback position indicators
function updateStemPlaybackPosition(position) {
    // Update position indicators on vocal waveform
    const vocalWaveformImage = document.getElementById('vocal-combined-waveform-image');
    if (vocalWaveformImage) {
        updateWaveformPosition(vocalWaveformImage, position);
    }
    
    // Update position indicators on instrumental waveform
    const instrumentalWaveformImage = document.getElementById('instrumental-combined-waveform-image');
    if (instrumentalWaveformImage) {
        updateWaveformPosition(instrumentalWaveformImage, position);
    }
}

// Helper function to update waveform position indicator
function updateWaveformPosition(waveformImage, position) {
    // Remove existing position indicator
    const existingIndicator = waveformImage.parentElement.querySelector('.playback-line');
    if (existingIndicator) {
        existingIndicator.remove();
    }
    
    // Create new position indicator
    const indicator = document.createElement('div');
    indicator.className = 'playback-line';
    indicator.style.left = `${position * 100}%`;
    
    // Add to waveform container
    const container = waveformImage.parentElement;
    if (container) {
        container.style.position = 'relative';
        container.appendChild(indicator);
    }
}

// Handle save stem blend functionality
window.handleSaveStemBlend = async () => {
    if (!window.targetVocalPath || !window.targetInstrumentalPath || 
        !window.processedVocalPath || !window.processedInstrumentalPath) {
        alert('No processed stem audio available to save.');
        return;
    }
    
    const statusDiv = document.getElementById('save-blend-status') || document.getElementById('process-single-status');
    
    try {
        statusDiv.innerHTML = '<div class="alert alert-info">Saving stem blend...</div>';
        
        // Extract original filename
        let originalFilename = null;
        if (window.targetVocalPath) {
            originalFilename = window.targetVocalPath.split('/').pop().replace('_(Vocals)_', '_').replace('.wav', '.wav');
        }
        
        const formData = new FormData();
        formData.append('target_vocal_path', window.targetVocalPath);
        formData.append('target_instrumental_path', window.targetInstrumentalPath);
        formData.append('processed_vocal_path', window.processedVocalPath);
        formData.append('processed_instrumental_path', window.processedInstrumentalPath);
        formData.append('vocal_blend_ratio', (window.currentVocalBlend || 50) / 100.0);
        formData.append('instrumental_blend_ratio', (window.currentInstrumentalBlend || 50) / 100.0);
        formData.append('vocal_gain_db', window.currentVocalGain || 0.0);
        formData.append('instrumental_gain_db', window.currentInstrumentalGain || 0.0);
        formData.append('master_gain_db', window.currentMasterGain || 0.0);
        formData.append('vocal_muted', window.vocalMuted || false);
        formData.append('instrumental_muted', window.instrumentalMuted || false);
        formData.append('apply_limiter', window.limiterEnabled !== undefined ? window.limiterEnabled : true);
        
        if (originalFilename) {
            formData.append('original_filename', originalFilename);
        }
        // Debug: Log preset filenames to understand the issue
        console.log('Vocal preset filename:', window.vocalPresetFilename);
        console.log('Instrumental preset filename:', window.instrumentalPresetFilename);
        
        if (window.vocalPresetFilename) {
            formData.append('vocal_preset_filename', window.vocalPresetFilename);
        }
        if (window.instrumentalPresetFilename) {
            formData.append('instrumental_preset_filename', window.instrumentalPresetFilename);
        }
        
        const response = await fetch('/api/save_stem_blend', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            if (result.blended_file_path) {
                // Extract filename from path for download URL
                const filename = result.blended_file_path.split('/').pop();
                console.log('Stem blend save result:', result);
                console.log('Extracted filename:', filename);
                statusDiv.innerHTML = `
                    <div class="alert alert-success">
                        Stem blend saved successfully! 
                        <a href="/download/output/${filename}" target="_blank" class="btn btn-sm btn-outline-success ms-2">Download</a>
                    </div>
                `;
            } else {
                console.warn('No blended_file_path in response:', result);
                statusDiv.innerHTML = '<div class="alert alert-success">Stem blend saved successfully!</div>';
            }
        } else {
            const error = await response.json();
            statusDiv.innerHTML = `<div class="alert alert-danger">Error saving stem blend: ${error.detail || 'Save failed'}</div>`;
        }
    } catch (error) {
        console.error('Error saving stem blend:', error);
        statusDiv.innerHTML = '<div class="alert alert-danger">Error: Failed to save stem blend</div>';
    }
};

// Export stem functions to window for lazy initialization
window.createStemStreamingSession = createStemStreamingSession;
window.initializeStemAudioPlayback = initializeStemAudioPlayback;


    

