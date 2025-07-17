document.addEventListener('DOMContentLoaded', () => {
    // Helper function to display status messages
    function showStatus(element, message, isError = false) {
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
        const isTargetFileSelected = targetFileSingle.files.length > 0;
        let isReferenceOrPresetSelected = false;

        if (radioReference.checked) {
            isReferenceOrPresetSelected = referenceFileSingle.files.length > 0;
        } else if (radioPreset.checked) {
            isReferenceOrPresetSelected = presetFileSingle.files.length > 0;
        }

        if (isTargetFileSelected && isReferenceOrPresetSelected) {
            processFileButton.style.display = 'block';
        } else {
            processFileButton.style.display = 'none';
        }
    }

    // Step-by-step display logic for Single File Conversion
    targetFileSingle.addEventListener('change', () => {
        processSingleStatus.textContent = ''; // Clear status
        if (targetFileSingle.files.length > 0) {
            referenceTypeSelection.style.display = 'block';
            // Reset radio buttons and hide file inputs when a new target file is selected
            radioReference.checked = false;
            radioPreset.checked = false;
            referenceFileSingleDiv.style.display = 'none';
            presetFileSingleDiv.style.display = 'none';
        } else {
            referenceTypeSelection.style.display = 'none';
            referenceFileSingleDiv.style.display = 'none';
            presetFileSingleDiv.style.display = 'none';
        }
        checkProcessButtonVisibility(); // Check visibility after target file changes
        // Hide results section if target file changes
        singleConversionResults.style.display = 'none';
    });

    // Toggle reference/preset file input for single conversion
    function toggleReferenceInput() {
        processSingleStatus.textContent = ''; // Clear status
        if (radioReference.checked) {
            referenceFileSingleDiv.style.display = 'block';
            referenceFileSingle.setAttribute('required', 'true');
            presetFileSingleDiv.style.display = 'none';
            presetFileSingle.removeAttribute('required');
        } else {
            referenceFileSingleDiv.style.display = 'none';
            referenceFileSingle.removeAttribute('required');
            presetFileSingleDiv.style.display = 'block';
            presetFileSingle.setAttribute('required', 'true');
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

    // Initial check on page load
    checkProcessButtonVisibility();

    // Process Single File Form Submission
    processSingleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processSingleStatus, 'Processing single file...');
        singleConversionResults.style.display = 'none';
        saveBlendStatus.textContent = '';

        const formData = new FormData();
        const targetFile = document.getElementById('target-file-single').files[0];
        formData.append('target_file', targetFile);

        let referenceName = '';
        if (radioReference.checked) {
            const refFile = referenceFileSingle.files[0];
            formData.append('reference_file', refFile);
            referenceName = refFile.name.split('.').slice(0, -1).join('.').substring(0, 8); // Cap at 8 chars
        }
        else if (radioPreset.checked) {
            const presetFile = presetFileSingle.files[0];
            formData.append('preset_file', presetFile);
            referenceName = presetFile.name.split('.').slice(0, -1).join('.').substring(0, 8); // Cap at 8 chars
        }

        // Store original filename and reference name for blended output filename
        processSingleStatus.dataset.originalFileName = targetFile.name.split('.').slice(0, -1).join('.');
        processSingleStatus.dataset.referenceName = referenceName;

        try {
            const response = await fetch('/api/process_single', {
                method: 'POST',
                body: formData,
            });
            const data = await response.json();
            if (response.ok) {
                showStatus(processSingleStatus, 'File processed. Adjust blend below.');
                singleConversionResults.style.display = 'block';
                // Store paths in dataset attributes for later use by saveBlendButton
                processSingleStatus.dataset.originalFilePath = data.original_file_path;
                processSingleStatus.dataset.processedFilePath = data.processed_file_path;
                // Initialize with preview system
                updateAudioPreview();
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
        
        const data = buffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;
        
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        
        for (let i = 0; i < width; i++) {
            const index = i * step;
            if (index >= data.length) break;
            
            // Get max and min values in this section for better visualization
            let min = 0, max = 0;
            for (let j = 0; j < step && index + j < data.length; j++) {
                const value = data[index + j];
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
        const canvases = [
            document.getElementById('original-waveform'),
            document.getElementById('processed-waveform')
        ];
        
        canvases.forEach(canvas => {
            if (!canvas) return;
            
            const ctx = canvas.getContext('2d');
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            
            // Redraw the waveform first
            if (canvas.id === 'original-waveform' && originalBuffer) {
                drawWaveform(canvas, originalBuffer, '#007bff');
            } else if (canvas.id === 'processed-waveform' && processedBuffer) {
                drawWaveform(canvas, processedBuffer, '#28a745');
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

    // Save blend button event listener
    saveBlendButton.addEventListener('click', async () => {
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
                    `Blended audio saved: <a href="/download/output/${blendedFileName}?download_name=${encodeURIComponent(downloadName)}" target="_blank">${downloadName}</a> (Right Click to Save As)`
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
