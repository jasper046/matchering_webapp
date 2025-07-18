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

    // --- Blend Presets Section ---
    const blendPresetsForm = document.getElementById('blend-presets-form');
    const blendPresetsStatus = document.getElementById('blend-presets-status');
    blendPresetsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(blendPresetsStatus, 'Blending presets...');

        const formData = new FormData();
        const presetFiles = document.getElementById('preset-files').files;
        for (let i = 0; i < presetFiles.length; i++) {
            formData.append('preset_files', presetFiles[i]);
        }
        formData.append('new_preset_name', document.getElementById('new-preset-name').value);

        try {
            const response = await fetch('/api/blend_presets', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(blendPresetsStatus, `Blended preset saved: <a href="/download/preset/${data.blended_preset_path.split('/').pop()}?download_name=${encodeURIComponent(data.blended_preset_path.split('/').pop())}" target="_blank">${data.blended_preset_path.split('/').pop()}</a>`);
            } else {
                showStatus(blendPresetsStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(blendPresetsStatus, `Network error: ${error.message}`, true);
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
const useStemSeparation = document.getElementById('use-stem-separation');    const vocalPresetFileSingleDiv = document.getElementById('vocal-preset-file-single-div');    const instrumentalPresetFileSingleDiv = document.getElementById('instrumental-preset-file-single-div');

    let audioContext;
    let originalSourceNode;
    let processedSourceNode;
    let gainOriginal;
    let gainProcessed;
    let originalBuffer;
    let processedBuffer;
    let playbackTime = 0;
    let startTime = 0;
    let isPlaying = false;
    let animationFrameId; // For play position indicator
    let currentBlendValue = 50; // Current blend value (0-100)
    let isDragging = false;
    let dragStartY = 0;
    let dragStartValue = 0;
    let isUpdatingPreview = false; // Prevent multiple simultaneous preview updates

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
                showStatus(processSingleStatus, `${progress.message} (${progress.progress}%)`);
                
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
                    
                } else if (progress.stage === 'error') {
                    clearInterval(pollInterval);
                    showStatus(processSingleStatus, progress.message, true);
                }
            } catch (error) {
                console.error('Error polling progress:', error);
                clearInterval(pollInterval);
                showStatus(processSingleStatus, 'Error polling progress', true);
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
                        pollProgress(data.job_id);
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
                    
                    // Store preset information if created from reference
                    if (data.created_preset_path) {
                        processSingleStatus.dataset.createdPresetPath = data.created_preset_path;
                        processSingleStatus.dataset.createdPresetFilename = data.created_preset_filename;
                    }
                    
                    // Initialize with preview system
                    updateAudioPreview();
                    
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
        }
    });


    function playAudio() {
        if (isPlaying) return; // Already playing
        if (!audioContext || !gainOriginal) return; // No audio context set up
        
        const activeBuffer = window.previewBuffer || originalBuffer;
        if (!activeBuffer) return; // No audio buffer available

        // Stop any existing sources before creating new ones
        if (originalSourceNode) {
            originalSourceNode.stop();
            originalSourceNode.disconnect();
        }

        // Create new source for preview audio (use the blended+limited result)
        originalSourceNode = audioContext.createBufferSource();
        originalSourceNode.buffer = activeBuffer;
        originalSourceNode.connect(gainOriginal);

        // Start from current playbackTime
        originalSourceNode.start(0, playbackTime);

        startTime = audioContext.currentTime - playbackTime;
        isPlaying = true;
        updatePlaybackButtons('play');
        updatePlayPosition();
    }

    function pauseAudio() {
        if (!isPlaying || !audioContext) return;

        if (originalSourceNode) {
            originalSourceNode.stop();
        }
        playbackTime = audioContext.currentTime - startTime;
        isPlaying = false;
        updatePlaybackButtons('pause');
        cancelAnimationFrame(animationFrameId);
    }

    function stopAudio() {
        if (isPlaying && originalSourceNode) {
            originalSourceNode.stop();
        }
        playbackTime = 0;
        startTime = 0;
        isPlaying = false;
        updatePlaybackButtons('stop');
        cancelAnimationFrame(animationFrameId);
        drawPlayPosition(0); // Reset play position line
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
        
        // Set canvas size
        canvas.width = 60;
        canvas.height = 60;
        
        // Add event listeners
        canvas.addEventListener('mousedown', startDrag);
        
        // Add touch events for mobile
        canvas.addEventListener('touchstart', startDragTouch);
        
        // Initial draw
        drawKnob();
    }
    
    // Dual knob system for stem separation
    let currentVocalBlend = 50;
    let currentInstrumentalBlend = 50;
    let isDraggingVocal = false;
    let isDraggingInstrumental = false;
    
    function initializeDualKnobs() {
        const vocalKnob = document.getElementById('vocal-blend-knob');
        const instrumentalKnob = document.getElementById('instrumental-blend-knob');
        
        if (!vocalKnob || !instrumentalKnob) return;
        
        // Set canvas sizes
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
        
        // Initial draw
        drawDualKnobs();
        
        // Store globally for save function
        window.currentVocalBlend = currentVocalBlend;
        window.currentInstrumentalBlend = currentInstrumentalBlend;
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
        if (!isDraggingVocal && !isDraggingInstrumental) return;
        
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
        updateDualStemMix();
    }
    
    function handleDualKnobMoveTouch(e) {
        if (!isDraggingVocal && !isDraggingInstrumental) return;
        e.preventDefault();
        
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
        updateDualStemMix();
    }
    
    function stopDualKnobDrag() {
        isDraggingVocal = false;
        isDraggingInstrumental = false;
        document.getElementById('vocal-blend-knob').style.cursor = 'grab';
        document.getElementById('instrumental-blend-knob').style.cursor = 'grab';
    }
    
    function drawDualKnobs() {
        drawKnobOnCanvas('vocal-blend-knob', currentVocalBlend);
        drawKnobOnCanvas('instrumental-blend-knob', currentInstrumentalBlend);
    }
    
    function drawKnobOnCanvas(canvasId, value) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = 25;
        
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
        
        // Draw percentage text
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(Math.round(value) + '%', centerX, centerY + 3);
    }
    
    function updateDualStemMix() {
        // Update the mixed buffer with new blend ratios
        if (window.previewBuffer) {
            const newMixedBuffer = createMixedBuffer(currentVocalBlend / 100, currentInstrumentalBlend / 100);
            window.previewBuffer = newMixedBuffer;
            originalBuffer = newMixedBuffer;
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
            updateAudioPreviewAsync();
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
            updateAudioPreviewAsync();
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
        if (!audioContext || !gainOriginal || !gainProcessed) return;

        const blendValue = currentBlendValue / 100; // 0 to 1
        gainOriginal.gain.value = 1 - blendValue;
        gainProcessed.gain.value = blendValue;
    }

    // Draw waveform visualization
    function drawWaveform(canvas, buffer, color) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = 100;
        
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

    // Seek audio to specific position
    function seekAudio(event) {
        const activeBuffer = window.previewBuffer || originalBuffer;
        if (!activeBuffer) return;
        
        const canvas = event.target;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const clickPosition = x / canvas.offsetWidth;
        
        // Calculate new playback time
        const newTime = clickPosition * activeBuffer.duration;
        
        // Remember if we were playing
        const wasPlaying = isPlaying;
        
        // Stop current playback
        if (isPlaying) {
            if (originalSourceNode) {
                originalSourceNode.stop();
                originalSourceNode.disconnect();
            }
            isPlaying = false;
            cancelAnimationFrame(animationFrameId);
        }
        
        // Set new playback position
        playbackTime = newTime;
        
        // Update visual position
        drawPlayPosition(clickPosition);
        
        // Resume playback if it was playing
        if (wasPlaying) {
            playAudio();
        }
    }

    // Draw play position indicator
    function drawPlayPosition(position) {
        const isStemSeparation = processSingleStatus.dataset.isStemSeparation === 'true';
        
        let canvases = [];
        
        if (isStemSeparation) {
            // Use stem waveform canvases
            canvases = [
                document.getElementById('vocal-original-waveform'),
                document.getElementById('vocal-processed-waveform'),
                document.getElementById('instrumental-original-waveform'),
                document.getElementById('instrumental-processed-waveform')
            ];
        } else {
            // Use standard waveform canvases
            canvases = [
                document.getElementById('original-waveform'),
                document.getElementById('processed-waveform')
            ];
        }
        
        canvases.forEach(canvas => {
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            // Redraw the waveform first
            if (isStemSeparation) {
                // For stem separation, use the individual stem buffers (STATIC - don't change on blend)
                let buffer = null;
                let color = '#007bff';
                
                if (canvas.id.includes('vocal-original')) {
                    buffer = window.targetVocalBuffer;
                    color = '#007bff';
                } else if (canvas.id.includes('vocal-processed')) {
                    buffer = window.processedVocalBuffer;
                    color = '#28a745';
                } else if (canvas.id.includes('instrumental-original')) {
                    buffer = window.targetInstrumentalBuffer;
                    color = '#6f42c1';
                } else if (canvas.id.includes('instrumental-processed')) {
                    buffer = window.processedInstrumentalBuffer;
                    color = '#fd7e14';
                }
                
                if (buffer) {
                    drawWaveform(canvas, buffer, color);
                }
            } else {
                // Standard waveform redraw
                if (canvas.id === 'original-waveform' && originalBuffer) {
                    drawWaveform(canvas, originalBuffer, '#007bff');
                } else if (canvas.id === 'processed-waveform' && processedBuffer) {
                    drawWaveform(canvas, processedBuffer, '#28a745');
                }
            }
            
            // Draw position line
            const x = position * width;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        });
    }

    // Update play position during playback
    function updatePlayPosition() {
        const activeBuffer = window.previewBuffer || originalBuffer;
        if (!isPlaying || !activeBuffer) return;
        
        const currentTime = audioContext.currentTime - startTime;
        const position = currentTime / activeBuffer.duration;
        
        if (position >= 1) {
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
    async function updateAudioPreviewAsync() {
        const originalFilePath = processSingleStatus.dataset.originalFilePath;
        const processedFilePath = processSingleStatus.dataset.processedFilePath;
        
        if (!originalFilePath || !processedFilePath || isUpdatingPreview) return;
        
        isUpdatingPreview = true;
        
        // Remember current playback state and position
        const wasPlaying = isPlaying;
        let currentTime = playbackTime;
        
        // Always pause playback during processing to prevent glitches
        if (isPlaying) {
            // Calculate the actual current position during playback
            currentTime = audioContext.currentTime - startTime;
            
            if (originalSourceNode) {
                originalSourceNode.stop();
                originalSourceNode.disconnect();
            }
            isPlaying = false;
            cancelAnimationFrame(animationFrameId);
            updatePlaybackButtons('pause');
        }
        
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
                // Update only the preview buffer
                const previewUrl = `/temp_files/${data.preview_file_path.split('/').pop()}`;
                const fetchAudio = async (url) => {
                    const response = await fetch(url);
                    const arrayBuffer = await response.arrayBuffer();
                    return await audioContext.decodeAudioData(arrayBuffer);
                };
                
                // Update the preview buffer
                window.previewBuffer = await fetchAudio(previewUrl);
                
                // Resume playback at the exact position if it was playing
                if (wasPlaying) {
                    playbackTime = currentTime;
                    playAudio();
                }
            }
        } catch (error) {
            console.error('Error updating audio preview:', error);
            // If there was an error, set playback buttons back to stopped state
            updatePlaybackButtons('stop');
        } finally {
            isUpdatingPreview = false;
        }
    }

    // Setup audio context for preview (single blended file)
    async function setupPreviewAudioContext(previewUrl) {
        if (audioContext) {
            audioContext.close();
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        const fetchAudio = async (url) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        };

        // Load the preview audio (this is the blended + limited result for playback)
        const previewBuffer = await fetchAudio(previewUrl);
        
        // Also load the original files for waveform display
        const originalFilePath = processSingleStatus.dataset.originalFilePath;
        const processedFilePath = processSingleStatus.dataset.processedFilePath;
        
        originalBuffer = await fetchAudio(`/temp_files/${originalFilePath.split('/').pop()}`);
        processedBuffer = await fetchAudio(`/temp_files/${processedFilePath.split('/').pop()}`);

        // Create gain node for preview playback
        gainOriginal = audioContext.createGain();
        gainOriginal.connect(audioContext.destination);
        gainOriginal.gain.value = 1; // Full volume for preview
        
        // Store the preview buffer for actual playback
        window.previewBuffer = previewBuffer;

        // Initialize knob if not already done
        if (!blendKnobCanvas.dataset.initialized) {
            initializeKnob();
            blendKnobCanvas.dataset.initialized = 'true';
        }

        // Draw waveforms (original and processed, not the blended result)
        drawWaveform(document.getElementById('original-waveform'), originalBuffer, '#007bff');
        drawWaveform(document.getElementById('processed-waveform'), processedBuffer, '#28a745');
        
        // Add click listeners for seeking
        document.getElementById('original-waveform').addEventListener('click', seekAudio);
        document.getElementById('processed-waveform').addEventListener('click', seekAudio);
        
        // Reset playback buttons to initial state
        updatePlaybackButtons('stop');
    }

    // Create mixed buffer from individual stems
    function createMixedBuffer(vocalBlend, instrumentalBlend) {
        if (!window.targetVocalBuffer || !window.processedVocalBuffer || 
            !window.targetInstrumentalBuffer || !window.processedInstrumentalBuffer) {
            return null;
        }
        
        // Get blended vocal and instrumental tracks
        const vocalBuffer = blendStemBuffers(window.targetVocalBuffer, window.processedVocalBuffer, vocalBlend);
        const instrumentalBuffer = blendStemBuffers(window.targetInstrumentalBuffer, window.processedInstrumentalBuffer, instrumentalBlend);
        
        // Mix vocal and instrumental together
        const mixedBuffer = audioContext.createBuffer(2, vocalBuffer.length, vocalBuffer.sampleRate);
        const vocalData = vocalBuffer.getChannelData(0);
        const instrumentalData = instrumentalBuffer.getChannelData(0);
        
        for (let channel = 0; channel < mixedBuffer.numberOfChannels; channel++) {
            const outputData = mixedBuffer.getChannelData(channel);
            const vocalChannelData = vocalBuffer.getChannelData(Math.min(channel, vocalBuffer.numberOfChannels - 1));
            const instrumentalChannelData = instrumentalBuffer.getChannelData(Math.min(channel, instrumentalBuffer.numberOfChannels - 1));
            
            for (let i = 0; i < outputData.length; i++) {
                outputData[i] = vocalChannelData[i] + instrumentalChannelData[i];
            }
        }
        
        return mixedBuffer;
    }
    
    // Blend two stem buffers based on blend ratio
    function blendStemBuffers(originalBuffer, processedBuffer, blendRatio) {
        const blendedBuffer = audioContext.createBuffer(
            originalBuffer.numberOfChannels,
            originalBuffer.length,
            originalBuffer.sampleRate
        );
        
        for (let channel = 0; channel < blendedBuffer.numberOfChannels; channel++) {
            const blendedData = blendedBuffer.getChannelData(channel);
            const originalData = originalBuffer.getChannelData(channel);
            const processedData = processedBuffer.getChannelData(channel);
            
            for (let i = 0; i < blendedData.length; i++) {
                blendedData[i] = originalData[i] * (1 - blendRatio) + processedData[i] * blendRatio;
            }
        }
        
        return blendedBuffer;
    }

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
            // Set up audio context if not already done
            if (audioContext) {
                audioContext.close();
            }
            audioContext = new (window.AudioContext || window.webkitAudioContext)();

            const fetchAudio = async (url) => {
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                return await audioContext.decodeAudioData(arrayBuffer);
            };

            // Load individual stem files for waveform display and real-time mixing
            const targetVocalBuffer = await fetchAudio(`/temp_files/${targetVocalPath.split('/').pop()}`);
            const targetInstrumentalBuffer = await fetchAudio(`/temp_files/${targetInstrumentalPath.split('/').pop()}`);
            const processedVocalBuffer = await fetchAudio(`/temp_files/${processedVocalPath.split('/').pop()}`);
            const processedInstrumentalBuffer = await fetchAudio(`/temp_files/${processedInstrumentalPath.split('/').pop()}`);
            
            // Store buffers globally for real-time mixing
            window.targetVocalBuffer = targetVocalBuffer;
            window.targetInstrumentalBuffer = targetInstrumentalBuffer;
            window.processedVocalBuffer = processedVocalBuffer;
            window.processedInstrumentalBuffer = processedInstrumentalBuffer;
            
            // Get canvas elements
            const vocalOriginalCanvas = document.getElementById('vocal-original-waveform');
            const vocalProcessedCanvas = document.getElementById('vocal-processed-waveform');
            const instrumentalOriginalCanvas = document.getElementById('instrumental-original-waveform');
            const instrumentalProcessedCanvas = document.getElementById('instrumental-processed-waveform');

            // Draw individual stem waveforms
            drawWaveform(vocalOriginalCanvas, targetVocalBuffer, '#007bff');
            drawWaveform(vocalProcessedCanvas, processedVocalBuffer, '#28a745');
            drawWaveform(instrumentalOriginalCanvas, targetInstrumentalBuffer, '#6f42c1');
            drawWaveform(instrumentalProcessedCanvas, processedInstrumentalBuffer, '#fd7e14');

            // Create gain nodes for stem mixing
            gainOriginal = audioContext.createGain();
            gainOriginal.connect(audioContext.destination);
            gainOriginal.gain.value = 1;
            
            // Create initial mixed buffer for playback (50/50 mix)
            const mixedBuffer = createMixedBuffer(0.5, 0.5);
            window.previewBuffer = mixedBuffer;
            originalBuffer = mixedBuffer; // For compatibility with existing playback code

            // Initialize dual knobs for stem separation
            initializeDualKnobs();

            // Add click listeners for seeking on stem waveforms
            [vocalOriginalCanvas, vocalProcessedCanvas, instrumentalOriginalCanvas, instrumentalProcessedCanvas].forEach(canvas => {
                canvas.addEventListener('click', seekAudio);
            });
            
            // Reset playback buttons to initial state
            updatePlaybackButtons('stop');
            
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
            showStatus(saveBlendStatus, 'Saving stem blend...');
            
            const formData = new FormData();
            formData.append('original_vocal_path', targetVocalPath);
            formData.append('processed_vocal_path', processedVocalPath);
            formData.append('original_instrumental_path', targetInstrumentalPath);
            formData.append('processed_instrumental_path', processedInstrumentalPath);
            formData.append('vocal_blend_ratio', vocalBlendRatio);
            formData.append('instrumental_blend_ratio', instrumentalBlendRatio);
            formData.append('apply_limiter', limiterEnabled);
            
            try {
                console.log('Sending blend stems request:', {
                    targetVocalPath, processedVocalPath, 
                    targetInstrumentalPath, processedInstrumentalPath,
                    vocalBlendRatio, instrumentalBlendRatio
                });
                
                const response = await fetch('/api/blend_stems_and_save', {
                    method: 'POST',
                    body: formData,
                });
                
                console.log('Response status:', response.status);
                const data = await response.json();
                
                if (response.ok) {
                    const outputFilename = data.blended_file_path.split('/').pop();
                    
                    // Create meaningful filename from original target filename
                    const targetFilename = processSingleStatus.dataset.originalFileName || 'audio';
                    const baseFilename = targetFilename.replace(/\.[^/.]+$/, ''); // Remove extension
                    const downloadName = `${baseFilename}_stem_blend_v${Math.round(vocalBlendRatio * 100)}_i${Math.round(instrumentalBlendRatio * 100)}.wav`;
                    
                    showStatus(saveBlendStatus, 
                        `Output file: <a href="/temp_files/${outputFilename}?download_name=${encodeURIComponent(downloadName)}" target="_blank">${downloadName}</a> (Right Click to Save As)`
                    );
                } else {
                    showStatus(saveBlendStatus, `Error saving stem blend: ${data.detail}`, true);
                }
            } catch (error) {
                showStatus(saveBlendStatus, `Network error: ${error.message}`, true);
            } finally {
                saveBlendButton.disabled = false;
            }
            
            return;
        }
        
        // Standard processing (non-stem separation)
        const originalFilePath = processSingleStatus.dataset.originalFilePath;
        const processedFilePath = processSingleStatus.dataset.processedFilePath;
        
        if (!originalFilePath || !processedFilePath) {
            showStatus(saveBlendStatus, 'Error: No processed files available to blend.', true);
            return;
        }
        
        // Prevent multiple simultaneous save operations
        if (saveBlendButton.disabled) return;
        
        saveBlendButton.disabled = true;
        showStatus(saveBlendStatus, 'Saving blended audio...');
        
        const formData = new FormData();
        formData.append('original_path', originalFilePath);
        formData.append('processed_path', processedFilePath);
        formData.append('blend_ratio', currentBlendValue / 100);
        formData.append('apply_limiter', limiterEnabled);
        
        try {
            const response = await fetch('/api/blend_and_save', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            
            if (response.ok) {
                const blendedFileName = data.blended_file_path.split('/').pop();
                const originalFileName = processSingleStatus.dataset.originalFileName;
                const referenceName = processSingleStatus.dataset.referenceName;
                const blendPercentage = currentBlendValue;
                
                // Generate download filename
                const downloadName = `${originalFileName}-out-${referenceName}-blend${blendPercentage}.wav`;
                
                showStatus(saveBlendStatus, 
                    `Output file: <a href="/download/output/${blendedFileName}?download_name=${encodeURIComponent(downloadName)}" target="_blank">${downloadName}</a> (Right Click to Save As)`
                );
            } else {
                showStatus(saveBlendStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(saveBlendStatus, `Network error: ${error.message}`, true);
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
                                showStatus(stemSeparationStatus, `${progressData.message} (${progressData.progress}%)`);
                                
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
