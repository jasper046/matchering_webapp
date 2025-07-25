
// knob_controls.js

let currentBlendValue = 50; // Current blend value (0-100)
let isDragging = false;
let dragStartY = 0;
let dragStartValue = 0;

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

function initializeKnob() {
    const blendKnobCanvas = document.getElementById('blend-knob');
    if (!blendKnobCanvas) return;

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
            currentBlendValue = value;
            drawKnob();
            window.generateBlendPreview(); // Assuming generateBlendPreview is global or imported
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
        window.updatePreview(); // Trigger preview update
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
            window.updatePreview(); // Trigger preview update
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
            window.updateDualStemMix();
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
            window.updateDualStemMix();
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
            window.updateDualStemMix();
        });
        
        instrumentalGainKnob.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.5 : 0.5;
            currentInstrumentalGain = Math.max(-12, Math.min(12, currentInstrumentalGain + delta));
            document.getElementById('instrumental-gain-value').value = currentInstrumentalGain;
            drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
            window.updateDualStemMix();
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
                window.updateDualStemMix();
            });
        }
        
        if (instrumentalGainInput) {
            instrumentalGainInput.addEventListener('input', function(e) {
                let value = parseFloat(e.target.value) || 0;
                value = Math.max(-12, Math.min(12, value));
                currentInstrumentalGain = value;
                drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                window.updateDualStemMix();
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
            vocalEnableBtn.querySelector('.btn-text').textContent = vocalMuted ? 'MUTE' : 'ON';
            window.updateDualStemMix();
        });
    }
    
    if (instrumentalEnableBtn) {
        instrumentalEnableBtn.addEventListener('click', () => {
            instrumentalMuted = !instrumentalMuted;
            instrumentalEnableBtn.setAttribute('data-enabled', !instrumentalMuted);
            instrumentalEnableBtn.querySelector('.btn-text').textContent = instrumentalMuted ? 'MUTE' : 'ON';
            window.updateDualStemMix();
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
        window.updateDualStemMix();
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
            window.updateDualStemMix();
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
            window.updateDualStemMix();
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
        window.updateDualStemMix();
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
            window.updateDualStemMix();
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
            window.updateDualStemMix();
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
        if (window.isCurrentlyStemMode()) {
            window.updateDualStemMix();
        } else {
            window.generateBlendPreview();
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
        if (window.isCurrentlyStemMode()) {
            window.updateDualStemMix();
        } else {
            window.generateBlendPreview();
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

function updateBlend() {
    // New modular approach: trigger re-processing with current parameters
    if (window.originalFilePath && window.processedFilePath) {
        window.generateBlendPreview();
    }
}

// Export variables and functions that need to be accessed globally
window.initializeKnob = initializeKnob;
window.initializeMasterGainKnob = initializeMasterGainKnob;
window.initializeDualKnobs = initializeDualKnobs;
window.drawKnobOnCanvas = drawKnobOnCanvas;
window.drawGainKnobOnCanvas = drawGainKnobOnCanvas;
window.currentBlendValue = currentBlendValue;
window.currentVocalBlend = currentVocalBlend;
window.currentInstrumentalBlend = currentInstrumentalBlend;
window.currentVocalGain = currentVocalGain;
window.currentInstrumentalGain = currentInstrumentalGain;
window.currentMasterGain = currentMasterGain;
window.vocalMuted = vocalMuted;
window.instrumentalMuted = instrumentalMuted;
            
            if (instrumentalGainInput) {
                instrumentalGainInput.addEventListener('input', function(e) {
                    let value = parseFloat(e.target.value) || 0;
                    value = Math.max(-12, Math.min(12, value));
                    currentInstrumentalGain = value;
                    drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
                    updateDualStemMix();
                });
            }
        
        // Initialize enable buttons
        const vocalEnableBtn = document.getElementById('vocal-enable-btn');
        const instrumentalEnableBtn = document.getElementById('instrumental-enable-btn');
        
        if (vocalEnableBtn) {
            vocalEnableBtn.addEventListener('click', () => {
                vocalMuted = !vocalMuted;
                vocalEnableBtn.setAttribute('data-enabled', !vocalMuted);
                vocalEnableBtn.querySelector('.btn-text').textContent = vocalMuted ? 'MUTE' : 'ON';
                updateDualStemMix();
            });
        }
        
        if (instrumentalEnableBtn) {
            instrumentalEnableBtn.addEventListener('click', () => {
                instrumentalMuted = !instrumentalMuted;
                instrumentalEnableBtn.setAttribute('data-enabled', !instrumentalMuted);
                instrumentalEnableBtn.querySelector('.btn-text').textContent = instrumentalMuted ? 'MUTE' : 'ON';
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
            if (isCurrentlyStemMode()) {
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
            if (isCurrentlyStemMode()) {
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
        // Check if JIT processing is available and ready for stem mode
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            // Use JIT processing - just update parameters, no file generation needed
            const params = {
                isStemMode: true,
                vocalBlendRatio: currentVocalBlend / 100.0,
                vocalGain: currentVocalGain,
                vocalMuted: vocalMuted,
                instrumentalBlendRatio: currentInstrumentalBlend / 100.0,
                instrumentalGain: currentInstrumentalGain,
                instrumentalMuted: instrumentalMuted,
                masterGain: currentMasterGain,
                limiterEnabled: limiterEnabled
            };
            
            window.jitPlayback.updateStemParameters(params);
            return;
        }
        
        // Fallback: Generate new preview using modular pipeline
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
        isJITInitializing = true;
        try {
            
            // Check if JIT playback is available
            if (!window.jitPlayback) {
                console.error('❌ window.jitPlayback not available');
                return false;
            }
            
            // Clean up any existing JIT state first
            if (window.jitPlayback.isReady()) {
                console.log('Cleaning up existing JIT state before non-stem initialization');
                window.jitPlayback.cleanup();
            }
            
            // Initialize JIT system
            const initialized = await window.jitPlayback.initialize();
            if (!initialized) {
                console.error('❌ JIT initialization failed');
                return false;
            }
            
            // Convert file paths to proper URLs
            const originalUrl = `/temp_files/${encodeURIComponent(originalFilePath.split('/').pop())}`;
            const processedUrl = `/temp_files/${encodeURIComponent(processedFilePath.split('/').pop())}`;
            
            // Load audio files
            const audioLoaded = await window.jitPlayback.loadAudio(originalUrl, processedUrl);
            if (!audioLoaded) {
                console.error('❌ Failed to load audio for JIT processing');
                return false;
            }
            
            // Set up position update callback
            window.jitPlaybackManager.onPositionUpdate = (currentTime, duration) => {
                if (duration > 0) {
                    const position = currentTime / duration;
                    try {
                        drawPlayPosition(position);
                    } catch (error) {
                        console.warn('Position update error:', error);
                    }
                }
            };
            
            // Set up playback end handler
            window.jitPlaybackManager.onPlaybackEnd = () => {
                isPlaying = false;
                updatePlaybackButtons('stop');
                drawPlayPosition(0);
            };
            
            
            // Show JIT status indicator
            showJITStatus('🚀 Real-time processing enabled', false);
            
            return true;
            
        } catch (error) {
            console.error('JIT initialization failed:', error);
            showJITStatus('⚠ Using fallback processing', true);
            isJITInitializing = false;
            return false;
        }
    }
    
    // Initialize JIT processing for stem mode
    async function initializeStemJITProcessing(vocalOriginalPath, vocalProcessedPath, instrumentalOriginalPath, instrumentalProcessedPath) {
        try {
            // Check if JIT playback is available
            if (!window.jitPlayback) {
                console.error('❌ window.jitPlayback not available');
                return false;
            }
            
            // Clean up any existing JIT state first
            if (window.jitPlayback.isReady()) {
                console.log('Cleaning up existing JIT state before stem initialization');
                window.jitPlayback.cleanup();
            }
            
            // Initialize JIT system
            const initialized = await window.jitPlayback.initialize();
            if (!initialized) {
                console.error('❌ JIT initialization failed');
                return false;
            }
            
            // Convert file paths to accessible URLs
            const vocalOriginalUrl = `/temp_files/${encodeURIComponent(vocalOriginalPath.split('/').pop())}`;
            const vocalProcessedUrl = `/temp_files/${encodeURIComponent(vocalProcessedPath.split('/').pop())}`;
            const instrumentalOriginalUrl = `/temp_files/${encodeURIComponent(instrumentalOriginalPath.split('/').pop())}`;
            const instrumentalProcessedUrl = `/temp_files/${encodeURIComponent(instrumentalProcessedPath.split('/').pop())}`;
            
            // Load stem audio files into JIT system
            const audioLoaded = await window.jitPlayback.loadStemAudio(
                vocalOriginalUrl, vocalProcessedUrl, 
                instrumentalOriginalUrl, instrumentalProcessedUrl
            );
            if (!audioLoaded) {
                console.error('❌ Failed to load stem audio for JIT processing');
                return false;
            }
            
            // Set up position update callback
            window.jitPlaybackManager.onPositionUpdate = (currentTime, duration) => {
                if (duration > 0) {
                    const position = currentTime / duration;
                    try {
                        drawPlayPosition(position);
                    } catch (error) {
                        console.warn('Position update error:', error);
                    }
                }
            };
            
            // Set up playback end callback
            window.jitPlaybackManager.onPlaybackEnd = () => {
                stopAudio();
            };
            
            
            // Show JIT status indicator
            showJITStatus('🚀 Real-time stem processing enabled', false);
            
            return true;
            
        } catch (error) {
            console.error('Stem JIT initialization failed:', error);
            showJITStatus('⚠ Using fallback stem processing', true);
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
                            } else {
                                previewAudioElement.currentTime = 0;
                            }
                            
                            previewAudioElement.play().then(() => {
                                isPlaying = true;
                                updatePlaybackButtons('play');
                                updatePlayPosition();
                            }).catch(error => {
                                console.warn('Could not resume playback:', error);
                                isPlaying = false;
                                updatePlaybackButtons('stop');
                            });
                        } else {
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
        if (!originalFilePath || !processedFilePath || isJITInitializing) return;
        
        // Debug JIT status
        const jitExists = !!window.jitPlayback;
        const jitReady = jitExists && window.jitPlayback.isReady();
        
        // Check if JIT processing is available and ready
        if (window.jitPlayback && window.jitPlayback.isReady()) {
            // Use JIT processing - just update parameters, no file generation needed
            
            if (isCurrentlyStemMode()) {
                // Stem mode parameters
                const params = {
                    isStemMode: true,
                    vocalBlendRatio: currentVocalBlend / 100.0,
                    vocalGain: currentVocalGain,
                    vocalMuted: vocalMuted,
                    instrumentalBlendRatio: currentInstrumentalBlend / 100.0,
                    instrumentalGain: currentInstrumentalGain,
                    instrumentalMuted: instrumentalMuted,
                    masterGain: currentMasterGain,
                    limiterEnabled: limiterEnabled
                };
                
                window.jitPlayback.updateStemParameters(params);
                return;
            } else {
                // Non-stem mode parameters
                const params = {
                    isStemMode: false,
                    blendRatio: currentBlendValue / 100.0,
                    masterGain: currentMasterGain,
                    limiterEnabled: limiterEnabled
                };
                
                window.jitPlayback.updateParameters(params);
                return;
            }
        }
        
        console.warn('⚠ Falling back to file-based processing (JIT not ready)');
        
        try {
            // Get the blend ratio (0.0 to 1.0)
            const blendRatio = currentBlendValue / 100.0;
            
            
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
