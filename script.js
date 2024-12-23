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

// Add these variables at the top with other globals
let zoomAnimationActive = false;
let zoomDirection = 1;
const ZOOM_SPEED = 0.5;
const MIN_ZOOM = 100;
const MAX_ZOOM = 115;
let zoomStartTime = 0;

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
    
    // Stop zoom animation when new background is loaded
    if (zoomAnimationActive) {
        toggleZoomAnimation();
    }
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
            
            // Base zoom from slider
            const baseZoom = parseInt(zoomControl.value) / 100;
            
            // Calculate animation zoom
            let animationZoom = 1;
            if (zoomAnimationActive) {
                const loopCount = parseInt(document.getElementById('loop-count').value);
                const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
                
                if (!zoomStartTime) zoomStartTime = performance.now();
                const elapsed = performance.now() - zoomStartTime;

                if (elapsed >= totalDuration) {
                    zoomStartTime = performance.now();
                }

                const progress = (elapsed % totalDuration) / totalDuration;
                const zoomProgress = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;
                animationZoom = 1 + ((MAX_ZOOM - MIN_ZOOM) / 100 * zoomProgress);
            }
            
            // Combine base zoom with animation zoom
            const finalZoom = baseZoom * animationZoom;
            
            const x = cropX.value / 100;
            const y = cropY.value / 100;
            
            // Calculate aspect ratio preserving dimensions
            let width, height, offsetX, offsetY;
            
            const containerRatio = canvas.width / canvas.height;
            const mediaRatio = (backgroundElement instanceof HTMLVideoElement) 
                ? backgroundElement.videoWidth / backgroundElement.videoHeight
                : backgroundElement.width / backgroundElement.height;
            
            if (mediaRatio > containerRatio) {
                height = canvas.height * finalZoom;
                width = height * mediaRatio;
            } else {
                width = canvas.width * finalZoom;
                height = width / mediaRatio;
            }
            
            offsetX = (canvas.width - width) * x;
            offsetY = (canvas.height - height) * y;
            
            ctx.drawImage(backgroundElement, offsetX, offsetY, width, height);
        }
    }
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        
        // Piggy animation is now completely independent
        try {
            const frame = Math.floor((elapsed / FRAME_DURATION) % FRAMES_IN_SEQUENCE);
            piggyGif.move_to(frame);
            const piggyCanvas = piggyGif.get_canvas();
            ctx.drawImage(piggyCanvas, 0, 0, canvas.width, canvas.height);
        } catch (e) {
            console.error('Error drawing frame:', e);
        }
        
        animationFrameId = requestAnimationFrame(animate);
    }
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    startTime = 0;
    animationFrameId = requestAnimationFrame(animate);
}

async function exportForSticker() {
    const canvas = document.getElementById('preview-canvas');
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const mediaStream = canvas.captureStream();
    
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    const mimeTypes = isSafari ? 
        ['video/mp4'] :
        [
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4'
        ];
    
    const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
    
    if (!supportedMimeType) {
        alert('Video recording not supported in this browser. Please try Chrome, Firefox, or Safari.');
        return;
    }
    
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const totalDuration = (FRAME_DURATION * totalFrames) / 1000;
    
    if (totalDuration > MAX_STICKER_LENGTH) {
        alert(`Animation would be ${totalDuration.toFixed(1)} seconds. Maximum allowed is ${MAX_STICKER_LENGTH} seconds. Please reduce loops.`);
        return;
    }

    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'export-dialog';
    loadingDiv.innerHTML = '<h3>Generating sticker...</h3><p>Please wait...</p>';
    document.body.appendChild(loadingDiv);

    try {
        const isHighQuality = document.getElementById('high-quality').checked;
        const mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: supportedMimeType,
            videoBitsPerSecond: isHighQuality ? 2000000 : 1000000  // 2Mbps for HQ, 1Mbps for standard
        });
        
        const chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        
        const recordingPromise = new Promise((resolve, reject) => {
            mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: supportedMimeType }));
            mediaRecorder.onerror = reject;
        });

        mediaRecorder.start();
        
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

        const blob = await recordingPromise;
        loadingDiv.remove();

        const url = URL.createObjectURL(blob);
        const fileExtension = supportedMimeType.includes('webm') ? 'webm' : 'mp4';
        const fileSize = blob.size / 1024;

        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            ${fileSize > 256 ? 
                `<p class="size-warning">Warning: File size (${fileSize.toFixed(1)}KB) exceeds Telegram's 256KB limit!</p>` 
                : ''}
            <button onclick="downloadSticker('${url}', 'telegram', '${fileExtension}');this.parentElement.remove()">
                Download for Telegram (${fileExtension.toUpperCase()})
            </button>
            <button onclick="downloadSticker('${url}', 'discord', '${fileExtension}');this.parentElement.remove()">
                Download for Discord (${fileExtension.toUpperCase()})
            </button>
            ${fileSize > 256 ? `
                <button onclick="compressAndExport(${fileSize})">
                    Try Compress (Experimental)
                </button>
            ` : ''}
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
            <p style="font-size: 12px; margin-top: 10px;">
                File size: ${fileSize.toFixed(1)}KB<br>
                Telegram limit: 256KB<br>
                Discord limit: 500KB
            </p>
        `;
        
        document.body.appendChild(exportDiv);
    } catch (error) {
        console.error('Export failed:', error);
        loadingDiv.remove();
        alert('Failed to export sticker. Please try again.');
    }
}

async function compressAndExport(originalSize) {
    const canvas = document.getElementById('preview-canvas');
    const compressedCanvas = document.createElement('canvas');
    const ctx = compressedCanvas.getContext('2d');
    
    const isHighQuality = document.getElementById('high-quality').checked;
    const strategies = isHighQuality ? 
        [
            { width: 512, height: 512, bitrate: 1500000 },
            { width: 480, height: 480, bitrate: 1200000 },
            { width: 448, height: 448, bitrate: 1000000 }
        ] : 
        [
            { width: 512, height: 512, bitrate: 800000 },
            { width: 480, height: 480, bitrate: 700000 },
            { width: 448, height: 448, bitrate: 600000 },
            { width: 416, height: 416, bitrate: 500000 },
            { width: 384, height: 384, bitrate: 400000 }
        ];

    for (const dims of strategies) {
        compressedCanvas.width = dims.width;
        compressedCanvas.height = dims.height;
        ctx.drawImage(canvas, 0, 0, dims.width, dims.height);
        
        const mediaStream = compressedCanvas.captureStream();
        const mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: dims.bitrate
        });

        const chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        
        const blob = await new Promise(resolve => {
            mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 100);
        });

        if (blob.size / 1024 <= 256) {
            const url = URL.createObjectURL(blob);
            downloadSticker(url, 'telegram_compressed', 'webm');
            alert(`Successfully compressed from ${originalSize.toFixed(1)}KB to ${(blob.size/1024).toFixed(1)}KB`);
            return;
        }
    }
    
    alert('Unable to compress below 256KB while maintaining acceptable quality.');
}

// Add event listeners for controls
zoomControl.addEventListener('input', updatePreview);
cropX.addEventListener('input', updatePreview);
cropY.addEventListener('input', updatePreview);

function downloadSticker(url, platform, extension) {
    const stickerName = document.getElementById('sticker-name').value.trim() || 'sticker';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stickerName}_${platform}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Add this to update max loops based on quality setting
document.getElementById('high-quality').addEventListener('change', function(e) {
    const loopInput = document.getElementById('loop-count');
    if (e.target.checked) {
        // Reduce max loops for high quality
        loopInput.max = Math.floor(MAX_LOOPS.normal * 0.6);
        if (parseInt(loopInput.value) > loopInput.max) {
            loopInput.value = loopInput.max;
        }
    } else {
        // Reset to normal max loops
        loopInput.max = MAX_LOOPS.normal;
    }
    updateDurationDisplay();
});

function toggleZoomAnimation() {
    zoomAnimationActive = !zoomAnimationActive;
    const btn = document.querySelector('.zoom-animate-btn');
    const statusSpan = btn.querySelector('.zoom-status');
    
    if (zoomAnimationActive) {
        btn.classList.add('active');
        statusSpan.textContent = '⏹ Stop Zoom';
        zoomStartTime = 0;
    } else {
        btn.classList.remove('active');
        statusSpan.textContent = '🔄 Animate Zoom';
    }
}

// Add this to reset zoom animation when loop count changes
document.getElementById('loop-count').addEventListener('input', function() {
    if (zoomAnimationActive) {
        zoomStartTime = 0; // Reset zoom animation
    }
    updateDurationDisplay();
});