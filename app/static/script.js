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
    const blendSlider = document.getElementById('blend-slider');
    const blendedPlayer = document.getElementById('blended-player');
    const saveBlendButton = document.getElementById('save-blend-button');
    const saveBlendStatus = document.getElementById('save-blend-status');

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
            referenceName = refFile.name.split('.').slice(0, -1).join('.').substring(0, 5); // Cap at 5 chars
        }
        else if (radioPreset.checked) {
            const presetFile = presetFileSingle.files[0];
            formData.append('preset_file', presetFile);
            referenceName = presetFile.name.split('.').slice(0, -1).join('.').substring(0, 5); // Cap at 5 chars
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
                setupAudioContext(
                    `/temp_files/${data.original_file_path.split('/').pop()}`,
                    `/temp_files/${data.processed_file_path.split('/').pop()}`
                );
            } else {
                showStatus(processSingleStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processSingleStatus, `Network error: ${error.message}`, true);
        }
    });

    // Setup Web Audio API for blending
    async function setupAudioContext(originalUrl, processedUrl) {
        if (audioContext) {
            audioContext.close();
        }
        audioContext = new (window.AudioContext || window.webkitAudioContext)();

        // Fetch audio files
        const fetchAudio = async (url) => {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            return await audioContext.decodeAudioData(arrayBuffer);
        };

        originalBuffer = await fetchAudio(originalUrl);
        processedBuffer = await fetchAudio(processedUrl);

        // Create sources and gain nodes
        // These are created and connected in playAudio() to allow for multiple play/pause cycles
        gainOriginal = audioContext.createGain();
        gainProcessed = audioContext.createGain();

        gainOriginal.connect(audioContext.destination);
        gainProcessed.connect(audioContext.destination);

        // Initial blend setting
        updateBlend();

        // Draw waveforms
        drawWaveform(document.getElementById('original-waveform'), originalBuffer, '#007bff');
        drawWaveform(document.getElementById('processed-waveform'), processedBuffer, '#28a745');
    }

    function playAudio() {
        if (isPlaying) return; // Already playing

        // Create new sources each time play is pressed
        originalSourceNode = audioContext.createBufferSource();
        originalSourceNode.buffer = originalBuffer;
        originalSourceNode.connect(gainOriginal);

        processedSourceNode = audioContext.createBufferSource();
        processedSourceNode.buffer = processedBuffer;
        processedSourceNode.connect(gainProcessed);

        // Start from current playbackTime
        originalSourceNode.start(0, playbackTime);
        processedSourceNode.start(0, playbackTime);

        startTime = audioContext.currentTime - playbackTime;
        isPlaying = true;
        updatePlaybackButtons('play');
        updatePlayPosition();
    }

    function pauseAudio() {
        if (!isPlaying) return;

        originalSourceNode.stop();
        processedSourceNode.stop();
        playbackTime = audioContext.currentTime - startTime;
        isPlaying = false;
        updatePlaybackButtons('pause');
        cancelAnimationFrame(animationFrameId);
    }

    function stopAudio() {
        if (isPlaying) {
            originalSourceNode.stop();
            processedSourceNode.stop();
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

    function updateBlend() {
        if (!audioContext || !gainOriginal || !gainProcessed) return;

        const blendValue = blendSlider.value / 100; // 0 to 1
        gainOriginal.gain.value = 1 - blendValue;
        gainProcessed.gain.value = blendValue;
    }

    blendSlider.addEventListener('input', updateBlend);

    // Save Blended Audio
    saveBlendButton.addEventListener('click', async () => {
        showStatus(saveBlendStatus, 'Generating output file...');

        const originalFilePathFromBackend = processSingleStatus.dataset.originalFilePath;
        const processedFilePathFromBackend = processSingleStatus.dataset.processedFilePath;
        const originalFileName = processSingleStatus.dataset.originalFileName;
        const referenceName = processSingleStatus.dataset.referenceName;
        const blendPercentage = blendSlider.value;

        const formData = new FormData();
        formData.append('original_path', originalFilePathFromBackend);
        formData.append('processed_path', processedFilePathFromBackend);
        formData.append('blend_ratio', blendPercentage / 100);

        try {
            const response = await fetch('/api/blend_and_save', {
                method: 'POST',
                body: formData,
            });
            const data = response.json();
            if (response.ok) {
                // Generate suggested filename for blended output
                const suggestedBlendedFilename = `${originalFileName}_out_${referenceName}-blend${blendPercentage}.wav`;

                // Display download link and instruction
                const link = document.createElement('a');
                link.href = `/download/output/${data.blended_file_path.split('/').pop()}?download_name=${encodeURIComponent(suggestedBlendedFilename)}`;
                link.download = suggestedBlendedFilename;
                link.textContent = suggestedBlendedFilename;
                link.className = 'alert-link';

                const instructionText = document.createTextNode(' (Right Click to Save As)');

                saveBlendStatus.innerHTML = ''; // Clear previous status
                saveBlendStatus.appendChild(link);
                saveBlendStatus.appendChild(instructionText);

            } else {
                showStatus(saveBlendStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(saveBlendStatus, `Network error: ${error.message}`, true);
        }
    });

    // Waveform drawing function
    function drawWaveform(canvas, buffer, color) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth; // Set canvas width to its display width
        const height = canvas.height = canvas.offsetHeight; // Set canvas height to its display height
        const data = buffer.getChannelData(0); // Get data from the first channel
        const step = Math.ceil(data.length / width);
        const amp = height / 2;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = color;

        for (let i = 0; i < width; i++) {
            let min = 1.0;
            let max = -1.0;
            for (let j = 0; j < step; j++) {
                const datum = data[(i * step) + j];
                if (datum < min) {
                    min = datum;
                } else if (datum > max) {
                    max = datum;
                }
            }
            ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
        }
    }

    // Function to draw the play position indicator
    function drawPlayPosition(positionX) {
        const originalCanvas = document.getElementById('original-waveform');
        const processedCanvas = document.getElementById('processed-waveform');
        const originalCtx = originalCanvas.getContext('2d');
        const processedCtx = processedCanvas.getContext('2d');

        // Clear previous line (by redrawing the waveform or clearing a small area)
        // For simplicity, we'll just redraw the waveform to clear the line
        drawWaveform(originalCanvas, originalBuffer, '#007bff');
        drawWaveform(processedCanvas, processedBuffer, '#28a745');

        // Draw new line
        originalCtx.strokeStyle = '#dc3545'; // Red color
        originalCtx.lineWidth = 2;
        originalCtx.beginPath();
        originalCtx.moveTo(positionX, 0);
        originalCtx.lineTo(positionX, originalCanvas.height);
        originalCtx.stroke();

        processedCtx.strokeStyle = '#dc3545'; // Red color
        processedCtx.lineWidth = 2;
        processedCtx.beginPath();
        processedCtx.moveTo(positionX, 0);
        processedCtx.lineTo(positionX, processedCanvas.height);
        processedCtx.stroke();
    }

    // Function to update play position during playback
    function updatePlayPosition() {
        if (!isPlaying) return;

        const currentTime = audioContext.currentTime - startTime;
        const duration = originalBuffer.duration; // Assuming both buffers have same duration
        const canvasWidth = document.getElementById('original-waveform').offsetWidth;

        let positionX = (currentTime / duration) * canvasWidth;

        // Loop playback if it reaches the end
        if (currentTime >= duration) {
            playbackTime = 0;
            startTime = audioContext.currentTime;
            positionX = 0;
        }

        drawPlayPosition(positionX);
        animationFrameId = requestAnimationFrame(updatePlayPosition);
    }

    // --- Batch Processing Section ---
    const processBatchForm = document.getElementById('process-batch-form');
    const processBatchStatus = document.getElementById('process-batch-status');
    const batchProgress = document.getElementById('batch-progress');
    const processedCountSpan = document.getElementById('processed-count');
    const totalCountSpan = document.getElementById('total-count');
    const progressBar = document.querySelector('.progress-bar');
    const batchOutputLinks = document.getElementById('batch-output-links');

    processBatchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showStatus(processBatchStatus, 'Starting batch processing...');
        batchProgress.style.display = 'none';
        batchOutputLinks.innerHTML = '';

        const formData = new FormData();
        formData.append('preset_file', document.getElementById('batch-preset-file').files[0]);
        const targetFiles = document.getElementById('batch-target-files').files;
        for (let i = 0; i < targetFiles.length; i++) {
            formData.append('target_files', targetFiles[i]);
        }

        try {
            const response = await fetch('/api/process_batch', {
                method: 'POST',
                body: formData,
            });
            const data = response.json();
            if (response.ok) {
                showStatus(processBatchStatus, `Batch processing started. Job ID: ${data.batch_id}`);
                batchProgress.style.display = 'block';
                pollBatchStatus(data.batch_id);
            } else {
                showStatus(processBatchStatus, `Error: ${data.detail}`, true);
            }
        } catch (error) {
            showStatus(processBatchStatus, `Network error: ${error.message}`, true);
        }
    });

    // Poll Batch Status
    async function pollBatchStatus(batchId) {
        const interval = setInterval(async () => {
            try {
                const response = await fetch(`/api/batch_status/${batchId}`);
                const data = await response.json();

                processedCountSpan.textContent = data.processed_count;
                totalCountSpan.textContent = data.total_count;
                const progress = (data.processed_count / data.total_count) * 100;
                progressBar.style.width = `${progress}%`;
                progressBar.setAttribute('aria-valuenow', progress);
                progressBar.textContent = `${Math.round(progress)}%`;

                if (data.status === 'completed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, 'Batch processing completed!');
                    data.output_files.forEach(filePath => {
                        const filename = filePath.split('/').pop();
                        const link = `<a href="/download/output/${filename}" target="_blank" class="alert-link">${filename}</a><br>`;
                        batchOutputLinks.innerHTML += link;
                    });
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    showStatus(processBatchStatus, `Batch processing failed: ${data.error}`, true);
                }
            } catch (error) {
                clearInterval(interval);
                showStatus(processBatchStatus, `Network error: ${error.message}`, true);
            }
        }, 3000); // Poll every 3 seconds
    }
});