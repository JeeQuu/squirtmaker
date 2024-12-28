// Get the existing canvas and initialize context
const canvas = document.getElementById('preview-canvas');
if (!canvas) {
    throw new Error('Preview canvas not found');
}
const ctx = canvas.getContext('2d', { willReadFrequently: true });

// Initialize controls
const speedInfo = document.getElementById('speed-info');
const zoomControl = document.getElementById('zoom');
const cropX = document.getElementById('crop-x');
const cropY = document.getElementById('crop-y');
let currentZoom = 1;
let animationLoop = null;
let backgroundElement = null;
let videoStartTime = 0;
let videoDuration = 0;
let isSquirtMode = false;

// GIF URLs
const DEFAULT_GIF_URL = 'https://res.cloudinary.com/dakoxedxt/image/upload/v1735254712/ezgif.com-animated-gif-maker_ks3mtk.gif';
const SQUIRT_GIF_URL = 'https://res.cloudinary.com/dakoxedxt/image/upload/v1735396014/piggysquirt.gif';

// Add piggyGif to globals
let piggyGif = null;

// Configuration
const CONFIG = {
    CANVAS: {
        WIDTH: 512,
        HEIGHT: 512
    },
    EXPORT: {
        MAX_SIZE: 256 * 1024, // 256KB
        QUALITY_SETTINGS: {
            high: 2000000,
            normal: 1000000
        },
        GIF: {
            MAX_WIDTH: 512,
            MAX_HEIGHT: 512,
            QUALITY: 10
        }
    },
    BITRATES: {
        AUTO: 'auto',
        TELEGRAM: 'telegram',
        CUSTOM: 'custom'
    }
};

// Constants for the piggy animation
const FRAMES_IN_SEQUENCE = 11;
const SPEEDS = {
    normal: 18,      // ≈ 200ms total cycle (18ms × 11 frames = 198ms)
    squirtaholic: 11,  // ≈ 125ms total cycle (11ms × 11 frames = 121ms)
    smooth: 30       // ≈ 335ms total cycle (30ms × 11 frames = 330ms)
};
const MAX_LOOPS = {
    normal: 15,      // Adjusted for 11 frames
    squirtaholic: 24,  // Adjusted for faster speed
    smooth: 9        // Adjusted for slower speed
};
let FRAME_DURATION = SPEEDS.normal;
let currentMaxLoops = MAX_LOOPS.normal;
let startTime = 0;

// Mirror states
let mirrorX = false;
let mirrorY = false;

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
        
        let timeoutId;
        startFrame.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                videoStartTime = (e.target.value / 100) * videoDuration;
                startTimeDisplay.textContent = `${videoStartTime.toFixed(2)}s`;
                
                if (!animationLoop) {
                    backgroundElement.currentTime = videoStartTime;
                }
            }, 16);
        });
    } else {
        startFrameControl.style.display = 'none';
    }
}

function setSpeed(speed) {
    FRAME_DURATION = SPEEDS[speed];
    const SEQUENCE_DURATION = FRAMES_IN_SEQUENCE * FRAME_DURATION;
    speedInfo.textContent = `${speed}`;
    
    currentMaxLoops = MAX_LOOPS[speed];
    const loopInput = document.getElementById('loop-count');
    loopInput.max = currentMaxLoops;
    if (parseInt(loopInput.value) > currentMaxLoops) {
        loopInput.value = currentMaxLoops;
    }
    
    updateDurationDisplay();
    startTime = 0;
}

function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Clean up existing background
    if (backgroundElement) {
        if (backgroundElement instanceof HTMLVideoElement) {
            backgroundElement.pause();
            backgroundElement.src = '';
            backgroundElement.load();
        }
        URL.revokeObjectURL(backgroundElement.src);
    }
    
    const isVideo = file.type.startsWith('video/');
    
    if (isVideo) {
        backgroundElement = document.createElement('video');
        backgroundElement.crossOrigin = "anonymous";
        backgroundElement.loop = true;
        backgroundElement.muted = true;
        backgroundElement.autoplay = true;
        backgroundElement.playsinline = true;
        backgroundElement.src = URL.createObjectURL(file);
        
        document.querySelector('.video-controls').style.display = 'block';
        
        backgroundElement.onloadedmetadata = () => {
            updateVideoControls();
            startAnimation(); // Restart animation when video is ready
        };
        
        backgroundElement.play().catch(e => console.error('Video play failed:', e));
    } else {
        backgroundElement = new Image();
        backgroundElement.crossOrigin = "anonymous";
        backgroundElement.onload = () => {
            document.querySelector('.video-controls').style.display = 'none';
            startAnimation(); // Restart animation when image is loaded
        };
        backgroundElement.src = URL.createObjectURL(file);
    }
}

// Initialize the GIF
function initializeGif(gifUrl) {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        img.crossOrigin = "anonymous";
        img.style.display = 'none';
        img.src = gifUrl;
        img.setAttribute('rel:animated_src', gifUrl);
        document.getElementById('gif-container').appendChild(img);
        
        const gif = new SuperGif({ 
            gif: img,
            auto_play: true,
            rubbable: false,
            max_width: CONFIG.CANVAS.WIDTH,
            on_created: function(canvas) {
                canvas.getContext('2d', { willReadFrequently: true });
            }
        });

        gif.load(() => {
            resolve(gif);
        });
    });
}

async function initialize() {
    try {
        piggyGif = await initializeGif(DEFAULT_GIF_URL);
        startAnimation();
        setupEventListeners();
    } catch (error) {
        console.error('Failed to initialize:', error);
        alert('Failed to load GIF. Please try again.');
    }
}

function setupEventListeners() {
    zoomControl.addEventListener('input', updateTransform);
    cropX.addEventListener('input', updateTransform);
    cropY.addEventListener('input', updateTransform);
    
    document.getElementById('loop-count').addEventListener('input', function(e) {
        updateDurationDisplay();
    });
    
    // Add background upload listener
    document.getElementById('background-upload').addEventListener('change', handleBackgroundUpload);
}

async function toggleSquirt() {
    const btn = document.querySelector('.squirt-toggle-btn');
    btn.disabled = true;
    
    try {
        isSquirtMode = !isSquirtMode;
        const gifUrl = isSquirtMode ? SQUIRT_GIF_URL : DEFAULT_GIF_URL;
        
        const squirtStatus = document.querySelector('.squirt-status');
        squirtStatus.textContent = isSquirtMode ? '🌊 Remove SQUIRT' : '🌊 Add SQUIRT';
        
        piggyGif = await initializeGif(gifUrl);
        
        btn.classList.toggle('active', isSquirtMode);
    } catch (error) {
        console.error('Failed to toggle squirt mode:', error);
        alert('Failed to load GIF. Please try again.');
        isSquirtMode = !isSquirtMode;
    } finally {
        btn.disabled = false;
    }
}

function updatePreview() {
    if (!animationLoop && piggyGif) {
        startAnimation();
    }
}

function animate() {
    const now = performance.now();
    if (!startTime) startTime = now;
    
    const elapsed = now - startTime;
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
    
    if (elapsed >= totalDuration) {
        startTime = now;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background first
    if (backgroundElement) {
        drawBackground();
    }
    
    // Then draw piggy on top
    if (piggyGif) {
        const frame = Math.floor((elapsed / FRAME_DURATION) % FRAMES_IN_SEQUENCE);
        try {
            piggyGif.move_to(frame);
            const piggyCanvas = piggyGif.get_canvas();
            if (piggyCanvas) {
                ctx.drawImage(piggyCanvas, 0, 0, canvas.width, canvas.height);
            }
        } catch (e) {
            console.error('Error drawing frame:', e);
        }
    }
    
    animationLoop = requestAnimationFrame(animate);
}

function drawBackground() {
    if (!backgroundElement) return;

    if (backgroundElement instanceof HTMLVideoElement) {
        const loopCount = parseInt(document.getElementById('loop-count').value);
        const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount) / 1000;
        const elapsed = (performance.now() - startTime) / 1000;
        
        try {
            if (backgroundElement.readyState >= 2) {
                let targetTime = videoStartTime + (elapsed % totalDuration);
                targetTime = targetTime % backgroundElement.duration;
                
                if (Math.abs(backgroundElement.currentTime - targetTime) > 0.1) {
                    backgroundElement.currentTime = targetTime;
                }
            }
        } catch (e) {
            console.warn('Video timing update failed:', e);
        }
    }

    const xOffset = parseInt(cropX.value);
    const yOffset = parseInt(cropY.value);
    const zoom = parseFloat(zoomControl.value) / 100; // Convert percentage to decimal

    ctx.save();
    
    // Apply transforms from the center
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.scale(mirrorX ? -1 : 1, mirrorY ? -1 : 1);
    ctx.translate(-canvas.width/2, -canvas.height/2);
    
    // Get media dimensions
    const mediaWidth = backgroundElement instanceof HTMLVideoElement ? 
        backgroundElement.videoWidth : backgroundElement.naturalWidth;
    const mediaHeight = backgroundElement instanceof HTMLVideoElement ? 
        backgroundElement.videoHeight : backgroundElement.naturalHeight;
    
    if (!mediaWidth || !mediaHeight) return;

    // Calculate base scale to fit canvas
    const baseScale = Math.min(
        canvas.width / mediaWidth,
        canvas.height / mediaHeight
    );

    // Apply zoom to the base scale
    const finalScale = baseScale * zoom;

    // Calculate dimensions after scaling
    const width = mediaWidth * finalScale;
    const height = mediaHeight * finalScale;

    // Calculate position to center the image/video
    const x = (canvas.width - width) / 2 + (xOffset / 50 * canvas.width);
    const y = (canvas.height - height) / 2 + (yOffset / 50 * canvas.height);

    // Draw the background
    ctx.drawImage(backgroundElement, x, y, width, height);
    ctx.restore();
}

function startAnimation() {
    if (animationLoop) cancelAnimationFrame(animationLoop);
    startTime = 0;
    animate();
}

function toggleMirrorX() {
    mirrorX = !mirrorX;
    document.querySelector('.mirror-x-status').textContent = 
        mirrorX ? '↔️ Unflip X' : '↔️ Flip X';
}

function toggleMirrorY() {
    mirrorY = !mirrorY;
    document.querySelector('.mirror-y-status').textContent = 
        mirrorY ? '↕️ Unflip Y' : '↕️ Flip Y';
}

function updateTransformDisplay() {
    document.getElementById('zoom-value').textContent = `Zoom: ${zoomControl.value}%`;
    document.getElementById('crop-x-value').textContent = `Move X: ${cropX.value}`;
    document.getElementById('crop-y-value').textContent = `Move Y: ${cropY.value}`;
}

function updateTransform() {
    currentZoom = parseFloat(zoomControl.value) / 100; // Convert percentage to decimal
    updateTransformDisplay();
    if (!animationLoop && piggyGif) {
        startAnimation();
    }
}

async function exportForSticker() {
    if (piggyGif) {
        piggyGif.move_to(0);
    }
    
    if (backgroundElement instanceof HTMLVideoElement) {
        backgroundElement.currentTime = videoStartTime;
    }
    
    const exportDiv = document.createElement('div');
    exportDiv.className = 'export-dialog';
    exportDiv.innerHTML = `
        <h3>Export Sticker</h3>
        <div class="quality-settings">
            <h4>Quality Settings</h4>
            <select id="quality-preset" onchange="updateQualityControls()">
                <option value="${CONFIG.BITRATES.AUTO}">Auto (Telegram Safe)</option>
                <option value="${CONFIG.BITRATES.TELEGRAM}">Telegram Optimized</option>
                <option value="${CONFIG.BITRATES.CUSTOM}">Custom</option>
            </select>
            <div id="custom-bitrate" style="display: none;">
                <label>Custom Bitrate (bps):
                    <input type="number" 
                           id="custom-bitrate-value" 
                           min="100000" 
                           max="4000000" 
                           step="100000" 
                           value="1500000"
                           onchange="updateQualityControls()">
                </label>
            </div>
            <div class="bitrate-info">
                <span id="bitrate-display"></span>
            </div>
        </div>
        <button onclick="exportAsVideo()">Export for Telegram</button>
        <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
    `;
    document.body.appendChild(exportDiv);
    
    setTimeout(() => updateQualityControls(), 0);
}

// Add these functions back for export functionality
function calculateOptimalBitrate(duration) {
    const MAX_SIZE_BYTES = 256 * 1024;
    const TARGET_SIZE_BITS = MAX_SIZE_BYTES * 8;
    const COMPRESSION_COMPENSATION = 2.2;
    
    const targetBitrate = Math.floor((TARGET_SIZE_BITS / duration) * COMPRESSION_COMPENSATION);
    
    console.log('Duration:', duration, 
                'Target size (KB):', MAX_SIZE_BYTES / 1024, 
                'Compensated bitrate:', targetBitrate,
                'Estimated final size (KB):', ((targetBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION).toFixed(1));
    
    return targetBitrate;
}

function updateQualityControls() {
    console.log('Updating quality controls...');
    const preset = document.getElementById('quality-preset').value;
    const customControls = document.getElementById('custom-bitrate');
    const bitrateDisplay = document.getElementById('bitrate-display');
    
    customControls.style.display = preset === CONFIG.BITRATES.CUSTOM ? 'block' : 'none';
    
    const duration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * 
        parseInt(document.getElementById('loop-count').value)) / 1000;
    
    const COMPRESSION_COMPENSATION = 2.2;
    let estimatedBitrate;
    switch(preset) {
        case CONFIG.BITRATES.AUTO:
            estimatedBitrate = calculateOptimalBitrate(duration);
            const autoSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Auto: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${autoSize.toFixed(1)}KB)`;
            break;
        case CONFIG.BITRATES.TELEGRAM:
            estimatedBitrate = Math.max(2500000, Math.min(duration <= 1.5 ? 4000000 : 3000000, calculateOptimalBitrate(duration)));
            const telegramSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Telegram: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${telegramSize.toFixed(1)}KB)`;
            break;
        case CONFIG.BITRATES.CUSTOM:
            estimatedBitrate = parseInt(document.getElementById('custom-bitrate-value').value);
            const customSize = (estimatedBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
            bitrateDisplay.textContent = `Custom: ${(estimatedBitrate/1000).toFixed(0)}Kbps (≈${customSize.toFixed(1)}KB)`;
            break;
    }
}

function getBitrateForExport() {
    console.log('Getting bitrate for export...');
    const preset = document.getElementById('quality-preset').value;
    
    const duration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * 
        parseInt(document.getElementById('loop-count').value)) / 1000;
    
    let bitrate;
    switch(preset) {
        case CONFIG.BITRATES.AUTO:
            bitrate = calculateOptimalBitrate(duration);
            break;
        case CONFIG.BITRATES.TELEGRAM:
            const calculatedBitrate = calculateOptimalBitrate(duration);
            const minBitrate = 2500000;
            const maxBitrate = duration <= 1.5 ? 4000000 : 3000000;
            bitrate = Math.max(minBitrate, Math.min(maxBitrate, calculatedBitrate));
            break;
        case CONFIG.BITRATES.CUSTOM:
            bitrate = parseInt(document.getElementById('custom-bitrate-value').value);
            break;
        default:
            bitrate = calculateOptimalBitrate(duration);
    }
    
    const COMPRESSION_COMPENSATION = 2.2;
    const estimatedSize = (bitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
    console.log('Selected bitrate:', bitrate, 
                'Duration:', duration,
                'Estimated size (KB):', estimatedSize.toFixed(1));
    return bitrate;
}

async function exportAsVideo() {
    const canvas = document.getElementById('preview-canvas');
    if (!canvas) {
        alert('Canvas not found');
        return;
    }

    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const duration = (FRAME_DURATION * totalFrames) / 1000;
    const optimalBitrate = calculateOptimalBitrate(duration);
    
    let loadingDiv = null;
    
    try {
        const mediaStream = canvas.captureStream(30);
        
        loadingDiv = document.createElement('div');
        loadingDiv.className = 'loading';
        loadingDiv.innerHTML = '<h3>Generating sticker...</h3><p>Recording animation...</p>';
        document.body.appendChild(loadingDiv);

        const options = {
            mimeType: getSupportedMimeType(),
            videoBitsPerSecond: getBitrateForExport()
        };

        const recorder = new MediaRecorder(mediaStream, options);
        const chunks = [];
        
        recorder.ondataavailable = e => chunks.push(e.data);

        const recordingPromise = new Promise((resolve, reject) => {
            let recordingStartTime = Date.now();
            
            recorder.onstop = () => {
                loadingDiv.innerHTML = '<h3>Generating sticker...</h3><p>Processing video...</p>';
                const blob = new Blob(chunks, { type: options.mimeType });
                resolve(blob);
            };
            
            recorder.onerror = reject;

            const updateProgress = () => {
                if (recorder.state === 'recording') {
                    const elapsed = (Date.now() - recordingStartTime) / 1000;
                    const progress = Math.min(100, (elapsed / duration) * 100);
                    loadingDiv.innerHTML = `<h3>Generating sticker...</h3><p>Recording: ${progress.toFixed(0)}%</p>`;
                    if (elapsed < duration) {
                        requestAnimationFrame(updateProgress);
                    }
                }
            };
            updateProgress();
        });

        startTime = 0;
        recorder.start();
        
        setTimeout(() => {
            if (recorder.state === 'recording') {
                recorder.stop();
            }
        }, duration * 1000 + 100);

        const blob = await recordingPromise;
        loadingDiv.remove();

        const url = URL.createObjectURL(blob);
        const fileSize = blob.size / 1024;

        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            ${fileSize > 256 ? 
                `<p class="size-warning">Warning: File size (${fileSize.toFixed(1)}KB) exceeds Telegram's limit!</p>` 
                : ''}
            <div class="format-group">
                <h4>WebM/VP9 (${fileSize.toFixed(1)}KB)</h4>
                <button onclick="downloadSticker('${url}', 'telegram', 'webm')">
                    Download for Telegram
                </button>
            </div>
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
        `;
        document.body.appendChild(exportDiv);

    } catch (error) {
        console.error('Export failed:', error);
        if (loadingDiv) loadingDiv.remove();
        alert(`Failed to export: ${error.message}\n\nSupported formats: ${MediaRecorder.isTypeSupported('video/mp4') ? 'MP4' : 'No MP4'}, ${MediaRecorder.isTypeSupported('video/webm') ? 'WebM' : 'No WebM'}`);
    }
}

function getSupportedMimeType() {
    const possibleTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/mp4;codecs=h264,aac',
        'video/mp4',
        'video/webm;codecs=h264',
        'video/webm'
    ];

    for (const type of possibleTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            console.log('Using MIME type:', type);
            return type;
        }
    }

    throw new Error('No supported video format found');
}

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

// Initialize the application
initialize();