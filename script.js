// Initialize controls
const speedControl = document.getElementById('speed-control');
const speedInfo = document.getElementById('speed-info');
const zoomControl = document.getElementById('zoom');
const cropX = document.getElementById('crop-x');
const cropY = document.getElementById('crop-y');
let currentZoom = 1;
let animationLoop = null;
let backgroundElement = null;
let videoStartTime = 0;
let videoDuration = 0;

// Initialize piggy animation
const piggyGif = new SuperGif({ 
    gif: document.getElementById('piggy-gif'),
    auto_play: false 
});

// Load the GIF
piggyGif.load(() => {
    console.log('GIF loaded');  // Debug message
    startAnimationLoop();
});

// Constants for the piggy animation
const FRAMES_IN_SEQUENCE = 5;
const SPEEDS = {
    normal: 40,      // 40ms per frame = 25fps
    squirtaholic: 25,  // 25ms per frame = 40fps
    smooth: 67      // 67ms per frame = 15fps
};
const MAX_LOOPS = {
    normal: 15,      // (3000ms / (40ms * 5frames)) ≈ 15 loops
    squirtaholic: 24,  // (3000ms / (25ms * 5frames)) = 24 loops
    smooth: 9       // (3000ms / (67ms * 5frames)) ≈ 9 loops
};
let FRAME_DURATION = SPEEDS.normal;
let currentMaxLoops = MAX_LOOPS.normal;
let SEQUENCE_DURATION = FRAMES_IN_SEQUENCE * FRAME_DURATION;
const MAX_STICKER_SIZE = 512;
const MAX_STICKER_LENGTH = 3;

// Store the last animation frame request
let animationFrameId = null;
let startTime = 0;

function updateDurationDisplay() {
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const totalDuration = (FRAME_DURATION * totalFrames) / 1000;
    document.getElementById('duration-display').textContent = `${totalDuration.toFixed(2)}s`;
}

function updateVideoControls() {
    const startFrameControl = document.querySelector('.start-frame-control');
    const startFrame = document.getElementById('start-frame');
    const startTimeDisplay = document.getElementById('start-time-display');
    
    if (backgroundElement instanceof HTMLVideoElement) {
        startFrameControl.style.display = 'block';
        videoDuration = backgroundElement.duration;
        startFrame.addEventListener('input', (e) => {
            videoStartTime = (e.target.value / 100) * videoDuration;
            startTimeDisplay.textContent = `${videoStartTime.toFixed(2)}s`;
            backgroundElement.currentTime = videoStartTime;
        });
    } else {
        startFrameControl.style.display = 'none';
    }
}

function setSpeed(speed) {
    FRAME_DURATION = SPEEDS[speed];
    SEQUENCE_DURATION = FRAMES_IN_SEQUENCE * FRAME_DURATION;
    speedInfo.textContent = `${speed}`;
    
    // Update max loops based on speed
    currentMaxLoops = MAX_LOOPS[speed];
    const loopInput = document.getElementById('loop-count');
    loopInput.max = currentMaxLoops;
    // Adjust current value if it exceeds new maximum
    if (parseInt(loopInput.value) > currentMaxLoops) {
        loopInput.value = currentMaxLoops;
    }
    
    updateDurationDisplay();
    // Reset animation with new speed
    startTime = 0;
}

// Handle file uploads
document.getElementById('background-upload').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const isVideo = file.type.startsWith('video/');
    const reader = new FileReader();
    
    reader.onload = function() {
        if (isVideo) {
            backgroundElement = document.createElement('video');
            backgroundElement.loop = true;
            backgroundElement.muted = true;
            backgroundElement.autoplay = true;
            backgroundElement.playsinline = true;
            backgroundElement.src = URL.createObjectURL(file);
            
            backgroundElement.play().catch(e => console.error('Video play failed:', e));
            
            backgroundElement.onloadedmetadata = () => {
                updateVideoControls();
            };
        } else {
            backgroundElement = new Image();
            backgroundElement.src = reader.result;
        }
        
        backgroundElement.onload = updatePreview;
        if (isVideo) {
            backgroundElement.onloadeddata = updatePreview;
        }
    };
    
    reader.readAsDataURL(file);
});

// Add loop count change listener
document.getElementById('loop-count').addEventListener('input', updateDurationDisplay);

function updatePreview() {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    
    // Start animation loop if not already running
    if (!animationLoop && piggyGif) {
        startAnimationLoop();
    }
}

function startAnimationLoop() {
    const canvas = document.getElementById('preview-canvas');
    const ctx = canvas.getContext('2d');
    
    function drawBackground() {
        if (backgroundElement) {
            if (backgroundElement instanceof HTMLVideoElement) {
                // Reset video to start point if it's past the desired duration
                const currentVideoTime = backgroundElement.currentTime - videoStartTime;
                const desiredDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * 
                    parseInt(document.getElementById('loop-count').value)) / 1000;
                
                if (currentVideoTime > desiredDuration) {
                    backgroundElement.currentTime = videoStartTime;
                }
            }
            
            const x = cropX.value / 100;
            const y = cropY.value / 100;
            currentZoom = zoomControl.value / 100;
            
            // Calculate aspect ratio preserving dimensions
            let width, height, offsetX, offsetY;
            
            const containerRatio = canvas.width / canvas.height;
            const mediaRatio = (backgroundElement instanceof HTMLVideoElement) 
                ? backgroundElement.videoWidth / backgroundElement.videoHeight
                : backgroundElement.width / backgroundElement.height;
            
            if (mediaRatio > containerRatio) {
                // Media is wider than container
                height = canvas.height * currentZoom;
                width = height * mediaRatio;
            } else {
                // Media is taller than container
                width = canvas.width * currentZoom;
                height = width / mediaRatio;
            }
            
            // Center the media
            offsetX = (canvas.width - width) * x;
            offsetY = (canvas.height - height) * y;
            
            ctx.drawImage(backgroundElement, offsetX, offsetY, width, height);
        }
    }
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background at full framerate
        drawBackground();
        
        // Calculate current frame based on elapsed time
        try {
            const frame = Math.floor((elapsed / FRAME_DURATION) % FRAMES_IN_SEQUENCE);
            piggyGif.move_to(frame);
            const piggyCanvas = piggyGif.get_canvas();
            ctx.drawImage(piggyCanvas, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error('Error drawing frame:', e);
        }
        
        // Request next frame at screen refresh rate
        animationFrameId = requestAnimationFrame(animate);
    }
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    startTime = 0;
    animationFrameId = requestAnimationFrame(animate);
}

function exportForSticker() {
    const canvas = document.getElementById('preview-canvas');
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const mediaStream = canvas.captureStream();
    
    // Find supported mime type
    const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
        'video/webm'
    ];
    
    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    
    if (!supportedMimeType) {
        alert('Video recording not supported in this browser. Please try Chrome or Firefox.');
        return;
    }
    
    // Calculate total frames and duration
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const totalDuration = (FRAME_DURATION * totalFrames) / 1000; // in seconds
    
    // Check if duration exceeds limit
    if (totalDuration > MAX_STICKER_LENGTH) {
        alert(`Animation would be ${totalDuration.toFixed(1)} seconds. Maximum allowed is ${MAX_STICKER_LENGTH} seconds. Please reduce loops.`);
        return;
    }
    
    const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType: supportedMimeType,
        videoBitsPerSecond: 2000000 // 2Mbps for better quality
    });
    
    const chunks = [];
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: supportedMimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sticker.webm';
        a.click();
        URL.revokeObjectURL(url);
    };
    
    mediaRecorder.start();
    
    // Record for complete animation cycles
    let framesRecorded = 0;
    const recordFrame = () => {
        if (framesRecorded >= totalFrames) {
            mediaRecorder.stop();
            return;
        }
        framesRecorded++;
        setTimeout(recordFrame, FRAME_DURATION);
    };
    recordFrame();
}

// Add event listeners for controls
zoomControl.addEventListener('input', updatePreview);
cropX.addEventListener('input', updatePreview);
cropY.addEventListener('input', updatePreview);