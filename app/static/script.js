document.addEventListener('DOMContentLoaded', () => {
    // Helper function to display status messages
    function showStatus(element, message, isError = false) {
        console.log('showStatus called:', message);
        element.innerHTML = message;
        element.className = `mt-3 alert ${isError ? 'alert-danger' : 'alert-success'}`;
    }

    // --- Create Preset Section ---
    const createPresetForm = document.getElementById('create-preset-form');
    const createPresetStatus = document.getElementById('create-preset-status');
    const createPresetDownloadDiv = document.getElementById('create-preset-download');
    const presetDownloadLinkContainer = document.getElementById('preset-download-link-container');

    let generatedPresetPath = '';
    let suggestedPresetFilename = ''; // New variable to store suggested filename

    createPresetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevent submission during active processing
        if (isProcessing) {
            showStatus(createPresetStatus, 'Please wait for current processing to complete.', true);
            return;
        }
        
        showStatus(createPresetStatus, 'Creating preset...');
        createPresetDownloadDiv.style.display = 'none';
        presetDownloadLinkContainer.innerHTML = ''; // Clear previous link

        const referenceFile = document.getElementById('reference-file-preset').files[0];

        const formData = new FormData();
        formData.append('reference_file', referenceFile);

        try {
            const response = await fetch('/api/create_preset', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(createPresetStatus, `Preset created.`);
                generatedPresetPath = data.preset_path;
                suggestedPresetFilename = data.suggested_filename; // Store suggested filename

                // Generate and display the download link
                const link = document.createElement('a');
                link.href = `/download/preset/${generatedPresetPath.split('/').pop()}?download_name=${encodeURIComponent(suggestedPresetFilename)}`;
                link.download = suggestedPresetFilename; // Suggest filename for download
                link.textContent = suggestedPresetFilename; // Only filename as link text
                link.className = 'alert-link'; // Apply Bootstrap link styling
                
                const instructionText = document.createTextNode(' (Right Click to Save As)');

                presetDownloadLinkContainer.appendChild(link);
                presetDownloadLinkContainer.appendChild(instructionText);
                createPresetDownloadDiv.style.display = 'block';

            } else {
                showStatus(createPresetStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(createPresetStatus, `Network error: ${error.message}`, true);
        }
    });


    // --- Single File Conversion Section ---
    const processSingleForm = document.getElementById('process-single-form');
    const processSingleStatus = document.getElementById('process-single-status');
    const singleConversionResults = document.getElementById('single-conversion-results');
    const targetFileSingle = document.getElementById('target-file-single');
    const referenceTypeSelection = document.getElementById('reference-type-selection');
    const radioReference = document.getElementById('radioReference');
    const radioPreset = document.getElementById('radioPreset');
    const referenceFileSingleDiv = document.getElementById('reference-file-single-div');
    const referenceFileSingle = document.getElementById('reference-file-single');
    const presetFileSingleDiv = document.getElementById('preset-file-single-div');
    const presetFileSingle = document.getElementById('preset-file-single');
    const blendKnobCanvas = document.getElementById('blend-knob');
    const blendedPlayer = document.getElementById('blended-player');
    const saveBlendButton = document.getElementById('save-blend-button');
    const saveBlendStatus = document.getElementById('save-blend-status');
    const limiterButton = document.getElementById('limiterButton');
    const batchLimiterButton = document.getElementById('batchLimiterButton');
    let limiterEnabled = true; // Default to enabled
    let batchLimiterEnabled = true; // Default to enabled

    const playButton = document.getElementById('play-button');
    const pauseButton = document.getElementById('pause-button');
    const stopButton = document.getElementById('stop-button');

    const processFileButton = document.getElementById('process-file-button'); // New: Get process button
    const useStemSeparation = document.getElementById('use-stem-separation');
    const vocalPresetFileSingleDiv = document.getElementById('vocal-preset-file-single-div');
    const instrumentalPresetFileSingleDiv = document.getElementById('instrumental-preset-file-single-div');

    // Audio context variables removed - replaced with simple HTML5 audio
    let playbackTime = 0;
    let startTime = 0;
    let isPlaying = false;
    let animationFrameId; // For play position indicator
    let currentBlendValue = 50; // Current blend value (0-100)
    let isDragging = false;
    let dragStartY = 0;
    let dragStartValue = 0;
    let isUpdatingPreview = false; // Prevent multiple simultaneous preview updates
    let isProcessing = false; // Global processing state to prevent double submissions and tab switching
    
    // New modular approach variables
    let originalFilePath = null; // Path to original audio file
    let processedFilePath = null; // Path to processed audio file
    let currentPreviewPath = null; // Path to current preview audio
    let previewAudioElement = null; // Audio element for playback

    // Processing state management functions
    function setProcessingState(processing) {
        isProcessing = processing;
        
        // Disable/enable process button
        processFileButton.disabled = processing;
        processFileButton.textContent = processing ? 'Processing...' : 'Process File';
        
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
        const isStemSeparation = useStemSeparation.checked;
        const isVocalPresetSelected = document.getElementById('vocal-preset-file-single').files.length > 0;
        const isInstrumentalPresetSelected = document.getElementById('instrumental-preset-file-single').files.length > 0;
        const isTargetFileSelected = targetFileSingle.files.length > 0;
        let isRequiredFilesSelected = false;

        if (radioReference.checked) {
            // Reference mode: always just need reference file (stem separation happens on backend)
            isRequiredFilesSelected = referenceFileSingle.files.length > 0;
        } else if (radioPreset.checked) {
            if (isStemSeparation) {
                // Preset mode with stem separation: need both vocal and instrumental presets
                isRequiredFilesSelected = isVocalPresetSelected && isInstrumentalPresetSelected;
            } else {
                // Standard preset mode: need single preset file
                isRequiredFilesSelected = presetFileSingle.files.length > 0;
            }
        }

        if (isTargetFileSelected && isRequiredFilesSelected) {
            processFileButton.style.display = 'block';
        } else {
            processFileButton.style.display = 'none';
        }
    }

    // Step-by-step display logic for Single File Conversion
    targetFileSingle.addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        if (targetFileSingle.files.length > 0) {
            // Show stem separation option first
            document.getElementById('stem-separation-selection').style.display = 'block';
            referenceTypeSelection.style.display = 'block';
            // Reset radio buttons and hide file inputs when a new target file is selected
            radioReference.checked = false;
            radioPreset.checked = false;
            referenceFileSingleDiv.style.display = 'none';
            presetFileSingleDiv.style.display = 'none';
            vocalPresetFileSingleDiv.style.display = 'none';
            instrumentalPresetFileSingleDiv.style.display = 'none';
        } else {
            document.getElementById('stem-separation-selection').style.display = 'none';
            referenceTypeSelection.style.display = 'none';
            referenceFileSingleDiv.style.display = 'none';
            presetFileSingleDiv.style.display = 'none';
            vocalPresetFileSingleDiv.style.display = 'none';
            instrumentalPresetFileSingleDiv.style.display = 'none';
        }
        checkProcessButtonVisibility(); // Check visibility after target file changes
        // Hide results section if target file changes
        singleConversionResults.style.display = 'none';
    });

    // Toggle reference/preset file input for single conversion
    function toggleReferenceInput() {
        processSingleStatus.textContent = ''; // Clear status
        
        const isStemSeparation = useStemSeparation.checked;
        
        if (radioReference.checked) {
            // Reference mode
            if (isStemSeparation) {
                // Stem separation with reference: show reference file input only
                referenceFileSingleDiv.style.display = 'block';
                referenceFileSingle.setAttribute('required', 'true');
                presetFileSingleDiv.style.display = 'none';
                presetFileSingle.removeAttribute('required');
                vocalPresetFileSingleDiv.style.display = 'none';
                instrumentalPresetFileSingleDiv.style.display = 'none';
            } else {
                // Standard reference mode
                referenceFileSingleDiv.style.display = 'block';
                referenceFileSingle.setAttribute('required', 'true');
                presetFileSingleDiv.style.display = 'none';
                presetFileSingle.removeAttribute('required');
                vocalPresetFileSingleDiv.style.display = 'none';
                instrumentalPresetFileSingleDiv.style.display = 'none';
            }
        } else if (radioPreset.checked) {
            // Preset mode
            if (isStemSeparation) {
                // Stem separation with presets: show vocal and instrumental preset inputs
                referenceFileSingleDiv.style.display = 'none';
                referenceFileSingle.removeAttribute('required');
                presetFileSingleDiv.style.display = 'none';
                presetFileSingle.removeAttribute('required');
                vocalPresetFileSingleDiv.style.display = 'block';
                instrumentalPresetFileSingleDiv.style.display = 'block';
            } else {
                // Standard preset mode
                referenceFileSingleDiv.style.display = 'none';
                referenceFileSingle.removeAttribute('required');
                presetFileSingleDiv.style.display = 'block';
                presetFileSingle.setAttribute('required', 'true');
                vocalPresetFileSingleDiv.style.display = 'none';
                instrumentalPresetFileSingleDiv.style.display = 'none';
            }
        }
        
        checkProcessButtonVisibility(); // Check visibility after mode changes
        // Hide results section if mode changes
        singleConversionResults.style.display = 'none';
    }
    radioReference.addEventListener('change', toggleReferenceInput);
    radioPreset.addEventListener('change', toggleReferenceInput);
    // Initial call to set state if a file is already selected on page load (unlikely but good practice)
    if (targetFileSingle.files.length > 0) {
        toggleReferenceInput();
    }

    // Add event listeners to reference/preset file inputs to check button visibility
    referenceFileSingle.addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        checkProcessButtonVisibility();
        singleConversionResults.style.display = 'none'; // Hide results if reference file changes
    });
    presetFileSingle.addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        checkProcessButtonVisibility();
        singleConversionResults.style.display = 'none'; // Hide results if preset file changes
    });
    
    // Event listeners for vocal and instrumental preset files (stem separation mode)
    document.getElementById('vocal-preset-file-single').addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        checkProcessButtonVisibility();
        singleConversionResults.style.display = 'none'; // Hide results if vocal preset file changes
    });
    
    document.getElementById('instrumental-preset-file-single').addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        checkProcessButtonVisibility();
        singleConversionResults.style.display = 'none'; // Hide results if instrumental preset file changes
    });

    // Stem separation event listener
    useStemSeparation.addEventListener('change', () => {
        // When stem separation checkbox changes, update the UI based on current mode
        if (radioReference.checked || radioPreset.checked) {
            toggleReferenceInput(); // This will handle the display logic based on current mode and stem separation state
        }
        checkProcessButtonVisibility();
    });

    // Initial check on page load
    checkProcessButtonVisibility();

    // System info and progress tracking functions
    async function showProcessingStatus() {
        try {
            const response = await fetch('/api/system_info');
            const systemInfo = await response.json();
            
            // Just return the system info, don't overwrite status
            return systemInfo;
        } catch (error) {
            console.error('Error getting system info:', error);
            return null;
        }
    }

    async function pollProgress(jobId) {
        const pollProgressData = async () => {
            try {
                const response = await fetch(`/api/progress/${jobId}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const progress = await response.json();
                
                // Update the existing status box with progress
                showStatus(processSingleStatus, progress.message);
                
                if (progress.stage === 'complete') {
                    clearInterval(pollInterval);
                    showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                    
                    // Store individual stem paths for waveform display and real-time mixing
                    if (progress.target_vocal_path) {
                        processSingleStatus.dataset.targetVocalPath = progress.target_vocal_path;
                        processSingleStatus.dataset.targetInstrumentalPath = progress.target_instrumental_path;
                        processSingleStatus.dataset.processedVocalPath = progress.processed_vocal_path;
                        processSingleStatus.dataset.processedInstrumentalPath = progress.processed_instrumental_path;
                        
                        // Store preset information for download links
                        if (progress.vocal_preset_path) {
                            processSingleStatus.dataset.vocalPresetPath = progress.vocal_preset_path;
                            processSingleStatus.dataset.instrumentalPresetPath = progress.instrumental_preset_path;
                            processSingleStatus.dataset.vocalPresetFilename = progress.vocal_preset_filename;
                            processSingleStatus.dataset.instrumentalPresetFilename = progress.instrumental_preset_filename;
                        }
                    }
                    
                    // Show results and initialize waveforms
                    singleConversionResults.style.display = 'block';
                    
                    // Stem channels are already visible from the previous logic
                    
                    initializeStemWaveforms();
                    
                    // Show preset download links if available
                    showPresetDownloadLinks();
                    
                    // Clear processing state when complete
                    setProcessingState(false);
                    
                } else if (progress.stage === 'error') {
                    clearInterval(pollInterval);
                    showStatus(processSingleStatus, progress.message, true);
                    
                    // Clear processing state on error
                    setProcessingState(false);
                }
            } catch (error) {
                console.error('Error polling progress:', error);
                clearInterval(pollInterval);
                showStatus(processSingleStatus, 'Error polling progress', true);
                
                // Clear processing state on polling error
                setProcessingState(false);
            }
        };
        
        // Poll immediately, then every second
        pollProgressData();
        const pollInterval = setInterval(pollProgressData, 1000);
        
        return pollInterval;
    }

    function hideProcessingStatus() {
        processSingleStatus.textContent = '';
        processSingleStatus.className = '';
    }

    // Process Single File Form Submission
    processSingleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Prevent double submission
        if (isProcessing) {
            console.log('Already processing, ignoring duplicate submission');
            return;
        }
        
        // Check if frame processing is available and should be used
        const useFrameProcessing = window.frameProcessing && window.frameProcessing.isAvailable();
        
        if (useFrameProcessing) {
            // Dispatch custom event for frame processing
            const customEvent = new CustomEvent('processButtonClick', {
                detail: { originalEvent: e }
            });
            document.dispatchEvent(customEvent);
            
            // If frame processing handles it, return early
            if (customEvent.defaultPrevented) {
                return;
            }
        }
        
        // Set processing state
        setProcessingState(true);
        
        // Get system info and show initial processing status
        const systemInfo = await showProcessingStatus();
        showStatus(processSingleStatus, 'Processing single file...');
        console.log('Form submitted, showing initial status');
        
        singleConversionResults.style.display = 'none';
        saveBlendStatus.textContent = '';

        const formData = new FormData();
        const targetFile = document.getElementById('target-file-single').files[0];
        formData.append('target_file', targetFile);
        formData.append('use_stem_separation', useStemSeparation.checked);
        
        // Only add vocal and instrumental preset files if we're in preset mode with stem separation
        if (useStemSeparation.checked && radioPreset.checked) {
            formData.append('vocal_preset_file', document.getElementById('vocal-preset-file-single').files[0]);
            formData.append('instrumental_preset_file', document.getElementById('instrumental-preset-file-single').files[0]);
        }

        let referenceName = '';
        if (radioReference.checked) {
            const refFile = referenceFileSingle.files[0];
            formData.append('reference_file', refFile);
            referenceName = refFile.name.split('.').slice(0, -1).join('.').substring(0, 8); // Cap at 8 chars
        }
        else if (radioPreset.checked) {
            if (useStemSeparation.checked) {
                // For stem separation with presets, we already added vocal/instrumental preset files above
                // Use vocal preset name for reference naming
                const vocalPresetFile = document.getElementById('vocal-preset-file-single').files[0];
                referenceName = vocalPresetFile ? vocalPresetFile.name.split('.').slice(0, -1).join('.').substring(0, 8) : 'preset';
            } else {
                // Standard preset mode
                const presetFile = presetFileSingle.files[0];
                formData.append('preset_file', presetFile);
                referenceName = presetFile.name.split('.').slice(0, -1).join('.').substring(0, 8); // Cap at 8 chars
            }
        }

        // Store original filename and reference name for blended output filename
        processSingleStatus.dataset.originalFileName = targetFile.name.split('.').slice(0, -1).join('.');
        processSingleStatus.dataset.referenceName = referenceName;

        try {
            // Start the request
            const response = await fetch('/api/process_single', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            
            if (response.ok) {
                // Store stem separation mode and original filename (without extension)
                processSingleStatus.dataset.isStemSeparation = useStemSeparation.checked;
                const targetFileName = targetFile.name;  // Use the targetFile variable, not formData
                processSingleStatus.dataset.originalFileName = targetFileName.split('.').slice(0, -1).join('.');
                
                console.log('Response data:', data);
                console.log('Is stem separation:', useStemSeparation.checked);
                console.log('Has job_id:', !!data.job_id);
                
                if (useStemSeparation.checked) {
                    // For stem separation, start progress polling if we have a job_id
                    if (data.job_id) {
                        console.log('Starting progress polling for job_id:', data.job_id);
                        // Show stem channels and hide standard channel
                        document.getElementById('standard-channel').style.display = 'none';
                        document.getElementById('vocal-channel').style.display = 'block';
                        document.getElementById('instrumental-channel').style.display = 'block';
                        
                        // Start polling for progress (this will update the status immediately)
                        // Note: processing state will be cleared by pollProgress when complete/error
                        pollProgress(data.job_id);
                        
                        // Return early to avoid clearing processing state in finally block
                        return;
                    } else {
                        // Fallback for synchronous processing
                        showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                        
                        // Show stem channels and hide standard channel
                        document.getElementById('standard-channel').style.display = 'none';
                        document.getElementById('vocal-channel').style.display = 'block';
                        document.getElementById('instrumental-channel').style.display = 'block';
                        
                        // Store stem-specific paths
                        processSingleStatus.dataset.combinedFilePath = data.combined_file_path;
                        
                        // Initialize stem waveform display
                        initializeStemWaveforms();
                        
                        // Show results section
                        singleConversionResults.style.display = 'block';
                    }
                } else {
                    // For standard processing, show completion immediately
                    showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                    
                    // Show standard channel and hide stem channels
                    document.getElementById('standard-channel').style.display = 'block';
                    document.getElementById('vocal-channel').style.display = 'none';
                    document.getElementById('instrumental-channel').style.display = 'none';
                    
                    // Store standard paths
                    processSingleStatus.dataset.originalFilePath = data.original_file_path;
                    processSingleStatus.dataset.processedFilePath = data.processed_file_path;
                    
                    // Initialize new modular system with file paths
                    originalFilePath = data.original_file_path;
                    processedFilePath = data.processed_file_path;
                    
                    // Clear waveform cache since we have new processed audio files
                    clearWaveformCache();
                    
                    // Store preset information if created from reference
                    if (data.created_preset_path) {
                        processSingleStatus.dataset.createdPresetPath = data.created_preset_path;
                        processSingleStatus.dataset.createdPresetFilename = data.created_preset_filename;
                    }
                    
                    // Initialize knob controls and waveform display
                    initializeKnob();
                    
                    // Initialize JIT processing with the processed audio files
                    initializeJITProcessing(data.original_file_path, data.processed_file_path);
                    
                    // Draw simplified waveform display after a brief delay to ensure visibility
                    setTimeout(() => {
                        const combinedWaveform = document.getElementById('combined-waveform');
                        if (combinedWaveform) {
                            console.log('Initializing waveform display for standard channel');
                            drawCombinedWaveform(combinedWaveform, null, null, '#007bff', '#28a745');
                            
                            // Add click listener for seeking
                            combinedWaveform.addEventListener('click', seekAudio);
                        } else {
                            console.error('Combined waveform canvas not found');
                        }
                    }, 100);
                    
                    // Initialize with initial blend preview (50% blend)
                    generateBlendPreview();
                    
                    // Show results section
                    singleConversionResults.style.display = 'block';
                    
                    // Show preset download links if available
                    showPresetDownloadLinks();
                }
            } else {
                showStatus(processSingleStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processSingleStatus, `Network error: ${error.message}`, true);
        } finally {
            // Always clear processing state when done (success, error, or completion)
            setProcessingState(false);
        }
    });


    function playAudio() {
        // Try JIT processing first
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            window.jitPlayback.play();
            isPlaying = true;
            updatePlaybackButtons('play');
            updatePlayPosition(); // Start position tracking
            return;
        }
        
        // Fallback to traditional audio element
        if (!previewAudioElement || !currentPreviewPath) return;
        
        previewAudioElement.play();
        isPlaying = true;
        updatePlaybackButtons('play');
        updatePlayPosition();
    }

    function pauseAudio() {
        // Try JIT processing first
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            window.jitPlayback.pause();
            isPlaying = false;
            updatePlaybackButtons('pause');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            return;
        }
        
        // Fallback to traditional audio element
        if (!previewAudioElement) return;
        
        previewAudioElement.pause();
        isPlaying = false;
        updatePlaybackButtons('pause');
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    }

    function stopAudio() {
        // Try JIT processing first
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            window.jitPlayback.stop();
            isPlaying = false;
            updatePlaybackButtons('stop');
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
            drawPlayPosition(0);
            return;
        }
        
        // Fallback to traditional audio element
        if (!previewAudioElement) return;
        
        previewAudioElement.pause();
        previewAudioElement.currentTime = 0;
        isPlaying = false;
        updatePlaybackButtons('stop');
        
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        
        drawPlayPosition(0);
    }

    function updatePlaybackButtons(activeButtonId) {
        document.querySelectorAll('.playback-button').forEach(button => {
            button.classList.remove('playback-active');
        });
        document.getElementById(`${activeButtonId}-button`).classList.add('playback-active');
    }

    playButton.addEventListener('click', playAudio);
    pauseButton.addEventListener('click', pauseAudio);
    stopButton.addEventListener('click', stopAudio);

    // Set initial state for playback buttons
    updatePlaybackButtons('stop');

    function initializeKnob() {
        // Set up canvas
        const canvas = blendKnobCanvas;
        const ctx = canvas.getContext('2d');
        
        // Set canvas size to match HTML
        canvas.width = 60;
        canvas.height = 60;
        
        // Add event listeners
        canvas.addEventListener('mousedown', startDrag);
        
        // Add touch events for mobile
        canvas.addEventListener('touchstart', startDragTouch);
        
        // Add text input functionality
        const textInput = document.getElementById('blend-value');
        if (textInput) {
            textInput.addEventListener('input', function(e) {
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value)); // Clamp between 0-100
                console.log('Text input changed to:', value);
                currentBlendValue = value;
                drawKnob();
                generateBlendPreview();
            });
            
            textInput.addEventListener('blur', function(e) {
                // Ensure the value is within bounds when focus is lost
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                e.target.value = value;
                currentBlendValue = value;
            });
        }
        
        // Initial draw
        drawKnob();
        updateTextInput();
        
        // Initialize master gain knob for non-stem flow
        initializeMasterGainKnob();
    }
    
    function updateTextInput() {
        const textInput = document.getElementById('blend-value');
        if (textInput) {
            textInput.value = Math.round(currentBlendValue);
        }
    }
    
    function initializeMasterGainKnob() {
        const masterGainKnob = document.getElementById('master-gain-knob');
        if (!masterGainKnob) return;
        
        // Set canvas size
        masterGainKnob.width = 60;
        masterGainKnob.height = 60;
        
        // Add mouse event listeners
        masterGainKnob.addEventListener('mousedown', startDragMasterGain);
        masterGainKnob.addEventListener('touchstart', startDragMasterGainTouch);
        
        // Add wheel event for fine adjustment
        masterGainKnob.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            currentMasterGain = Math.max(-3, Math.min(3, currentMasterGain + delta));
            currentMasterGain = Math.round(currentMasterGain * 10) / 10; // Round to 0.1dB
            document.getElementById('master-gain-value').value = currentMasterGain;
            drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
            updatePreview(); // Trigger preview update
        });
        
        // Set cursor
        masterGainKnob.style.cursor = 'grab';
        
        // Add text input functionality
        const masterGainInput = document.getElementById('master-gain-value');
        if (masterGainInput) {
            masterGainInput.addEventListener('input', function(e) {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(-3, Math.min(3, value));
                value = Math.round(value * 10) / 10; // Round to 0.1dB
                currentMasterGain = value;
                drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
                updatePreview(); // Trigger preview update
            });
            
            masterGainInput.addEventListener('blur', function(e) {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(-3, Math.min(3, value));
                value = Math.round(value * 10) / 10;
                e.target.value = value;
                currentMasterGain = value;
            });
        }
        
        // Initial draw
        drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
    }
    
    // Dual knob system for stem separation
    let currentVocalBlend = 50;
    let currentInstrumentalBlend = 50;
    let currentVocalGain = 0;
    let currentInstrumentalGain = 0;
    let currentMasterGain = 0;  // Master gain adjust for limiter input
    let vocalMuted = false;
    let instrumentalMuted = false;
    let isDraggingVocal = false;
    let isDraggingInstrumental = false;
    let isDraggingVocalGain = false;
    let isDraggingInstrumentalGain = false;
    let isDraggingMasterGain = false;
    let vocalGainDragStartY = 0;
    let instrumentalGainDragStartY = 0;
    let vocalGainDragStartValue = 0;
    let instrumentalGainDragStartValue = 0;
    let masterGainDragStartY = 0;
    let masterGainDragStartValue = 0;
    
    function initializeDualKnobs() {
        const vocalKnob = document.getElementById('vocal-blend-knob');
        const instrumentalKnob = document.getElementById('instrumental-blend-knob');
        
        if (!vocalKnob || !instrumentalKnob) return;
        
        // Set canvas sizes to match HTML
        vocalKnob.width = 60;
        vocalKnob.height = 60;
        instrumentalKnob.width = 60;
        instrumentalKnob.height = 60;
        
        // Add event listeners for vocal knob
        vocalKnob.addEventListener('mousedown', (e) => startDragVocal(e));
        vocalKnob.addEventListener('touchstart', (e) => startDragVocalTouch(e));
        
        // Add event listeners for instrumental knob
        instrumentalKnob.addEventListener('mousedown', (e) => startDragInstrumental(e));
        instrumentalKnob.addEventListener('touchstart', (e) => startDragInstrumentalTouch(e));
        
        // Global mouse/touch events for dragging
        document.addEventListener('mousemove', handleDualKnobMove);
        document.addEventListener('mouseup', stopDualKnobDrag);
        document.addEventListener('touchmove', handleDualKnobMoveTouch);
        document.addEventListener('touchend', stopDualKnobDrag);
        
        // Add text input functionality for vocal knob
        const vocalTextInput = document.getElementById('vocal-blend-value');
        if (vocalTextInput) {
            vocalTextInput.addEventListener('input', function(e) {
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                currentVocalBlend = value;
                drawDualKnobs();
                updateDualStemMix();
            });
            
            vocalTextInput.addEventListener('blur', function(e) {
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                e.target.value = value;
                currentVocalBlend = value;
            });
        }
        
        // Add text input functionality for instrumental knob
        const instrumentalTextInput = document.getElementById('instrumental-blend-value');
        if (instrumentalTextInput) {
            instrumentalTextInput.addEventListener('input', function(e) {
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                currentInstrumentalBlend = value;
                drawDualKnobs();
                updateDualStemMix();
            });
            
            instrumentalTextInput.addEventListener('blur', function(e) {
                let value = parseInt(e.target.value) || 0;
                value = Math.max(0, Math.min(100, value));
                e.target.value = value;
                currentInstrumentalBlend = value;
            });
        }
        
        // Initialize gain knobs
        const vocalGainKnob = document.getElementById('vocal-gain-knob');
        const instrumentalGainKnob = document.getElementById('instrumental-gain-knob');
        
        if (vocalGainKnob && instrumentalGainKnob) {
            vocalGainKnob.width = 60;
            vocalGainKnob.height = 60;
            instrumentalGainKnob.width = 60;
            instrumentalGainKnob.height = 60;
            
            // Add drag functionality for gain knobs
            vocalGainKnob.addEventListener('mousedown', (e) => startDragVocalGain(e));
            vocalGainKnob.addEventListener('touchstart', (e) => startDragVocalGainTouch(e));
            instrumentalGainKnob.addEventListener('mousedown', (e) => startDragInstrumentalGain(e));
            instrumentalGainKnob.addEventListener('touchstart', (e) => startDragInstrumentalGainTouch(e));
            
            // Add gain knob wheel event listeners
            vocalGainKnob.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.5 : 0.5;
                currentVocalGain = Math.max(-12, Math.min(12, currentVocalGain + delta));
                document.getElementById('vocal-gain-value').value = currentVocalGain;
                drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
                updateDualStemMix();
            });
            
            instrumentalGainKnob.addEventListener('wheel', (e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? -0.5 : 0.5;
                currentInstrumentalGain = Math.max(-12, Math.min(12, currentInstrumentalGain + delta));
                document.getElementById('instrumental-gain-value').value = currentInstrumentalGain;
                drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                updateDualStemMix();
            });
            
            // Set initial cursors
            vocalGainKnob.style.cursor = 'grab';
            instrumentalGainKnob.style.cursor = 'grab';
            
            // Add gain text input functionality
            const vocalGainInput = document.getElementById('vocal-gain-value');
            const instrumentalGainInput = document.getElementById('instrumental-gain-value');
            
            if (vocalGainInput) {
                vocalGainInput.addEventListener('input', function(e) {
                    let value = parseFloat(e.target.value) || 0;
                    value = Math.max(-12, Math.min(12, value));
                    currentVocalGain = value;
                    drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
                    updateDualStemMix();
                });
            }
            
            if (instrumentalGainInput) {
                instrumentalGainInput.addEventListener('input', function(e) {
                    let value = parseFloat(e.target.value) || 0;
                    value = Math.max(-12, Math.min(12, value));
                    currentInstrumentalGain = value;
                    drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                    updateDualStemMix();
                });
            }
        }
        
        // Initialize enable buttons
        const vocalEnableBtn = document.getElementById('vocal-enable-btn');
        const instrumentalEnableBtn = document.getElementById('instrumental-enable-btn');
        
        if (vocalEnableBtn) {
            vocalEnableBtn.addEventListener('click', () => {
                vocalMuted = !vocalMuted;
                vocalEnableBtn.setAttribute('data-enabled', !vocalMuted);
                vocalEnableBtn.querySelector('.btn-text').textContent = vocalMuted ? 'Mute' : 'On';
                updateDualStemMix();
            });
        }
        
        if (instrumentalEnableBtn) {
            instrumentalEnableBtn.addEventListener('click', () => {
                instrumentalMuted = !instrumentalMuted;
                instrumentalEnableBtn.setAttribute('data-enabled', !instrumentalMuted);
                instrumentalEnableBtn.querySelector('.btn-text').textContent = instrumentalMuted ? 'Mute' : 'On';
                updateDualStemMix();
            });
        }
        
        // Initial draw
        drawDualKnobs();
        updateDualKnobTextInputs();
        
        // Initialize master gain knob for stem flow
        initializeMasterGainKnob();
        
        // Store globally for save function
        window.currentVocalBlend = currentVocalBlend;
        window.currentInstrumentalBlend = currentInstrumentalBlend;
        window.currentVocalGain = currentVocalGain;
        window.currentInstrumentalGain = currentInstrumentalGain;
        window.vocalMuted = vocalMuted;
        window.instrumentalMuted = instrumentalMuted;
    }
    
    function updateDualKnobTextInputs() {
        const vocalTextInput = document.getElementById('vocal-blend-value');
        const instrumentalTextInput = document.getElementById('instrumental-blend-value');
        
        if (vocalTextInput) {
            vocalTextInput.value = Math.round(currentVocalBlend);
        }
        if (instrumentalTextInput) {
            instrumentalTextInput.value = Math.round(currentInstrumentalBlend);
        }
    }
    
    function startDragVocal(e) {
        isDraggingVocal = true;
        dragStartY = e.clientY;
        dragStartValue = currentVocalBlend;
        document.getElementById('vocal-blend-knob').style.cursor = 'grabbing';
    }
    
    function startDragInstrumental(e) {
        isDraggingInstrumental = true;
        dragStartY = e.clientY;
        dragStartValue = currentInstrumentalBlend;
        document.getElementById('instrumental-blend-knob').style.cursor = 'grabbing';
    }
    
    function startDragVocalTouch(e) {
        e.preventDefault();
        isDraggingVocal = true;
        dragStartY = e.touches[0].clientY;
        dragStartValue = currentVocalBlend;
    }
    
    function startDragInstrumentalTouch(e) {
        e.preventDefault();
        isDraggingInstrumental = true;
        dragStartY = e.touches[0].clientY;
        dragStartValue = currentInstrumentalBlend;
    }
    
    function handleDualKnobMove(e) {
        if (!isDraggingVocal && !isDraggingInstrumental && !isDraggingVocalGain && !isDraggingInstrumentalGain) return;
        
        // Handle blend knob dragging
        if (isDraggingVocal || isDraggingInstrumental) {
            const deltaY = dragStartY - e.clientY;
            const sensitivity = 0.5;
            const newValue = Math.max(0, Math.min(100, dragStartValue + deltaY * sensitivity));
            
            if (isDraggingVocal) {
                currentVocalBlend = newValue;
                window.currentVocalBlend = currentVocalBlend;
            } else if (isDraggingInstrumental) {
                currentInstrumentalBlend = newValue;
                window.currentInstrumentalBlend = currentInstrumentalBlend;
            }
            
            drawDualKnobs();
            updateDualKnobTextInputs();
            updateDualStemMix();
        }
        
        // Handle gain knob dragging
        if (isDraggingVocalGain) {
            const deltaY = vocalGainDragStartY - e.clientY;
            const sensitivity = 0.1;
            const newValue = Math.max(-12, Math.min(12, vocalGainDragStartValue + deltaY * sensitivity));
            
            if (Math.abs(newValue - currentVocalGain) >= 0.1) {
                currentVocalGain = Math.round(newValue * 2) / 2; // Round to nearest 0.5
                document.getElementById('vocal-gain-value').value = currentVocalGain;
                window.currentVocalGain = currentVocalGain;
                drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
                updateDualStemMix();
            }
        }
        
        if (isDraggingInstrumentalGain) {
            const deltaY = instrumentalGainDragStartY - e.clientY;
            const sensitivity = 0.1;
            const newValue = Math.max(-12, Math.min(12, instrumentalGainDragStartValue + deltaY * sensitivity));
            
            if (Math.abs(newValue - currentInstrumentalGain) >= 0.1) {
                currentInstrumentalGain = Math.round(newValue * 2) / 2; // Round to nearest 0.5
                document.getElementById('instrumental-gain-value').value = currentInstrumentalGain;
                window.currentInstrumentalGain = currentInstrumentalGain;
                drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                updateDualStemMix();
            }
        }
        
    }
    
    function handleDualKnobMoveTouch(e) {
        if (!isDraggingVocal && !isDraggingInstrumental && !isDraggingVocalGain && !isDraggingInstrumentalGain) return;
        e.preventDefault();
        
        // Handle blend knob dragging
        if (isDraggingVocal || isDraggingInstrumental) {
            const deltaY = dragStartY - e.touches[0].clientY;
            const sensitivity = 0.5;
            const newValue = Math.max(0, Math.min(100, dragStartValue + deltaY * sensitivity));
            
            if (isDraggingVocal) {
                currentVocalBlend = newValue;
                window.currentVocalBlend = currentVocalBlend;
            } else if (isDraggingInstrumental) {
                currentInstrumentalBlend = newValue;
                window.currentInstrumentalBlend = currentInstrumentalBlend;
            }
            
            drawDualKnobs();
            updateDualKnobTextInputs();
            updateDualStemMix();
        }
        
        // Handle gain knob dragging
        if (isDraggingVocalGain) {
            const deltaY = vocalGainDragStartY - e.touches[0].clientY;
            const sensitivity = 0.1;
            const newValue = Math.max(-12, Math.min(12, vocalGainDragStartValue + deltaY * sensitivity));
            
            if (Math.abs(newValue - currentVocalGain) >= 0.1) {
                currentVocalGain = Math.round(newValue * 2) / 2;
                document.getElementById('vocal-gain-value').value = currentVocalGain;
                window.currentVocalGain = currentVocalGain;
                drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
                updateDualStemMix();
            }
        }
        
        if (isDraggingInstrumentalGain) {
            const deltaY = instrumentalGainDragStartY - e.touches[0].clientY;
            const sensitivity = 0.1;
            const newValue = Math.max(-12, Math.min(12, instrumentalGainDragStartValue + deltaY * sensitivity));
            
            if (Math.abs(newValue - currentInstrumentalGain) >= 0.1) {
                currentInstrumentalGain = Math.round(newValue * 2) / 2;
                document.getElementById('instrumental-gain-value').value = currentInstrumentalGain;
                window.currentInstrumentalGain = currentInstrumentalGain;
                drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                updateDualStemMix();
            }
        }
        
    }
    
    function stopDualKnobDrag() {
        isDraggingVocal = false;
        isDraggingInstrumental = false;
        isDraggingVocalGain = false;
        isDraggingInstrumentalGain = false;
        document.getElementById('vocal-blend-knob').style.cursor = 'grab';
        document.getElementById('instrumental-blend-knob').style.cursor = 'grab';
        const vocalGainKnob = document.getElementById('vocal-gain-knob');
        const instrumentalGainKnob = document.getElementById('instrumental-gain-knob');
        if (vocalGainKnob) vocalGainKnob.style.cursor = 'grab';
        if (instrumentalGainKnob) instrumentalGainKnob.style.cursor = 'grab';
    }
    
    // Vocal gain drag functions
    function startDragVocalGain(e) {
        isDraggingVocalGain = true;
        vocalGainDragStartY = e.clientY;
        vocalGainDragStartValue = currentVocalGain;
        document.getElementById('vocal-gain-knob').style.cursor = 'grabbing';
        e.preventDefault();
    }
    
    function startDragVocalGainTouch(e) {
        e.preventDefault();
        isDraggingVocalGain = true;
        vocalGainDragStartY = e.touches[0].clientY;
        vocalGainDragStartValue = currentVocalGain;
    }
    
    // Instrumental gain drag functions  
    function startDragInstrumentalGain(e) {
        isDraggingInstrumentalGain = true;
        instrumentalGainDragStartY = e.clientY;
        instrumentalGainDragStartValue = currentInstrumentalGain;
        document.getElementById('instrumental-gain-knob').style.cursor = 'grabbing';
        e.preventDefault();
    }
    
    function startDragInstrumentalGainTouch(e) {
        e.preventDefault();
        isDraggingInstrumentalGain = true;
        instrumentalGainDragStartY = e.touches[0].clientY;
        instrumentalGainDragStartValue = currentInstrumentalGain;
    }
    
    // Master gain drag functions
    function startDragMasterGain(e) {
        isDraggingMasterGain = true;
        masterGainDragStartY = e.clientY;
        masterGainDragStartValue = currentMasterGain;
        document.getElementById('master-gain-knob').style.cursor = 'grabbing';
        
        // Add document-level event listeners for master gain
        document.addEventListener('mousemove', dragMasterGain);
        document.addEventListener('mouseup', endDragMasterGain);
        
        e.preventDefault();
    }
    
    function startDragMasterGainTouch(e) {
        e.preventDefault();
        isDraggingMasterGain = true;
        masterGainDragStartY = e.touches[0].clientY;
        masterGainDragStartValue = currentMasterGain;
        
        // Add document-level touch event listeners for master gain
        document.addEventListener('touchmove', dragMasterGainTouch);
        document.addEventListener('touchend', endDragMasterGain);
    }
    
    // Master gain drag functions for dedicated handling
    function dragMasterGain(e) {
        if (!isDraggingMasterGain) return;
        
        const deltaY = masterGainDragStartY - e.clientY;
        const sensitivity = 0.05;
        const newValue = Math.max(-3, Math.min(3, masterGainDragStartValue + deltaY * sensitivity));
        
        if (Math.abs(newValue - currentMasterGain) >= 0.05) {
            currentMasterGain = Math.round(newValue * 10) / 10; // Round to nearest 0.1
            document.getElementById('master-gain-value').value = currentMasterGain;
            window.currentMasterGain = currentMasterGain;
            drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
            
            // Update preview based on current flow
            if (window.currentFlow === 'stem') {
                updateDualStemMix();
            } else {
                generateBlendPreview();
            }
        }
    }
    
    function dragMasterGainTouch(e) {
        if (!isDraggingMasterGain) return;
        e.preventDefault();
        
        const deltaY = masterGainDragStartY - e.touches[0].clientY;
        const sensitivity = 0.05;
        const newValue = Math.max(-3, Math.min(3, masterGainDragStartValue + deltaY * sensitivity));
        
        if (Math.abs(newValue - currentMasterGain) >= 0.05) {
            currentMasterGain = Math.round(newValue * 10) / 10; // Round to nearest 0.1
            document.getElementById('master-gain-value').value = currentMasterGain;
            window.currentMasterGain = currentMasterGain;
            drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
            
            // Update preview based on current flow
            if (window.currentFlow === 'stem') {
                updateDualStemMix();
            } else {
                generateBlendPreview();
            }
        }
    }
    
    function endDragMasterGain() {
        isDraggingMasterGain = false;
        const masterGainKnob = document.getElementById('master-gain-knob');
        if (masterGainKnob) masterGainKnob.style.cursor = 'grab';
        
        // Remove document-level event listeners
        document.removeEventListener('mousemove', dragMasterGain);
        document.removeEventListener('mouseup', endDragMasterGain);
        document.removeEventListener('touchmove', dragMasterGainTouch);
        document.removeEventListener('touchend', endDragMasterGain);
    }

    function drawDualKnobs() {
        drawKnobOnCanvas('vocal-blend-knob', currentVocalBlend);
        drawKnobOnCanvas('instrumental-blend-knob', currentInstrumentalBlend);
        drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
        drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
    }
    
    function drawKnobOnCanvas(canvasId, value) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 24;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw outer circle
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fillStyle = '#444';
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw value arc
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + (value / 100) * 2 * Math.PI;
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 3, startAngle, endAngle);
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw pointer
        const pointerAngle = startAngle + (value / 100) * 2 * Math.PI;
        const pointerX = centerX + Math.cos(pointerAngle) * (radius - 8);
        const pointerY = centerY + Math.sin(pointerAngle) * (radius - 8);
        
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
        // Draw value text (no percentage sign)
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(value), centerX, centerY + 4);
    }
    
    function drawGainKnobOnCanvas(canvasId, gainValue) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 24; // Match blend knob radius
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Determine range based on knob type
        const isMasterGain = canvasId === 'master-gain-knob';
        const gainRange = isMasterGain ? 3 : 12; // Master gain: ±3dB, Channel gain: ±12dB
        
        // Convert gain to angle with 0dB at top (-90 degrees)
        // For master gain: -3dB = -90 + 135 = 45 degrees (bottom left), +3dB = -90 - 135 = -225 degrees = 135 degrees (bottom right)
        // For channel gain: -12dB = -90 + 135 = 45 degrees (bottom left), +12dB = -90 - 135 = -225 degrees = 135 degrees (bottom right)
        const normalizedValue = gainValue / gainRange; // Convert to -1,+1 range
        const angle = -90 + (normalizedValue * 135); // -90 degrees is top, range ±135 degrees
        
        // Draw outer circle (match blend knob style)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw gain range arc (from -135 to +135 degrees relative to top)
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius - 2, (-90 - 135) * Math.PI / 180, (-90 + 135) * Math.PI / 180);
        ctx.strokeStyle = '#495057';
        ctx.lineWidth = 4;
        ctx.stroke();
        
        // Draw 0dB mark at top
        const zeroAngle = -90 * Math.PI / 180;
        const zeroMarkX = centerX + Math.cos(zeroAngle) * (radius - 1);
        const zeroMarkY = centerY + Math.sin(zeroAngle) * (radius - 1);
        ctx.beginPath();
        ctx.arc(zeroMarkX, zeroMarkY, 2, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffc107';
        ctx.fill();
        
        // Draw pointer
        const pointerAngle = angle * Math.PI / 180;
        const pointerX = centerX + Math.cos(pointerAngle) * (radius - 8);
        const pointerY = centerY + Math.sin(pointerAngle) * (radius - 8);
        
        ctx.beginPath();
        ctx.arc(pointerX, pointerY, 4, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        
        // Draw gain value text (match blend knob style)
        ctx.fillStyle = '#fff';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const displayValue = gainValue >= 0 ? `+${gainValue.toFixed(1)}` : gainValue.toFixed(1);
        ctx.fillText(displayValue, centerX, centerY);
    }
    
    async function updateDualStemMix() {
        // Generate new preview using modular pipeline
        if (window.vocalOriginalPath && window.vocalProcessedPath && 
            window.instrumentalOriginalPath && window.instrumentalProcessedPath) {
            try {
                // Don't clear waveform cache - waveforms don't change when blend ratios change
                // Only the preview audio output changes
                await generateBlendPreview();
            } catch (error) {
                console.error('Error updating dual stem mix:', error);
            }
        }
    }
    
    async function generateStemBlendPreview() {
        // Generate preview using our modular stem processing pipeline
        const stemFormData = new FormData();
        
        // Add files (as File objects if we have them, or file paths)
        stemFormData.append('vocal_original', new File([], 'vocal_original.wav'));
        stemFormData.append('vocal_processed', new File([], 'vocal_processed.wav'));
        stemFormData.append('instrumental_original', new File([], 'instrumental_original.wav'));
        stemFormData.append('instrumental_processed', new File([], 'instrumental_processed.wav'));
        
        // Add stem blend parameters
        stemFormData.append('vocal_blend_ratio', (currentVocalBlend / 100).toString());
        stemFormData.append('vocal_volume_db', currentVocalGain.toString());
        stemFormData.append('vocal_mute', vocalMuted.toString());
        stemFormData.append('instrumental_blend_ratio', (currentInstrumentalBlend / 100).toString());
        stemFormData.append('instrumental_volume_db', currentInstrumentalGain.toString());
        stemFormData.append('instrumental_mute', instrumentalMuted.toString());
        
        try {
            // For preview, we'll use the file paths approach since we have the stems loaded
            // This is a simplified version - full implementation would require file handling
            
            // For now, just update the preview indication
            console.log('Stem blend preview updated:', {
                vocal: { blend: currentVocalBlend, gain: currentVocalGain, muted: vocalMuted },
                instrumental: { blend: currentInstrumentalBlend, gain: currentInstrumentalGain, muted: instrumentalMuted }
            });
        } catch (error) {
            console.error('Error generating stem blend preview:', error);
        }
    }
    
    function startDrag(e) {
        isDragging = true;
        dragStartY = e.clientY;
        dragStartValue = currentBlendValue;
        blendKnobCanvas.style.cursor = 'grabbing';
        
        // Add document-level event listeners
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', endDrag);
        
        // Prevent default to avoid text selection
        e.preventDefault();
    }
    
    function startDragTouch(e) {
        e.preventDefault();
        isDragging = true;
        dragStartY = e.touches[0].clientY;
        dragStartValue = currentBlendValue;
        
        // Add document-level touch event listeners
        document.addEventListener('touchmove', dragTouch);
        document.addEventListener('touchend', endDrag);
    }
    
    function drag(e) {
        if (!isDragging) return;
        
        const deltaY = dragStartY - e.clientY; // Inverted: up = increase
        const sensitivity = 1.0; // Increased sensitivity for faster control
        const newValue = Math.max(0, Math.min(100, dragStartValue + (deltaY * sensitivity)));
        
        if (newValue !== currentBlendValue) {
            currentBlendValue = Math.round(newValue);
            drawKnob();
            updateTextInput();
            generateBlendPreview();
        }
        
    }
    
    function dragTouch(e) {
        if (!isDragging) return;
        e.preventDefault();
        
        const deltaY = dragStartY - e.touches[0].clientY;
        const sensitivity = 1.0;
        const newValue = Math.max(0, Math.min(100, dragStartValue + (deltaY * sensitivity)));
        
        if (newValue !== currentBlendValue) {
            currentBlendValue = Math.round(newValue);
            drawKnob();
            updateTextInput();
            generateBlendPreview();
        }
        
    }
    
    function endDrag() {
        isDragging = false;
        blendKnobCanvas.style.cursor = 'grab';
        
        // Remove document-level event listeners
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', endDrag);
        document.removeEventListener('touchmove', dragTouch);
        document.removeEventListener('touchend', endDrag);
    }
    
    
    function drawKnob() {
        const canvas = blendKnobCanvas;
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 22;
        const trackWidth = 4;
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw track background
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0.75 * Math.PI, 2.25 * Math.PI);
        ctx.strokeStyle = '#343a40';
        ctx.lineWidth = trackWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Draw progress arc
        const startAngle = 0.75 * Math.PI;
        const endAngle = startAngle + (currentBlendValue / 100) * (1.5 * Math.PI);
        
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.strokeStyle = '#007bff';
        ctx.lineWidth = trackWidth;
        ctx.lineCap = 'round';
        ctx.stroke();
        
        // Draw knob handle
        const handleAngle = startAngle + (currentBlendValue / 100) * (1.5 * Math.PI);
        const handleX = centerX + Math.cos(handleAngle) * radius;
        const handleY = centerY + Math.sin(handleAngle) * radius;
        
        ctx.beginPath();
        ctx.arc(handleX, handleY, 5, 0, 2 * Math.PI);
        ctx.fillStyle = '#007bff';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Draw center value
        ctx.fillStyle = '#f8f9fa';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(currentBlendValue + '%', centerX, centerY);
    }

    function updateBlend() {
        // New modular approach: trigger re-processing with current parameters
        if (originalFilePath && processedFilePath) {
            generateBlendPreview();
        }
    }
    
    // Helper function to check if we're in stem mode
    function isCurrentlyStemMode() {
        return document.getElementById('vocal-channel').style.display !== 'none';
    }

    // Initialize JIT processing for real-time preview
    async function initializeJITProcessing(originalFilePath, processedFilePath) {
        try {
            console.log('Initializing JIT processing...');
            
            // Initialize JIT system
            const initialized = await window.jitPlayback.initialize();
            if (!initialized) {
                console.log('JIT processing not available, using fallback');
                return false;
            }
            
            // Convert file paths to proper URLs
            const originalUrl = `/temp_files/${encodeURIComponent(originalFilePath.split('/').pop())}`;
            const processedUrl = `/temp_files/${encodeURIComponent(processedFilePath.split('/').pop())}`;
            
            // Load audio files
            const audioLoaded = await window.jitPlayback.loadAudio(originalUrl, processedUrl);
            if (!audioLoaded) {
                console.log('Failed to load audio for JIT processing');
                return false;
            }
            
            // Set up position updates for waveform display
            window.jitPlaybackManager.onPositionUpdate = (currentTime, duration) => {
                if (duration > 0) {
                    const progress = currentTime / duration;
                    drawPlayPosition(progress);
                }
            };
            
            // Set up playback end handler
            window.jitPlaybackManager.onPlaybackEnd = () => {
                isPlaying = false;
                updatePlaybackButtons('stop');
                drawPlayPosition(0);
            };
            
            console.log('✓ JIT processing initialized successfully');
            
            // Show JIT status indicator
            showJITStatus('🚀 Real-time processing enabled', false);
            
            return true;
            
        } catch (error) {
            console.error('JIT initialization failed:', error);
            showJITStatus('⚠ Using fallback processing', true);
            return false;
        }
    }
    
    // Show JIT processing status
    function showJITStatus(message, isWarning = false) {
        // Find or create status indicator
        let indicator = document.getElementById('jit-status-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'jit-status-indicator';
            indicator.className = 'alert alert-info mt-2';
            
            // Insert after the process button
            const processButton = document.getElementById('process-file-button');
            if (processButton) {
                processButton.parentNode.insertBefore(indicator, processButton.nextSibling);
            }
        }
        
        indicator.textContent = message;
        indicator.className = `alert ${isWarning ? 'alert-warning' : 'alert-info'} mt-2`;
        indicator.style.display = 'block';
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (indicator) {
                indicator.style.display = 'none';
            }
        }, 3000);
    }
    
    // Update the preview audio element with new processed audio
    function updatePreviewAudio(audioPath) {
        if (!previewAudioElement) {
            // Create audio element if it doesn't exist
            previewAudioElement = new Audio();
        }
        
        // Remember if we were playing and the current time
        const wasPlaying = isPlaying && !previewAudioElement.paused;
        const currentTime = previewAudioElement.currentTime || 0;
        console.log('Updating preview audio - was playing:', wasPlaying, 'at time:', currentTime);
        
        // Update the audio source
        currentPreviewPath = audioPath;
        previewAudioElement.src = `/temp_files/${encodeURIComponent(audioPath.split('/').pop())}`;
        
        // If we were playing, resume playback once the new audio loads
        if (wasPlaying) {
            // Use multiple events to ensure reliable loading detection
            let resumed = false;
            
            const attemptResume = () => {
                if (resumed) return; // Prevent multiple resume attempts
                
                setTimeout(() => {
                    try {
                        // Verify audio is ready and duration is available
                        if (previewAudioElement.readyState >= 3 && previewAudioElement.duration) {
                            resumed = true;
                            
                            // Set the current time to where we were
                            if (currentTime > 0 && currentTime <= previewAudioElement.duration) {
                                previewAudioElement.currentTime = currentTime;
                                console.log('Resuming playback at position:', currentTime, 'seconds');
                            } else {
                                console.log('Starting playback from beginning (position was invalid)');
                                previewAudioElement.currentTime = 0;
                            }
                            
                            previewAudioElement.play().then(() => {
                                isPlaying = true;
                                updatePlaybackButtons('play');
                                updatePlayPosition();
                                console.log('Successfully resumed playback');
                            }).catch(error => {
                                console.warn('Could not resume playback:', error);
                                isPlaying = false;
                                updatePlaybackButtons('stop');
                            });
                        } else {
                            console.log('Audio not ready yet, duration:', previewAudioElement.duration, 'readyState:', previewAudioElement.readyState);
                        }
                    } catch (error) {
                        console.warn('Error in resume playback:', error);
                    }
                }, 100); // Slightly longer delay for better reliability
            };
            
            // Try multiple events to catch when audio is ready
            previewAudioElement.addEventListener('canplaythrough', attemptResume, { once: true });
            previewAudioElement.addEventListener('loadeddata', attemptResume, { once: true });
            
            // Fallback timeout in case events don't fire
            setTimeout(() => {
                if (!resumed) {
                    console.log('Attempting resume via timeout fallback');
                    attemptResume();
                }
            }, 500);
        }
        
        // Update playback controls state if needed
        updatePlaybackControls();
    }
    
    // Update playback controls based on current state
    function updatePlaybackControls() {
        if (previewAudioElement) {
            const playButton = document.getElementById('play-button');
            const pauseButton = document.getElementById('pause-button');
            const stopButton = document.getElementById('stop-button');
            
            // Enable controls
            playButton.disabled = false;
            pauseButton.disabled = false;
            stopButton.disabled = false;
        }
    }
    
    // Generate a new blend preview using JIT processing or fallback to modular approach
    async function generateBlendPreview() {
        if (!originalFilePath || !processedFilePath) return;
        
        // Check if JIT processing is available and ready
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            // Use JIT processing - just update parameters, no file generation needed
            const params = {
                blendRatio: currentBlendValue / 100.0,
                masterGain: currentMasterGain,
                limiterEnabled: limiterEnabled
            };
            
            window.jitPlayback.updateParameters(params);
            console.log('JIT parameters updated:', params);
            return; // JIT processing handles everything in real-time
        }
        
        try {
            // Get the blend ratio (0.0 to 1.0)
            const blendRatio = currentBlendValue / 100.0;
            
            console.log('Generating blend preview at', Math.round(blendRatio * 100) + '%');
            
            // For non-stem mode, use simple channel processing
            if (!isCurrentlyStemMode()) {
                const formData = new FormData();
                
                // Convert file paths to File objects by fetching them
                const originalResponse = await fetch(`/temp_files/${encodeURIComponent(originalFilePath.split('/').pop())}`);
                const processedResponse = await fetch(`/temp_files/${encodeURIComponent(processedFilePath.split('/').pop())}`);
                
                const originalBlob = await originalResponse.blob();
                const processedBlob = await processedResponse.blob();
                
                formData.append('original_file', originalBlob, 'original.wav');
                formData.append('processed_file', processedBlob, 'processed.wav');
                formData.append('blend_ratio', blendRatio);
                formData.append('volume_adjust_db', 0); // No volume adjustment in non-stem mode
                formData.append('mute', false);
                
                const response = await fetch('/api/process_channel', {
                    method: 'POST',
                    body: formData
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // Apply master limiter processing to match final output
                    try {
                        const limiterFormData = new FormData();
                        
                        // Get the blended channel output
                        const blendedResponse = await fetch(`/temp_files/${encodeURIComponent(data.channel_output_path.split('/').pop())}`);
                        const blendedBlob = await blendedResponse.blob();
                        
                        limiterFormData.append('input_files', blendedBlob, 'blended.wav');
                        limiterFormData.append('gain_adjust_db', currentMasterGain);
                        limiterFormData.append('enable_limiter', limiterEnabled);
                        
                        const limiterResponse = await fetch('/api/process_limiter', {
                            method: 'POST',
                            body: limiterFormData,
                        });
                        
                        if (limiterResponse.ok) {
                            const limiterData = await limiterResponse.json();
                            // Update the preview audio element to play the limited blend (matches final output)
                            updatePreviewAudio(limiterData.master_output_path);
                            console.log('Preview generated with master limiter processing to match final output');
                        } else {
                            console.error('Failed to apply master limiter to preview:', limiterResponse.statusText);
                            // Fallback to non-limited preview
                            updatePreviewAudio(data.channel_output_path);
                        }
                    } catch (limiterError) {
                        console.error('Error applying master limiter to preview:', limiterError);
                        // Fallback to non-limited preview
                        updatePreviewAudio(data.channel_output_path);
                    }
                    
                    // Waveform is already drawn once when processing completed
                    // No need to redraw it during preview generation
                } else {
                    console.error('Failed to generate blend preview:', response.statusText);
                }
            } else {
                // Stem mode: generate blended preview using both vocal and instrumental channels
                console.log('Generating stem blend preview');
                
                // Process vocal channel
                const vocalFormData = new FormData();
                const vocalOriginalResponse = await fetch(`/temp_files/${encodeURIComponent(window.vocalOriginalPath.split('/').pop())}`);
                const vocalProcessedResponse = await fetch(`/temp_files/${encodeURIComponent(window.vocalProcessedPath.split('/').pop())}`);
                
                const vocalOriginalBlob = await vocalOriginalResponse.blob();
                const vocalProcessedBlob = await vocalProcessedResponse.blob();
                
                vocalFormData.append('original_file', vocalOriginalBlob, 'vocal_original.wav');
                vocalFormData.append('processed_file', vocalProcessedBlob, 'vocal_processed.wav');
                vocalFormData.append('blend_ratio', currentVocalBlend / 100);
                vocalFormData.append('volume_adjust_db', currentVocalGain);
                vocalFormData.append('mute', vocalMuted);
                
                const vocalResponse = await fetch('/api/process_channel', {
                    method: 'POST',
                    body: vocalFormData
                });
                
                // Process instrumental channel
                const instrumentalFormData = new FormData();
                const instrumentalOriginalResponse = await fetch(`/temp_files/${encodeURIComponent(window.instrumentalOriginalPath.split('/').pop())}`);
                const instrumentalProcessedResponse = await fetch(`/temp_files/${encodeURIComponent(window.instrumentalProcessedPath.split('/').pop())}`);
                
                const instrumentalOriginalBlob = await instrumentalOriginalResponse.blob();
                const instrumentalProcessedBlob = await instrumentalProcessedResponse.blob();
                
                instrumentalFormData.append('original_file', instrumentalOriginalBlob, 'instrumental_original.wav');
                instrumentalFormData.append('processed_file', instrumentalProcessedBlob, 'instrumental_processed.wav');
                instrumentalFormData.append('blend_ratio', currentInstrumentalBlend / 100);
                instrumentalFormData.append('volume_adjust_db', currentInstrumentalGain);
                instrumentalFormData.append('mute', instrumentalMuted);
                
                const instrumentalResponse = await fetch('/api/process_channel', {
                    method: 'POST',
                    body: instrumentalFormData
                });
                
                if (vocalResponse.ok && instrumentalResponse.ok) {
                    const vocalData = await vocalResponse.json();
                    const instrumentalData = await instrumentalResponse.json();
                    
                    // Combine both channels using master limiter
                    const limiterFormData = new FormData();
                    
                    const vocalBlendedResponse = await fetch(`/temp_files/${encodeURIComponent(vocalData.channel_output_path.split('/').pop())}`);
                    const instrumentalBlendedResponse = await fetch(`/temp_files/${encodeURIComponent(instrumentalData.channel_output_path.split('/').pop())}`);
                    
                    const vocalBlendedBlob = await vocalBlendedResponse.blob();
                    const instrumentalBlendedBlob = await instrumentalBlendedResponse.blob();
                    
                    limiterFormData.append('input_files', vocalBlendedBlob, 'vocal_blended.wav');
                    limiterFormData.append('input_files', instrumentalBlendedBlob, 'instrumental_blended.wav');
                    limiterFormData.append('gain_adjust_db', currentMasterGain);
                    limiterFormData.append('enable_limiter', limiterEnabled);
                    
                    const limiterResponse = await fetch('/api/process_limiter', {
                        method: 'POST',
                        body: limiterFormData
                    });
                    
                    if (limiterResponse.ok) {
                        const limiterData = await limiterResponse.json();
                        updatePreviewAudio(limiterData.master_output_path);
                        console.log('Stem preview generated with master limiter processing');
                    } else {
                        console.error('Failed to apply master limiter to stem preview:', limiterResponse.statusText);
                    }
                } else {
                    console.error('Failed to generate stem blend preview - channel processing failed');
                }
            }
        } catch (error) {
            console.error('Error generating blend preview:', error);
        }
    }

    // Draw waveform visualization
    function drawWaveform(canvas, buffer, color) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 120;
        
        ctx.clearRect(0, 0, width, height);
        
        if (!buffer) return;
        
        // Use max absolute value of left and right channels for better mono representation
        const leftData = buffer.getChannelData(0);
        const rightData = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftData;
        const step = Math.ceil(leftData.length / width);
        const amp = height / 2;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        
        for (let i = 0; i < width; i++) {
            const index = i * step;
            if (index >= leftData.length) break;
            
            // Get max and min values from both channels for better mono representation
            let min = 0, max = 0;
            for (let j = 0; j < step && index + j < leftData.length; j++) {
                const leftValue = leftData[index + j];
                const rightValue = rightData[index + j];
                // Use max absolute value for better visualization
                const maxAbsValue = Math.max(Math.abs(leftValue), Math.abs(rightValue));
                const value = leftValue >= 0 ? maxAbsValue : -maxAbsValue;
                
                if (value < min) min = value;
                if (value > max) max = value;
            }
            
            // Draw waveform bar from min to max
            const yMax = amp - (max * amp);
            const yMin = amp - (min * amp);
            const barHeight = yMin - yMax;
            
            if (barHeight > 0) {
                ctx.fillRect(i, yMax, 1, barHeight);
            }
        }
        
        ctx.globalAlpha = 1;
    }

    // Function to load audio buffer for waveform display
    async function loadAudioForWaveform(audioPath) {
        try {
            console.log('Loading audio for waveform:', audioPath);
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const response = await fetch(`/temp_files/${encodeURIComponent(audioPath.split('/').pop())}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch audio file: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            audioContext.close();
            return audioBuffer;
        } catch (error) {
            console.error('Error loading audio for waveform:', error);
            return null;
        }
    }

    async function drawCombinedWaveform(canvas, originalPath = null, processedPath = null, originalColor = '#007bff', processedColor = '#28a745') {
        if (!canvas) {
            console.error('Canvas element not found for waveform display');
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        // Ensure canvas has proper dimensions
        const width = canvas.offsetWidth || 400; // fallback width
        const height = 120;
        canvas.width = width;
        canvas.height = height;
        
        console.log('Drawing waveform on canvas:', canvas.id, 'dimensions:', width, 'x', height);
        
        ctx.clearRect(0, 0, width, height);
        
        // Draw background to make canvas visible
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);
        
        // Draw border for visibility
        ctx.strokeStyle = '#dee2e6';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
        
        const centerY = height / 2;
        
        // Draw center line
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
        
        // Use available file paths if parameters not provided
        const originalAudioPath = originalPath || originalFilePath;
        const processedAudioPath = processedPath || processedFilePath;
        
        if (!originalAudioPath && !processedAudioPath) {
            // Show placeholder text if no audio files available
            ctx.fillStyle = '#333';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('No Audio Data Available', width / 2, height / 2);
            return;
        }
        
        try {
            // Load audio buffers
            const originalBuffer = originalAudioPath ? await loadAudioForWaveform(originalAudioPath) : null;
            const processedBuffer = processedAudioPath ? await loadAudioForWaveform(processedAudioPath) : null;
            
            if (!originalBuffer && !processedBuffer) {
                // Show error message if loading failed
                ctx.fillStyle = '#dc3545';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Error Loading Audio Data', width / 2, height / 2);
                return;
            }
            
            // Function to draw half waveform (positive or negative)
            function drawHalfWaveform(buffer, color, drawPositive) {
                if (!buffer) return;
                
                const leftData = buffer.getChannelData(0);
                const rightData = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : leftData;
                const step = Math.ceil(leftData.length / width);
                const amp = height / 2 - 10; // Leave some margin
                
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.7;
                
                for (let i = 0; i < width; i++) {
                    const index = i * step;
                    if (index >= leftData.length) break;
                    
                    // Get max absolute value from both channels
                    let maxValue = 0;
                    for (let j = 0; j < step && index + j < leftData.length; j++) {
                        const leftValue = leftData[index + j];
                        const rightValue = rightData[index + j];
                        const maxAbsValue = Math.max(Math.abs(leftValue), Math.abs(rightValue));
                        if (maxAbsValue > maxValue) maxValue = maxAbsValue;
                    }
                    
                    const barHeight = maxValue * amp;
                    if (barHeight > 0) {
                        if (drawPositive) {
                            // Draw original waveform in positive half (above center)
                            ctx.fillRect(i, centerY - barHeight, 1, barHeight);
                        } else {
                            // Draw processed waveform in negative half (below center)
                            ctx.fillRect(i, centerY, 1, barHeight);
                        }
                    }
                }
                
                ctx.globalAlpha = 1;
            }
            
            // Draw original waveform in positive half (above center line)
            if (originalBuffer) {
                drawHalfWaveform(originalBuffer, originalColor, true);
            }
            
            // Draw processed waveform in negative half (below center line)
            if (processedBuffer) {
                drawHalfWaveform(processedBuffer, processedColor, false);
            }
            
            // Add labels
            ctx.fillStyle = '#333';
            ctx.font = '10px Arial';
            ctx.textAlign = 'left';
            if (originalBuffer) {
                ctx.fillStyle = originalColor;
                ctx.fillText('Original', 5, 15);
            }
            if (processedBuffer) {
                ctx.fillStyle = processedColor;
                ctx.fillText('Processed', 5, height - 5);
            }
            
            // Cache the waveform image for efficient playback position drawing
            cacheWaveformImage(canvas);
            
        } catch (error) {
            console.error('Error drawing waveform:', error);
            // Show error message
            ctx.fillStyle = '#dc3545';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Waveform Loading Error', width / 2, height / 2);
        }
    }

    // Seek audio to specific position
    function seekAudio(event) {
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const clickPosition = x / canvas.offsetWidth;
        
        // Try JIT processing first
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            const state = window.jitPlayback.getState();
            if (state.duration > 0) {
                const newTime = clickPosition * state.duration;
                window.jitPlayback.seek(newTime);
                drawPlayPosition(clickPosition);
            }
            return;
        }
        
        // Fallback to traditional audio element
        if (!previewAudioElement || !previewAudioElement.duration) return;
        
        // Calculate new playback time
        const newTime = clickPosition * previewAudioElement.duration;
        
        // Set new playback time
        previewAudioElement.currentTime = newTime;
        
        // Update visual position
        drawPlayPosition(clickPosition);
    }

    // Store waveform image data to avoid redrawing during playback
    let waveformImageCache = new Map();
    
    // Draw play position indicator without redrawing waveform
    function drawPlayPosition(position) {
        const isStemSeparation = processSingleStatus.dataset.isStemSeparation === 'true';
        
        let canvases = [];
        
        if (isStemSeparation) {
            // Use combined stem waveform canvases
            canvases = [
                document.getElementById('vocal-combined-waveform'),
                document.getElementById('instrumental-combined-waveform')
            ];
        } else {
            // Use combined standard waveform canvas
            canvases = [
                document.getElementById('combined-waveform')
            ];
        }
        
        canvases.forEach(canvas => {
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            // Use cached waveform image if available, otherwise redraw
            const cacheKey = canvas.id;
            if (waveformImageCache.has(cacheKey)) {
                // Restore cached waveform
                const imageData = waveformImageCache.get(cacheKey);
                ctx.putImageData(imageData, 0, 0);
            } else {
                // Cache doesn't exist, we need to redraw the waveform
                // This should only happen on first draw or after waveform updates
                console.log('No cached waveform found for:', cacheKey, '- waveform may need to be redrawn');
                // For now, just draw a simple background to prevent blank canvas
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = '#f8f9fa';
                ctx.fillRect(0, 0, width, height);
                ctx.strokeStyle = '#dee2e6';
                ctx.lineWidth = 1;
                ctx.strokeRect(0, 0, width, height);
                
                // Draw center line
                const centerY = height / 2;
                ctx.strokeStyle = '#666';
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]);
                ctx.beginPath();
                ctx.moveTo(0, centerY);
                ctx.lineTo(width, centerY);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            
            // Draw position line over the waveform
            const x = position * width;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.shadowBlur = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        });
    }
    
    // Function to cache waveform image data after drawing
    function cacheWaveformImage(canvas) {
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.offsetWidth, canvas.offsetHeight);
        waveformImageCache.set(canvas.id, imageData);
        console.log('Cached waveform image for:', canvas.id);
    }
    
    // Function to clear waveform cache when waveforms are updated
    function clearWaveformCache() {
        waveformImageCache.clear();
        console.log('Cleared waveform image cache');
    }

    // Update play position during playback using HTML5 audio
    function updatePlayPosition() {
        if (!isPlaying || !previewAudioElement) return;
        
        const position = previewAudioElement.currentTime / previewAudioElement.duration;
        
        if (previewAudioElement.ended) {
            // Reached end, stop playback
            stopAudio();
            return;
        }
        
        drawPlayPosition(position);
        animationFrameId = requestAnimationFrame(updatePlayPosition);
    }

    // Limiter button event listeners
    function toggleLimiter(button, isEnabled) {
        const text = button.querySelector('.limiter-text');
        
        if (isEnabled) {
            button.classList.remove('limiter-on');
            button.classList.add('limiter-bypassed');
            text.textContent = 'BYPASS';
            return false;
        } else {
            button.classList.remove('limiter-bypassed');
            button.classList.add('limiter-on');
            text.textContent = 'ON';
            return true;
        }
    }

    limiterButton.addEventListener('click', () => {
        limiterEnabled = toggleLimiter(limiterButton, limiterEnabled);
        // Update the audio preview when limiter state changes
        updateAudioPreviewAsync();
    });

    batchLimiterButton.addEventListener('click', () => {
        batchLimiterEnabled = toggleLimiter(batchLimiterButton, batchLimiterEnabled);
    });
    
    // Use shared limiter for both standard and stem modes
    window.stemLimiterEnabled = true; // Default to enabled

    // Function to update audio preview with current blend and limiter settings
    async function updateAudioPreview() {
        const originalFilePath = processSingleStatus.dataset.originalFilePath;
        const processedFilePath = processSingleStatus.dataset.processedFilePath;
        
        if (!originalFilePath || !processedFilePath) return;
        
        try {
            const formData = new FormData();
            formData.append('original_path', originalFilePath);
            formData.append('processed_path', processedFilePath);
            formData.append('blend_ratio', currentBlendValue / 100);
            formData.append('apply_limiter', limiterEnabled);
            
            const response = await fetch('/api/preview_blend', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            
            if (response.ok) {
                // Update the audio context with the new preview file
                const previewUrl = `/temp_files/${data.preview_file_path.split('/').pop()}`;
                await setupPreviewAudioContext(previewUrl);
            }
        } catch (error) {
            console.error('Error updating audio preview:', error);
        }
    }

    // Function to update audio preview without disrupting playback
    // Note: Old audio preview function replaced with generateBlendPreview

    // Setup simple audio preview (file-based approach)
    async function setupPreviewAudioContext(previewUrl) {
        // Store current preview path for simple HTML5 audio playback
        currentPreviewPath = previewUrl;
        
        // Update audio element src if it exists
        if (previewAudioElement) {
            previewAudioElement.src = previewUrl;
        }

        // Initialize knob if not already done
        if (!blendKnobCanvas.dataset.initialized) {
            initializeKnob();
            blendKnobCanvas.dataset.initialized = 'true';
        }

        // For waveform display, we'd need to load files but for now just show placeholder
        console.log('Preview setup complete for:', previewUrl);
        
        // Reset playback buttons to initial state
        updatePlaybackButtons('stop');
    }

    // Note: Complex Web Audio API buffer manipulation replaced with file-based modular processing

    // Show preset download links for both stem and non-stem processing
    function showPresetDownloadLinks() {
        const vocalPresetPath = processSingleStatus.dataset.vocalPresetPath;
        const instrumentalPresetPath = processSingleStatus.dataset.instrumentalPresetPath;
        const vocalPresetFilename = processSingleStatus.dataset.vocalPresetFilename;
        const instrumentalPresetFilename = processSingleStatus.dataset.instrumentalPresetFilename;
        
        const createdPresetPath = processSingleStatus.dataset.createdPresetPath;
        const createdPresetFilename = processSingleStatus.dataset.createdPresetFilename;
        
        // Check if we have presets to show
        const hasStemPresets = (vocalPresetPath && instrumentalPresetPath);
        const hasStandardPreset = (createdPresetPath);
        
        if (hasStemPresets || hasStandardPreset) {
            // Find or create preset download section
            let presetDownloadSection = document.getElementById('preset-download-section');
            if (!presetDownloadSection) {
                presetDownloadSection = document.createElement('div');
                presetDownloadSection.id = 'preset-download-section';
                presetDownloadSection.className = 'mt-4 p-3 bg-secondary rounded';
                presetDownloadSection.innerHTML = `
                    <h5 class="text-light mb-3">📥 Download Reference Presets</h5>
                    <div class="alert alert-info">
                        <small>These presets were created from your reference audio's separated stems. You can use them for future processing!</small>
                    </div>
                    <div id="preset-download-links" class="d-flex flex-wrap gap-3"></div>
                `;
                
                // Insert before the waveform section
                const waveformSection = document.querySelector('.channel-box');
                if (waveformSection) {
                    waveformSection.parentNode.insertBefore(presetDownloadSection, waveformSection);
                }
            }
            
            // Create download links
            const linksContainer = document.getElementById('preset-download-links');
            linksContainer.innerHTML = '';
            
            if (hasStemPresets) {
                // Vocal preset link
                const vocalLink = document.createElement('a');
                vocalLink.href = `/download/preset/${vocalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(vocalPresetFilename)}`;
                vocalLink.className = 'btn btn-outline-primary btn-sm';
                vocalLink.innerHTML = '🎤 ' + vocalPresetFilename;
                vocalLink.title = 'Download vocal preset';
                
                // Instrumental preset link
                const instrumentalLink = document.createElement('a');
                instrumentalLink.href = `/download/preset/${instrumentalPresetPath.split('/').pop()}?download_name=${encodeURIComponent(instrumentalPresetFilename)}`;
                instrumentalLink.className = 'btn btn-outline-primary btn-sm';
                instrumentalLink.innerHTML = '🎹 ' + instrumentalPresetFilename;
                instrumentalLink.title = 'Download instrumental preset';
                
                linksContainer.appendChild(vocalLink);
                linksContainer.appendChild(instrumentalLink);
            } else if (hasStandardPreset) {
                // Standard preset link
                const standardLink = document.createElement('a');
                standardLink.href = `/download/preset/${createdPresetPath.split('/').pop()}?download_name=${encodeURIComponent(createdPresetFilename)}`;
                standardLink.className = 'btn btn-outline-primary btn-sm';
                standardLink.innerHTML = '🎵 ' + createdPresetFilename;
                standardLink.title = 'Download preset';
                
                linksContainer.appendChild(standardLink);
            }
        }
    }

    // Initialize stem waveform display
    async function initializeStemWaveforms() {
        const targetVocalPath = processSingleStatus.dataset.targetVocalPath;
        const targetInstrumentalPath = processSingleStatus.dataset.targetInstrumentalPath;
        const processedVocalPath = processSingleStatus.dataset.processedVocalPath;
        const processedInstrumentalPath = processSingleStatus.dataset.processedInstrumentalPath;
        
        if (!targetVocalPath || !processedVocalPath) {
            console.error('Stem paths not found for stem separation');
            return;
        }
        
        try {
            // Clear waveform cache since we have new processed stem files
            clearWaveformCache();
            
            // Store file paths for modular processing
            window.vocalOriginalPath = targetVocalPath;
            window.vocalProcessedPath = processedVocalPath;
            window.instrumentalOriginalPath = targetInstrumentalPath;
            window.instrumentalProcessedPath = processedInstrumentalPath;

            // Initialize dual knobs for stem separation
            initializeDualKnobs();

            // Reset playback buttons to initial state
            updatePlaybackButtons('stop');
            
            // Draw waveforms for vocal and instrumental channels
            setTimeout(() => {
                const vocalWaveform = document.getElementById('vocal-combined-waveform');
                const instrumentalWaveform = document.getElementById('instrumental-combined-waveform');
                
                if (vocalWaveform) {
                    console.log('Drawing vocal waveform');
                    drawCombinedWaveform(vocalWaveform, targetVocalPath, processedVocalPath, '#007bff', '#28a745');
                    
                    // Add click listener for seeking
                    vocalWaveform.addEventListener('click', seekAudio);
                } else {
                    console.error('Vocal waveform canvas not found');
                }
                
                if (instrumentalWaveform) {
                    console.log('Drawing instrumental waveform');
                    drawCombinedWaveform(instrumentalWaveform, targetInstrumentalPath, processedInstrumentalPath, '#6f42c1', '#fd7e14');
                    
                    // Add click listener for seeking
                    instrumentalWaveform.addEventListener('click', seekAudio);
                } else {
                    console.error('Instrumental waveform canvas not found');
                }
            }, 100);
            
            // Generate initial preview with default settings (50% blend on both channels)
            setTimeout(() => {
                generateBlendPreview();
            }, 200);
            
            console.log('Stem waveforms initialized for modular processing');
            
        } catch (error) {
            console.error('Error initializing stem waveforms:', error);
        }
    }

    // Save blend button event listener
    saveBlendButton.addEventListener('click', async () => {
        const isStemSeparation = processSingleStatus.dataset.isStemSeparation === 'true';
        
        if (isStemSeparation) {
            // For stem separation, use dual blend ratios
            const targetVocalPath = processSingleStatus.dataset.targetVocalPath;
            const targetInstrumentalPath = processSingleStatus.dataset.targetInstrumentalPath;
            const processedVocalPath = processSingleStatus.dataset.processedVocalPath;
            const processedInstrumentalPath = processSingleStatus.dataset.processedInstrumentalPath;
            
            if (!targetVocalPath || !processedVocalPath || !targetInstrumentalPath || !processedInstrumentalPath) {
                showStatus(saveBlendStatus, 'Error: Missing stem files for blending.', true);
                return;
            }
            
            // Get blend ratios from dual knobs (defaulting to 50% if not initialized)
            const vocalBlendRatio = (window.currentVocalBlend || 50) / 100;
            const instrumentalBlendRatio = (window.currentInstrumentalBlend || 50) / 100;
            
            // Prevent multiple simultaneous save operations
            if (saveBlendButton.disabled) return;
            
            saveBlendButton.disabled = true;
            showStatus(saveBlendStatus, 'Processing stem channels...');
            
            try {
                // Step 1: Process both stem channels using our modular processor
                const stemFormData = new FormData();
                
                // Get the stem audio files
                const vocalOrigResponse = await fetch(`/temp_files/${encodeURIComponent(targetVocalPath.split('/').pop())}`);
                const vocalProcResponse = await fetch(`/temp_files/${encodeURIComponent(processedVocalPath.split('/').pop())}`);
                const instOrigResponse = await fetch(`/temp_files/${encodeURIComponent(targetInstrumentalPath.split('/').pop())}`);
                const instProcResponse = await fetch(`/temp_files/${encodeURIComponent(processedInstrumentalPath.split('/').pop())}`);
                
                const vocalOrigBlob = await vocalOrigResponse.blob();
                const vocalProcBlob = await vocalProcResponse.blob();
                const instOrigBlob = await instOrigResponse.blob();
                const instProcBlob = await instProcResponse.blob();
                
                stemFormData.append('vocal_original', vocalOrigBlob, 'vocal_orig.wav');
                stemFormData.append('vocal_processed', vocalProcBlob, 'vocal_proc.wav');
                stemFormData.append('instrumental_original', instOrigBlob, 'inst_orig.wav');
                stemFormData.append('instrumental_processed', instProcBlob, 'inst_proc.wav');
                stemFormData.append('vocal_blend_ratio', vocalBlendRatio);
                stemFormData.append('instrumental_blend_ratio', instrumentalBlendRatio);
                stemFormData.append('vocal_volume_db', window.currentVocalGain || 0);
                stemFormData.append('instrumental_volume_db', window.currentInstrumentalGain || 0);
                stemFormData.append('vocal_mute', window.vocalMuted || false);
                stemFormData.append('instrumental_mute', window.instrumentalMuted || false);
                
                const stemResponse = await fetch('/api/process_stem_channels', {
                    method: 'POST',
                    body: stemFormData,
                });
                
                if (!stemResponse.ok) {
                    const stemError = await stemResponse.json();
                    throw new Error(`Stem processing failed: ${stemError.detail}`);
                }
                
                const stemData = await stemResponse.json();
                
                // Step 2: Process through master limiter (sum vocal + instrumental)
                showStatus(saveBlendStatus, 'Applying master limiter...');
                
                const limiterFormData = new FormData();
                
                // Get both processed stem outputs
                const vocalChannelResponse = await fetch(`/temp_files/${encodeURIComponent(stemData.vocal_output_path.split('/').pop())}`);
                const instChannelResponse = await fetch(`/temp_files/${encodeURIComponent(stemData.instrumental_output_path.split('/').pop())}`);
                
                const vocalChannelBlob = await vocalChannelResponse.blob();
                const instChannelBlob = await instChannelResponse.blob();
                
                limiterFormData.append('input_files', vocalChannelBlob, 'vocal_channel.wav');
                limiterFormData.append('input_files', instChannelBlob, 'inst_channel.wav');
                limiterFormData.append('gain_adjust_db', currentMasterGain);
                limiterFormData.append('enable_limiter', limiterEnabled);
                
                const limiterResponse = await fetch('/api/process_limiter', {
                    method: 'POST',
                    body: limiterFormData,
                });
                
                if (!limiterResponse.ok) {
                    const limiterError = await limiterResponse.json();
                    throw new Error(`Master limiter failed: ${limiterError.detail}`);
                }
                
                const limiterData = await limiterResponse.json();
                
                // Generate final download information
                const finalFileName = limiterData.master_output_path.split('/').pop();
                const originalFileName = processSingleStatus.dataset.originalFileName;
                const referenceName = processSingleStatus.dataset.referenceName;
                const vocalBlendPercentage = Math.round(vocalBlendRatio * 100);
                const instBlendPercentage = Math.round(instrumentalBlendRatio * 100);
                
                // Generate download filename for stems
                const downloadName = `${originalFileName}-out-${referenceName}-vocal${vocalBlendPercentage}-inst${instBlendPercentage}.wav`;
                
                showStatus(saveBlendStatus, 
                    `Output file: <a href="/download/output/${finalFileName}?download_name=${encodeURIComponent(downloadName)}" target="_blank">${downloadName}</a> (Right Click to Save As)`
                );
            } catch (error) {
                showStatus(saveBlendStatus, `Network error: ${error.message}`, true);
            } finally {
                saveBlendButton.disabled = false;
            }
            
            return;
        }
        
        // Standard processing (non-stem separation) - Use new modular approach
        if (!originalFilePath || !processedFilePath) {
            showStatus(saveBlendStatus, 'Error: No processed files available to blend.', true);
            return;
        }
        
        // Prevent multiple simultaneous save operations
        if (saveBlendButton.disabled) return;
        
        saveBlendButton.disabled = true;
        showStatus(saveBlendStatus, 'Processing blended audio...');
        
        try {
            // Step 1: Process the channel blend using our modular channel processor
            const channelFormData = new FormData();
            
            // Get the audio files
            const originalResponse = await fetch(`/temp_files/${encodeURIComponent(originalFilePath.split('/').pop())}`);
            const processedResponse = await fetch(`/temp_files/${encodeURIComponent(processedFilePath.split('/').pop())}`);
            
            const originalBlob = await originalResponse.blob();
            const processedBlob = await processedResponse.blob();
            
            channelFormData.append('original_file', originalBlob, 'original.wav');
            channelFormData.append('processed_file', processedBlob, 'processed.wav');
            channelFormData.append('blend_ratio', currentBlendValue / 100);
            channelFormData.append('volume_adjust_db', 0); // No volume adjustment in non-stem mode
            channelFormData.append('mute', false);
            
            showStatus(saveBlendStatus, 'Processing channel blend...');
            
            const channelResponse = await fetch('/api/process_channel', {
                method: 'POST',
                body: channelFormData,
            });
            
            if (!channelResponse.ok) {
                const channelError = await channelResponse.json();
                throw new Error(`Channel processing failed: ${channelError.detail}`);
            }
            
            const channelData = await channelResponse.json();
            
            // Step 2: Process through master limiter
            showStatus(saveBlendStatus, 'Applying master limiter...');
            
            const limiterFormData = new FormData();
            
            // Get the blended channel output
            const blendedResponse = await fetch(`/temp_files/${encodeURIComponent(channelData.channel_output_path.split('/').pop())}`);
            const blendedBlob = await blendedResponse.blob();
            
            limiterFormData.append('input_files', blendedBlob, 'blended.wav');
            limiterFormData.append('gain_adjust_db', currentMasterGain);
            limiterFormData.append('enable_limiter', limiterEnabled);
            
            const limiterResponse = await fetch('/api/process_limiter', {
                method: 'POST',
                body: limiterFormData,
            });
            
            if (!limiterResponse.ok) {
                const limiterError = await limiterResponse.json();
                throw new Error(`Master limiter failed: ${limiterError.detail}`);
            }
            
            const limiterData = await limiterResponse.json();
            
            // Generate final download information
            const finalFileName = limiterData.master_output_path.split('/').pop();
            const originalFileName = processSingleStatus.dataset.originalFileName;
            const referenceName = processSingleStatus.dataset.referenceName;
            const blendPercentage = currentBlendValue;
            
            // Generate download filename
            const downloadName = `${originalFileName}-out-${referenceName}-blend${blendPercentage}.wav`;
            
            showStatus(saveBlendStatus, 
                `Output file: <a href="/download/output/${finalFileName}?download_name=${encodeURIComponent(downloadName)}" target="_blank">${downloadName}</a> (Right Click to Save As)`
            );
            
        } catch (error) {
            showStatus(saveBlendStatus, `Error: ${error.message}`, true);
        } finally {
            saveBlendButton.disabled = false;
        }
    });

    // --- Batch Processing Section ---
    const processBatchForm = document.getElementById('process-batch-form');
    const processBatchStatus = document.getElementById('process-batch-status');
    const batchFileList = document.getElementById('batch-file-list');
    const batchFilesContainer = document.getElementById('batch-files-container');
    const batchBlendRatio = document.getElementById('batch-blend-ratio');

    // Add validation for batch blend ratio input
    batchBlendRatio.addEventListener('input', function() {
        // Remove any non-numeric characters except for temporary input states
        let value = this.value.replace(/[^0-9]/g, '');
        
        // Convert to number and clamp between 0-100
        if (value !== '') {
            let numValue = parseInt(value);
            if (numValue < 0) numValue = 0;
            if (numValue > 100) numValue = 100;
            this.value = numValue;
        }
    });

    // Also validate on blur to handle edge cases
    batchBlendRatio.addEventListener('blur', function() {
        if (this.value === '' || isNaN(this.value)) {
            this.value = 100; // Default to 100 if invalid
        } else {
            let numValue = parseInt(this.value);
            if (numValue < 0) numValue = 0;
            if (numValue > 100) numValue = 100;
            this.value = numValue;
        }
    });

    // Add event listener to show file list when files are selected
    document.getElementById('batch-target-files').addEventListener('change', function() {
        const targetFiles = this.files;
        if (targetFiles.length > 0) {
            createFileList(targetFiles);
            batchFileList.style.display = 'block';
        } else {
            batchFileList.style.display = 'none';
        }
    });

    processBatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processBatchStatus, 'Starting batch processing...');
        
        const formData = new FormData();
        formData.append('preset_file', document.getElementById('batch-preset-file').files[0]);
        formData.append('blend_ratio', batchBlendRatio.value / 100); // Convert to 0-1 range
        formData.append('apply_limiter', batchLimiterEnabled); // Send limiter status
        const targetFiles = document.getElementById('batch-target-files').files;
        for (let i = 0; i < targetFiles.length; i++) {
            formData.append('target_files', targetFiles[i]);
        }

        try {
            const response = await fetch('/api/process_batch', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(processBatchStatus, `Batch processing started.`);
                pollBatchStatus(data.batch_id);
            } else {
                showStatus(processBatchStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processBatchStatus, `Network error: ${error.message}`, true);
        }
    });

    // Create file list with initial pending status
    function createFileList(files) {
        batchFilesContainer.innerHTML = '';
        for (let i = 0; i < files.length; i++) {
            const fileDiv = document.createElement('div');
            fileDiv.className = 'd-flex align-items-center gap-2 mb-2';
            fileDiv.id = `batch-file-${i}`;
            
            const statusIcon = document.createElement('span');
            statusIcon.className = 'batch-file-status';
            statusIcon.innerHTML = '☐'; // Empty checkbox
            statusIcon.style.fontSize = '16px';
            statusIcon.style.color = '#6c757d';
            
            const fileName = document.createElement('span');
            fileName.className = 'batch-file-name';
            fileName.textContent = files[i].name;
            fileName.style.color = '#f8f9fa';
            
            fileDiv.appendChild(statusIcon);
            fileDiv.appendChild(fileName);
            batchFilesContainer.appendChild(fileDiv);
        }
    }

    // Poll Batch Status
    async function pollBatchStatus(batchId) {
        let lastProcessedCount = 0;
        
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/batch_status/${batchId}`);
                const data = await response.json();

                // Update file statuses
                if (data.processed_count > lastProcessedCount) {
                    // Mark completed files
                    for (let i = lastProcessedCount; i < data.processed_count; i++) {
                        updateFileStatus(i, 'completed', data.output_files[i]);
                    }
                    
                    // Mark current file as processing (if not the last one)
                    if (data.processed_count < data.total_count) {
                        updateFileStatus(data.processed_count, 'processing');
                    }
                    
                    lastProcessedCount = data.processed_count;
                } else if (data.processed_count === 0 && lastProcessedCount === 0) {
                    // Mark first file as processing when batch just started
                    updateFileStatus(0, 'processing');
                }

                if (data.status === 'completed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, 'Batch processing completed: Right Click to Save As');
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
                }
            } catch (error) {
                clearInterval(interval);
                showStatus(processBatchStatus, `Network error: ${error.message}`, true);
            }
        }, 2000); // Poll every 2 seconds
    }

    // --- Stem Separation Section ---
    const stemSeparationForm = document.getElementById('stem-separation-form');
    const stemSeparationStatus = document.getElementById('stem-separation-status');
    const stemSeparationResults = document.getElementById('stem-separation-results');
    const stemDownloadLinks = document.getElementById('stem-download-links');

    if (stemSeparationForm) {
        stemSeparationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            showStatus(stemSeparationStatus, 'Starting stem separation...');
            stemSeparationResults.style.display = 'none';

            const formData = new FormData();
            const audioFile = document.getElementById('stem-audio-file').files[0];
            formData.append('audio_file', audioFile);

            try {
                const response = await fetch('/api/separate_stems', {
                    method: 'POST',
                    body: formData,
                });
                const data = await response.json();
                
                if (response.ok && data.job_id) {
                    // Start polling for progress
                    const pollInterval = setInterval(async () => {
                        try {
                            const progressResponse = await fetch(`/api/progress/${data.job_id}`);
                            
                            if (progressResponse.ok) {
                                const progressData = await progressResponse.json();
                                
                                // Update status with progress
                                showStatus(stemSeparationStatus, progressData.message);
                                
                                // Check if complete
                                if (progressData.stage === 'complete') {
                                    clearInterval(pollInterval);
                                    showStatus(stemSeparationStatus, 'Stems separated successfully!');
                                    
                                    // Create download links
                                    stemDownloadLinks.innerHTML = '';
                                    
                                    // Vocal stem link
                                    const vocalLink = document.createElement('a');
                                    vocalLink.href = `/temp_files/${progressData.vocal_path.split('/').pop()}?download_name=${encodeURIComponent(progressData.vocal_filename)}`;
                                    vocalLink.className = 'btn btn-success btn-sm';
                                    vocalLink.innerHTML = '🎤 Download Vocal Stem';
                                    vocalLink.download = progressData.vocal_filename;
                                    vocalLink.title = progressData.vocal_filename;
                                    
                                    // Instrumental stem link
                                    const instrumentalLink = document.createElement('a');
                                    instrumentalLink.href = `/temp_files/${progressData.instrumental_path.split('/').pop()}?download_name=${encodeURIComponent(progressData.instrumental_filename)}`;
                                    instrumentalLink.className = 'btn btn-info btn-sm';
                                    instrumentalLink.innerHTML = '🎹 Download Instrumental Stem';
                                    instrumentalLink.download = progressData.instrumental_filename;
                                    instrumentalLink.title = progressData.instrumental_filename;
                                    
                                    stemDownloadLinks.appendChild(vocalLink);
                                    stemDownloadLinks.appendChild(instrumentalLink);
                                    
                                    // Show results section
                                    stemSeparationResults.style.display = 'block';
                                } else if (progressData.stage === 'error') {
                                    clearInterval(pollInterval);
                                    showStatus(stemSeparationStatus, `Error: ${progressData.message}`, true);
                                }
                            } else if (progressResponse.status === 404) {
                                // Job not found, stop polling
                                clearInterval(pollInterval);
                                showStatus(stemSeparationStatus, 'Job not found. Please try again.', true);
                            }
                        } catch (progressError) {
                            console.error('Progress polling error:', progressError);
                            // Continue polling on error
                        }
                    }, 1000); // Poll every second
                    
                    // Set timeout to stop polling after 10 minutes
                    setTimeout(() => {
                        clearInterval(pollInterval);
                        showStatus(stemSeparationStatus, 'Processing timeout. Please try again.', true);
                    }, 600000);
                } else {
                    showStatus(stemSeparationStatus, `Error: ${data.detail || 'Unknown error'}`, true);
                }
            } catch (error) {
                showStatus(stemSeparationStatus, `Network error: ${error.message}`, true);
            }
        });
    }

    // Update file status in the list
    function updateFileStatus(fileIndex, status, outputPath = null) {
        const fileDiv = document.getElementById(`batch-file-${fileIndex}`);
        if (!fileDiv) return;

        const statusIcon = fileDiv.querySelector('.batch-file-status');
        const fileName = fileDiv.querySelector('.batch-file-name');

        switch (status) {
            case 'processing':
                statusIcon.innerHTML = '⏳'; // Hourglass
                statusIcon.style.color = '#ffc107'; // Warning yellow
                break;
            case 'completed':
                statusIcon.innerHTML = '✅'; // Checkmark
                statusIcon.style.color = '#28a745'; // Success green
                
                if (outputPath) {
                    // Convert filename to download link
                    const outputFilename = outputPath.split('/').pop();
                    const link = document.createElement('a');
                    link.href = `/download/output/${outputFilename}`;
                    link.target = '_blank';
                    link.textContent = outputFilename;
                    link.className = 'text-light';
                    link.style.textDecoration = 'none';
                    
                    // Replace filename with download link
                    fileName.innerHTML = '';
                    fileName.appendChild(link);
                }
                break;
        }
    }
});
