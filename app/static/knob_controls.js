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
let limiterEnabled = true;  // Limiter on/off state
// Use global mute state variables managed by event_listeners.js
// window.vocalMuted and window.instrumentalMuted are initialized there
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
    canvas.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Double-click detected on blend knob');
        // Stop any active dragging
        isDragging = false;
        resetBlendKnob();
    });
    
    // Add touch events for mobile
    canvas.addEventListener('touchstart', startDragTouch);
    
    // Add text input functionality
    const textInput = document.getElementById('blend-value');
    if (textInput) {
        textInput.addEventListener('input', function(e) {
            let value = parseInt(e.target.value) || 0;
            value = Math.max(0, Math.min(100, value)); // Clamp between 0-100
            currentBlendValue = value;
            window.currentBlendValue = currentBlendValue;
            drawKnob();
            
            // Send parameters via unified controller
            if (window.unifiedAudioController) {
                window.unifiedAudioController.sendParameters();
            }
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
    
    // Initialize limiter button
    initializeLimiterButton();
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
    masterGainKnob.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Double-click detected on master gain knob');
        // Stop any active dragging
        isDraggingMasterGain = false;
        resetMasterGainKnob();
    });
    masterGainKnob.addEventListener('touchstart', startDragMasterGainTouch);
    
    // Add wheel event for fine adjustment
    masterGainKnob.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        currentMasterGain = Math.max(-3, Math.min(3, currentMasterGain + delta));
        currentMasterGain = Math.round(currentMasterGain * 10) / 10; // Round to 0.1dB
        window.currentMasterGain = currentMasterGain;
        document.getElementById('master-gain-value').value = currentMasterGain;
        drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
        
        // Send parameters via unified controller
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
        }
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
            window.currentMasterGain = currentMasterGain;
            drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
            
            // Update JIT processing if available
            if (window.jitPlayback && window.jitPlayback.isReady()) {
                window.jitPlayback.updateParameters({
                    masterGain: currentMasterGain
                });
            } else {
                window.updatePreview(); // Fallback to preview update
            }
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
    vocalKnob.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Double-click detected on vocal blend knob');
        // Stop any active dragging
        isDraggingVocal = false;
        resetVocalBlendKnob();
    });
    vocalKnob.addEventListener('touchstart', (e) => startDragVocalTouch(e));
    
    // Add event listeners for instrumental knob
    instrumentalKnob.addEventListener('mousedown', (e) => startDragInstrumental(e));
    instrumentalKnob.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Double-click detected on instrumental blend knob');
        // Stop any active dragging
        isDraggingInstrumental = false;
        resetInstrumentalBlendKnob();
    });
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
        vocalGainKnob.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Double-click detected on vocal gain knob');
            // Stop any active dragging
            isDraggingVocalGain = false;
            resetVocalGainKnob();
        });
        vocalGainKnob.addEventListener('touchstart', (e) => startDragVocalGainTouch(e));
        instrumentalGainKnob.addEventListener('mousedown', (e) => startDragInstrumentalGain(e));
        instrumentalGainKnob.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Double-click detected on instrumental gain knob');
            // Stop any active dragging
            isDraggingInstrumentalGain = false;
            resetInstrumentalGainKnob();
        });
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
    
    // Mute button event listeners are handled centrally in event_listeners.js
    // This avoids duplicate listeners and ensures consistent text/state management
    
    // Initial draw
    drawDualKnobs();
    updateDualKnobTextInputs();
    
    // Initialize master gain knob for stem flow
    initializeMasterGainKnob();
    
    // Initialize limiter button for stem flow
    initializeLimiterButton();
    
    // Store globally for save function
    window.currentVocalBlend = currentVocalBlend;
    window.currentInstrumentalBlend = currentInstrumentalBlend;
    window.currentVocalGain = currentVocalGain;
    window.currentInstrumentalGain = currentInstrumentalGain;
    // Mute state is managed globally in window.vocalMuted and window.instrumentalMuted
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
        
        // Send parameters via unified controller
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
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
        
        // Send parameters via unified controller
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
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

function drawKnob() {
    drawKnobOnCanvas('blend-knob', currentBlendValue);
}

// Main blend knob drag functions
function startDrag(e) {
    isDragging = true;
    dragStartY = e.clientY;
    dragStartValue = currentBlendValue;
    document.getElementById('blend-knob').style.cursor = 'grabbing';
    
    // Add global mouse move and up listeners
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', endDrag);
}

function startDragTouch(e) {
    e.preventDefault();
    isDragging = true;
    dragStartY = e.touches[0].clientY;
    dragStartValue = currentBlendValue;
    
    // Add global touch move and end listeners
    document.addEventListener('touchmove', handleDragTouch);
    document.addEventListener('touchend', endDrag);
}

function handleDrag(e) {
    if (!isDragging) return;
    
    const deltaY = dragStartY - e.clientY;
    const newValue = Math.max(0, Math.min(100, dragStartValue + deltaY));
    
    currentBlendValue = newValue;
    window.currentBlendValue = currentBlendValue;
    drawKnob();
    updateTextInput();
    
    // Send parameters to backend
    if (window.streamingSessionId) {
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
        }
    }
}

function handleDragTouch(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const deltaY = dragStartY - e.touches[0].clientY;
    const newValue = Math.max(0, Math.min(100, dragStartValue + deltaY));
    
    currentBlendValue = newValue;
    window.currentBlendValue = currentBlendValue;
    drawKnob();
    updateTextInput();
    
    // Send parameters to backend
    if (window.streamingSessionId) {
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
        }
    }
}

function endDrag(e) {
    if (!isDragging) return;
    
    isDragging = false;
    document.getElementById('blend-knob').style.cursor = 'grab';
    
    // Remove global listeners
    document.removeEventListener('mousemove', handleDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', handleDragTouch);
    document.removeEventListener('touchend', endDrag);
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

function initializeLimiterButton() {
    const limiterButton = document.getElementById('limiterButton');
    if (!limiterButton) return;
    
    // Remove any existing event listeners by cloning the element
    const newLimiterButton = limiterButton.cloneNode(true);
    limiterButton.parentNode.replaceChild(newLimiterButton, limiterButton);
    
    // Add click event listener to the new button
    newLimiterButton.addEventListener('click', () => {
        // Toggle limiter state
        limiterEnabled = !limiterEnabled;
        window.limiterEnabled = limiterEnabled;
        
        // Update button appearance
        if (limiterEnabled) {
            newLimiterButton.classList.remove('limiter-bypassed');
            newLimiterButton.classList.add('limiter-on');
            newLimiterButton.querySelector('.limiter-text').textContent = 'ON';
        } else {
            newLimiterButton.classList.remove('limiter-on');
            newLimiterButton.classList.add('limiter-bypassed');
            newLimiterButton.querySelector('.limiter-text').textContent = 'BYPASSED';
        }
        
        // Send parameters via unified controller
        if (window.unifiedAudioController) {
            window.unifiedAudioController.sendParameters();
        }
        
        console.log('Limiter toggled:', limiterEnabled ? 'ON' : 'BYPASSED');
    });
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
window.limiterEnabled = limiterEnabled;
// Mute state variables are managed globally as window.vocalMuted and window.instrumentalMuted
window.updateDualKnobTextInputs = updateDualKnobTextInputs;
window.startDragVocal = startDragVocal;
window.startDragInstrumental = startDragInstrumental;
window.startDragVocalTouch = startDragVocalTouch;
window.startDragInstrumentalTouch = startDragInstrumentalTouch;
window.handleDualKnobMove = handleDualKnobMove;
window.handleDualKnobMoveTouch = handleDualKnobMoveTouch;
window.stopDualKnobDrag = stopDualKnobDrag;
window.startDragVocalGain = startDragVocalGain;
window.startDragVocalGainTouch = startDragVocalGainTouch;
window.startDragInstrumentalGain = startDragInstrumentalGain;
window.startDragInstrumentalGainTouch = startDragInstrumentalGainTouch;
window.startDragMasterGain = startDragMasterGain;
window.startDragMasterGainTouch = startDragMasterGainTouch;
window.dragMasterGain = dragMasterGain;
window.dragMasterGainTouch = dragMasterGainTouch;
window.endDragMasterGain = endDragMasterGain;
window.drawDualKnobs = drawDualKnobs;
window.drawKnob = drawKnob;

// Reset all knob controls to default values
window.resetKnobControls = function() {
    // Reset global variables to defaults
    currentBlendValue = 50;
    currentVocalBlend = 50;
    currentInstrumentalBlend = 50;
    currentVocalGain = 0;
    currentInstrumentalGain = 0;
    currentMasterGain = 0;
    limiterEnabled = true;
    window.vocalMuted = false;
    window.instrumentalMuted = false;
    
    // Reset all drag states
    isDragging = false;
    isDraggingVocal = false;
    isDraggingInstrumental = false;
    isDraggingVocalGain = false;
    isDraggingInstrumentalGain = false;
    isDraggingMasterGain = false;
    
    // Update text inputs
    const blendValueInput = document.getElementById('blend-value');
    if (blendValueInput) blendValueInput.value = 50;
    
    const vocalBlendInput = document.getElementById('vocal-blend-value');
    if (vocalBlendInput) vocalBlendInput.value = 50;
    
    const instrumentalBlendInput = document.getElementById('instrumental-blend-value');
    if (instrumentalBlendInput) instrumentalBlendInput.value = 50;
    
    const vocalGainInput = document.getElementById('vocal-gain-value');
    if (vocalGainInput) vocalGainInput.value = 0;
    
    const instrumentalGainInput = document.getElementById('instrumental-gain-value');
    if (instrumentalGainInput) instrumentalGainInput.value = 0;
    
    const masterGainInput = document.getElementById('master-gain-value');
    if (masterGainInput) masterGainInput.value = 0;
    
    // Reset limiter button
    const limiterButton = document.getElementById('limiterButton');
    if (limiterButton) {
        limiterButton.classList.remove('limiter-bypassed');
        limiterButton.classList.add('limiter-on');
        const limiterText = limiterButton.querySelector('.limiter-text');
        if (limiterText) limiterText.textContent = 'ON';
    }
    
    // Redraw all knobs
    if (window.drawKnob) {
        window.drawKnob(); // Standard blend knob
    }
    if (window.drawDualKnobs) {
        window.drawDualKnobs(); // Stem knobs
    }
    if (window.drawGainKnob) {
        window.drawGainKnob(); // Gain knobs
    }
    
    // Update window variables
    window.currentBlendValue = currentBlendValue;
    // Mute state is managed globally in window.vocalMuted and window.instrumentalMuted
    
    console.log('Knob controls reset to defaults');
};

// Double-click reset functions for all knobs
function resetBlendKnob() {
    currentBlendValue = 50; // Default blend value
    window.currentBlendValue = currentBlendValue;
    
    // Update text input
    const textInput = document.getElementById('blend-value');
    if (textInput) {
        textInput.value = Math.round(currentBlendValue);
    }
    
    // Redraw knob
    drawKnob();
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Blend knob reset to default:', currentBlendValue);
}

function resetMasterGainKnob() {
    currentMasterGain = 0; // Default master gain
    window.currentMasterGain = currentMasterGain;
    
    // Update text input
    const textInput = document.getElementById('master-gain-value');
    if (textInput) {
        textInput.value = currentMasterGain.toFixed(1);
    }
    
    // Redraw knob
    drawGainKnobOnCanvas('master-gain-knob', currentMasterGain);
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Master gain knob reset to default:', currentMasterGain);
}

function resetVocalBlendKnob() {
    currentVocalBlend = 50; // Default vocal blend value
    window.currentVocalBlend = currentVocalBlend;
    
    // Update text input
    const textInput = document.getElementById('vocal-blend-value');
    if (textInput) {
        textInput.value = Math.round(currentVocalBlend);
    }
    
    // Redraw knob
    drawKnobOnCanvas('vocal-blend-knob', currentVocalBlend);
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Vocal blend knob reset to default:', currentVocalBlend);
}

function resetInstrumentalBlendKnob() {
    currentInstrumentalBlend = 50; // Default instrumental blend value
    window.currentInstrumentalBlend = currentInstrumentalBlend;
    
    // Update text input
    const textInput = document.getElementById('instrumental-blend-value');
    if (textInput) {
        textInput.value = Math.round(currentInstrumentalBlend);
    }
    
    // Redraw knob
    drawKnobOnCanvas('instrumental-blend-knob', currentInstrumentalBlend);
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Instrumental blend knob reset to default:', currentInstrumentalBlend);
}

function resetVocalGainKnob() {
    currentVocalGain = 0; // Default vocal gain
    window.currentVocalGain = currentVocalGain;
    
    // Update text input
    const textInput = document.getElementById('vocal-gain-value');
    if (textInput) {
        textInput.value = currentVocalGain.toFixed(1);
    }
    
    // Redraw knob
    drawGainKnobOnCanvas('vocal-gain-knob', currentVocalGain);
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Vocal gain knob reset to default:', currentVocalGain);
}

function resetInstrumentalGainKnob() {
    currentInstrumentalGain = 0; // Default instrumental gain
    window.currentInstrumentalGain = currentInstrumentalGain;
    
    // Update text input
    const textInput = document.getElementById('instrumental-gain-value');
    if (textInput) {
        textInput.value = currentInstrumentalGain.toFixed(1);
    }
    
    // Redraw knob
    drawGainKnobOnCanvas('instrumental-gain-knob', currentInstrumentalGain);
    
    // Update audio if session is active
    if (window.unifiedAudioController) {
        window.unifiedAudioController.sendParameters();
    }
    
    console.log('Instrumental gain knob reset to default:', currentInstrumentalGain);
}
