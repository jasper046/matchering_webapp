document.getElementById('target-file-single').addEventListener('change', () => {
        const processSingleStatus = document.getElementById('process-single-status');
        const singleConversionResults = document.getElementById('single-conversion-results');
        const targetFileSingle = document.getElementById('target-file-single');

        processSingleStatus.textContent = ''; // Clear status
        if (targetFileSingle.files.length > 0) {
            // Show stem separation option first
            document.getElementById('stem-separation-selection').style.display = 'block';
            document.getElementById('reference-type-selection').style.display = 'block';
            // Automatically check radioReference by default for non-stem mode
            document.getElementById('radioReference').checked = true;
            // Trigger the change event for radioReference to update the UI
            const event = new Event('change');
            document.getElementById('radioReference').dispatchEvent(event);
        } else {
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
    });