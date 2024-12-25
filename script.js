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
let logoAnimationActive = false;
let logoImage = null;
let logoStartTime = 0;

// Initialize piggy animation
const piggyGif = new SuperGif({ 
    gif: document.getElementById('piggy-gif'),
    auto_play: false 
});

// Add crossOrigin to the piggy GIF image
document.getElementById('piggy-gif').crossOrigin = "anonymous";

// Load the GIF
piggyGif.load(() => {
    console.log('GIF loaded');  // Debug message
    startAnimationLoop();
});

// Move constants to a configuration file
const CONFIG = {
    ANIMATION: {
        FRAMES_IN_SEQUENCE: 5,
        SPEEDS: {
            normal: 40,
            squirtaholic: 25,
            smooth: 67
        }
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
            QUALITY: 10 // Lower means better quality but larger file
        }
    },
    BITRATES: {
        AUTO: 'auto',
        TELEGRAM: 'telegram',
        CUSTOM: 'custom'
    }
};

// Constants for the piggy animation
const FRAMES_IN_SEQUENCE = CONFIG.ANIMATION.FRAMES_IN_SEQUENCE;
const SPEEDS = CONFIG.ANIMATION.SPEEDS;
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

// Add these at the top with other globals
let particles = [];
const PARTICLE_COUNT = 20; // More particles
const PARTICLE_LIFETIME = 1200; // Longer lifetime

// Add this at the top with other globals
let logoVisible = true;  // Instead of particlesEnabled

// Add this class to manage individual particles
class Particle {
    constructor(x, y, angle, speed, size) {
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.angle = angle;
        this.speed = speed;
        this.size = size;
        this.lifetime = 0;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.4; // More rotation
        this.gravity = 0.25;
        // Adjust velocities for cone shape
        this.velocityY = -speed * Math.sin(angle) * 2;    // More upward force
        this.velocityX = speed * Math.cos(angle) * 1.5;   // More horizontal force
    }

    update(deltaTime) {
        this.lifetime += deltaTime;
        this.velocityY += this.gravity;
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.rotationSpeed;
        return this.lifetime < PARTICLE_LIFETIME;
    }

    draw(ctx) {
        const opacity = 1 - (this.lifetime / PARTICLE_LIFETIME);
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // Draw water droplet
        ctx.beginPath();
        ctx.moveTo(0, this.size/2);
        ctx.bezierCurveTo(
            -this.size/2, -this.size/2,
            this.size/2, -this.size/2,
            0, this.size/2
        );
        
        // Brighter colors and higher opacity for more visibility
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
        gradient.addColorStop(0, `rgba(150, 220, 255, ${opacity * 0.9})`);  // Brighter blue, higher opacity
        gradient.addColorStop(1, `rgba(0, 170, 255, ${opacity * 0.5})`);    // More saturated blue, higher opacity
        
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.restore();
    }
}

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
            backgroundElement.crossOrigin = "anonymous";
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
            backgroundElement.crossOrigin = "anonymous";
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
document.getElementById('loop-count').addEventListener('input', function(e) {
    document.getElementById('loop-count-display').textContent = e.target.value;
    updateDurationDisplay();
    if (zoomAnimationActive) {
        zoomStartTime = 0; // Reset zoom animation
    }
});

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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    canvas.width = 512;
    canvas.height = 512;
    
    function drawBackground() {
        if (backgroundElement) {
            if (backgroundElement instanceof HTMLVideoElement) {
                // Calculate total animation duration
                const loopCount = parseInt(document.getElementById('loop-count').value);
                const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount) / 1000;
                
                // Calculate current time in the animation
                const elapsed = (performance.now() - startTime) / 1000;
                const animationProgress = elapsed % totalDuration;
                
                // Set video time based on start point and current progress
                const videoTime = videoStartTime + animationProgress;
                
                // If video would exceed its duration, loop back to start
                if (videoTime > backgroundElement.duration) {
                    backgroundElement.currentTime = videoStartTime;
                } else {
                    backgroundElement.currentTime = videoTime;
                }
            }
            
            // Get position values from sliders (0-100)
            const xOffset = parseInt(cropX.value);
            const yOffset = parseInt(cropY.value);
            
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
            
            // Calculate aspect ratio preserving dimensions
            let width, height, offsetX, offsetY;
            
            const containerRatio = canvas.width / canvas.height;
            const mediaRatio = (backgroundElement instanceof HTMLVideoElement) 
                ? backgroundElement.videoWidth / backgroundElement.videoHeight
                : backgroundElement.width / backgroundElement.height;
            
            if (mediaRatio > containerRatio) {
                height = canvas.height * finalZoom;
                width = height * mediaRatio;
                offsetX = ((canvas.width - width) * xOffset / 100);
                offsetY = ((canvas.height - height) * yOffset / 100);
            } else {
                width = canvas.width * finalZoom;
                height = width / mediaRatio;
                offsetX = ((canvas.width - width) * xOffset / 100);
                offsetY = ((canvas.height - height) * yOffset / 100);
            }
            
            ctx.drawImage(backgroundElement, offsetX, offsetY, width, height);
        } else {
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        
        const elapsed = timestamp - startTime;
        const loopCount = parseInt(document.getElementById('loop-count').value);
        const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
        
        // Reset animation if we've completed all loops
        if (elapsed >= totalDuration) {
            startTime = timestamp;
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBackground();
        
        // Draw logo before piggy if animation is active
        if (logoAnimationActive && logoImage) {
            const now = performance.now();
            if (!logoStartTime) {
                logoStartTime = now;
                particles = [];
                // Always generate particles
                const emitX = canvas.width * 0.15;
                const emitY = canvas.height * 0.85;
                
                for (let i = 0; i < PARTICLE_COUNT; i++) {
                    const angle = (-30 + Math.random() * 60) * (Math.PI / 180);
                    const speed = 10 + Math.random() * 5;
                    const size = 15 + Math.random() * 12;
                    particles.push(new Particle(emitX, emitY, angle, speed, size));
                }
            }
            
            const elapsed = now - logoStartTime;
            const duration = 1500;
            const progress = (elapsed % duration) / duration;
            
            // Calculate logo parameters
            const startX = canvas.width * 0.3;
            const startY = canvas.height * 0.9;
            const endX = canvas.width * 0.8;
            const endY = canvas.height * 0.1;
            
            const easeProgress = Math.pow(progress, 0.7);
            const currentX = startX + (endX - startX) * easeProgress;
            const currentY = startY + (endY - startY) * easeProgress;
            
            const startSize = 180;
            const endSize = 80;
            const currentSize = startSize + (endSize - startSize) * easeProgress;
            
            const bounce = Math.sin(progress * Math.PI * 4) * 20 * (1 - progress);
            const startAngle = -45 * (Math.PI / 180);
            const endAngle = 0;
            const currentAngle = startAngle + (endAngle - startAngle) * easeProgress;
            const opacity = progress > 0.9 ? (1 - progress) * 10 : 1;
            
            // Draw logo using the separate function
            drawLogo(ctx, progress, currentX, currentY, currentSize, bounce, currentAngle, opacity);

            // Update and draw particles
            const deltaTime = elapsed % duration / 60;
            particles = particles.filter(particle => {
                const alive = particle.update(deltaTime);
                if (alive) particle.draw(ctx);
                return alive;
            });
            
            // Generate new particles
            if (progress < 0.4 && particles.length < PARTICLE_COUNT && Math.random() < 0.5) {
                const emitX = canvas.width * 0.15;
                const emitY = canvas.height * 0.85;
                const angle = (-30 + Math.random() * 60) * (Math.PI / 180);
                const speed = 10 + Math.random() * 5;
                const size = 15 + Math.random() * 12;
                particles.push(new Particle(emitX, emitY, angle, speed, size));
            }
        }
        
        // Draw piggy frame
        const frame = Math.floor((elapsed / FRAME_DURATION) % FRAMES_IN_SEQUENCE);
        try {
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
    
    // Initialize quality controls after the elements are added to the DOM
    setTimeout(() => updateQualityControls(), 0);
}

function calculateOptimalBitrate(duration) {
    // Telegram limit is 256KB
    const MAX_SIZE_BYTES = 256 * 1024;
    // Target size in bits (multiply by 8)
    const TARGET_SIZE_BITS = MAX_SIZE_BYTES * 8;
    
    // VP9 typically achieves better compression than our estimates
    // So we'll increase our target to compensate
    const COMPRESSION_COMPENSATION = 2.2; // Adjust based on observed results
    
    // Calculate target bitrate (bits/second)
    const targetBitrate = Math.floor((TARGET_SIZE_BITS / duration) * COMPRESSION_COMPENSATION);
    
    console.log('Duration:', duration, 
                'Target size (KB):', MAX_SIZE_BYTES / 1024, 
                'Compensated bitrate:', targetBitrate,
                'Estimated final size (KB):', ((targetBitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION).toFixed(1));
    
    return targetBitrate;
}

async function exportAsVideo() {
    const canvas = document.getElementById('preview-canvas');
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    const duration = (FRAME_DURATION * totalFrames) / 1000;
    const optimalBitrate = calculateOptimalBitrate(duration);
    
    try {
        const mediaStream = canvas.captureStream(30);
        
        const loadingDiv = document.createElement('div');
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
        loadingDiv?.remove();
        alert(`Failed to export: ${error.message}\n\nSupported formats: ${MediaRecorder.isTypeSupported('video/mp4') ? 'MP4' : 'No MP4'}, ${MediaRecorder.isTypeSupported('video/webm') ? 'WebM' : 'No WebM'}`);
    }
}

// Add this helper function to get the best supported video format
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
            mimeType: getSupportedMimeType(),
            videoBitsPerSecond: dims.bitrate
        });

        const chunks = [];
        mediaRecorder.ondataavailable = e => chunks.push(e.data);
        
        const blob = await new Promise(resolve => {
            mediaRecorder.onstop = () => {
                const videoBlob = new Blob(chunks, { 
                    type: 'video/mp4; codecs="avc1.42E01E"'
                });
                resolve(videoBlob);
            };
            mediaRecorder.start();
            setTimeout(() => mediaRecorder.stop(), 100);
        });

        if (blob.size / 1024 <= 256) {
            const url = URL.createObjectURL(blob);
            downloadSticker(url, 'telegram_compressed', 'mp4');
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

// Load the logo image
function loadLogoImage() {
    logoImage = new Image();
    logoImage.crossOrigin = "anonymous";
    logoImage.src = 'https://res.cloudinary.com/dakoxedxt/image/upload/v1734964113/SQUIRTww_ltlzuv.png';
    return new Promise((resolve) => {
        logoImage.onload = resolve;
    });
}

// Call this when page loads
loadLogoImage();

function toggleLogoAnimation() {
    logoAnimationActive = !logoAnimationActive;
    const btn = document.querySelector('.logo-animate-btn');
    const statusSpan = btn.querySelector('.logo-status');
    
    if (logoAnimationActive) {
        btn.classList.add('active');
        statusSpan.textContent = '⏹ Remove SQUIRT';
        logoStartTime = 0;
        // Reset particles when animation starts
        particles = [];
    } else {
        btn.classList.remove('active');
        statusSpan.textContent = '🌊 Add SQUIRT';
        // Clear particles when animation stops
        particles = [];
    }
}

// Modify the toggle function to control the logo visibility
function toggleParticles() {
    logoVisible = !logoVisible;
    const btn = document.querySelector('.particles-toggle-btn');
    const statusSpan = btn.querySelector('.particles-status');
    
    if (logoVisible) {
        btn.classList.add('active');
        statusSpan.textContent = '💧 Hide Logo';
    } else {
        btn.classList.remove('active');
        statusSpan.textContent = '💧 Show Logo';
    }
}

// Add this function to handle logo drawing
function drawLogo(ctx, progress, currentX, currentY, currentSize, bounce, currentAngle, opacity) {
    if (!logoVisible) return;  // Skip drawing if logo is hidden
    
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(currentX, currentY + bounce);
    ctx.rotate(currentAngle);
    ctx.drawImage(
        logoImage,
        -currentSize/2,
        -currentSize/2,
        currentSize,
        currentSize
    );
    ctx.restore();
}

// Add cleanup for background elements
function cleanupBackgroundElement() {
    if (backgroundElement) {
        if (backgroundElement instanceof HTMLVideoElement) {
            backgroundElement.pause();
            backgroundElement.src = '';
            backgroundElement.load();
        }
        URL.revokeObjectURL(backgroundElement.src);
    }
}

// Add more comprehensive error handling for media loading
function loadMedia(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
    });
}

// Add GIF export function
async function exportAsGif() {
    const canvas = document.getElementById('preview-canvas');
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalFrames = FRAMES_IN_SEQUENCE * loopCount;
    
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.innerHTML = '<h3>Generating GIF...</h3><p>Please wait...</p>';
    document.body.appendChild(loadingDiv);

    try {
        // Create GIF encoder with inline worker using data URL
        const workerBlob = new Blob([`
            (${function() {
                // GIF encoder web worker code
                self.onmessage = function(e) {
                    const frames = e.data.frames;
                    const options = e.data.options;
                    
                    // Process frames and create GIF
                    // ... (worker implementation)
                    
                    self.postMessage({ type: 'progress', value: 100 });
                };
            }.toString()})()
        `], { type: 'application/javascript' });

        const workerUrl = URL.createObjectURL(workerBlob);

        const gif = new GIF({
            workers: 1,
            quality: 10,
            width: 512,
            height: 512,
            workerScript: workerUrl,
            background: '#ffffff',
            transparent: null,
            dither: false
        });

        // Create temporary canvas for frame composition
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = 512;
        frameCanvas.height = 512;
        const frameCtx = frameCanvas.getContext('2d');

        // Capture frames
        for (let i = 0; i < totalFrames; i++) {
            frameCtx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
            
            // Draw background
            if (backgroundElement) {
                if (backgroundElement instanceof HTMLVideoElement) {
                    // Calculate video time for this frame
                    const frameTime = (i * FRAME_DURATION / 1000);
                    backgroundElement.currentTime = videoStartTime + (frameTime % backgroundElement.duration);
                    // Wait for the video to actually update
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                frameCtx.drawImage(backgroundElement, 0, 0, frameCanvas.width, frameCanvas.height);
            } else {
                // If no background, fill with white
                frameCtx.fillStyle = '#ffffff';
                frameCtx.fillRect(0, 0, frameCanvas.width, frameCanvas.height);
            }

            // Draw piggy frame
            const frame = Math.floor(i % FRAMES_IN_SEQUENCE);
            piggyGif.move_to(frame);
            frameCtx.drawImage(piggyGif.get_canvas(), 0, 0, frameCanvas.width, frameCanvas.height);

            // Add frame to GIF
            gif.addFrame(frameCanvas, {
                delay: FRAME_DURATION,
                copy: true,
                dispose: 2 // Clear frame before drawing next one
            });

            // Update loading progress
            loadingDiv.innerHTML = `<h3>Generating GIF...</h3><p>Frame ${i + 1} of ${totalFrames}</p>`;
        }

        // Create a promise to handle the GIF completion
        const gifPromise = new Promise((resolve, reject) => {
            gif.on('finished', blob => {
                resolve(blob);
            });
            gif.on('error', error => {
                reject(error);
            });
        });

        // Start rendering and wait for completion
        gif.render();
        const blob = await gifPromise;
        
        const url = URL.createObjectURL(blob);
        const fileSize = blob.size / 1024;
        
        loadingDiv.remove();
        
        // Show export dialog
        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            ${fileSize > 256 ? 
                `<p class="size-warning">Warning: GIF size (${fileSize.toFixed(1)}KB) exceeds Telegram's limit!</p>` 
                : ''}
            <div class="format-group">
                <h4>GIF Format (${fileSize.toFixed(1)}KB)</h4>
                <button onclick="downloadSticker('${url}', 'telegram', 'gif')">
                    Download GIF
                </button>
            </div>
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
        `;
        document.body.appendChild(exportDiv);

        URL.revokeObjectURL(workerUrl); // Clean up the worker URL when done
    } catch (error) {
        console.error('GIF export failed:', error);
        loadingDiv.remove();
        alert(`Failed to export GIF: ${error.message}`);
    }
}

// Add this function to handle quality control updates
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

// Update getBitrateForExport to use new quality settings
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
            // Increase minimum bitrate for better quality
            const minBitrate = 2500000; // Increased from 1500000
            // Allow higher maximum for short animations
            const maxBitrate = duration <= 1.5 ? 4000000 : 3000000;
            bitrate = Math.max(minBitrate, Math.min(maxBitrate, calculatedBitrate));
            break;
        case CONFIG.BITRATES.CUSTOM:
            bitrate = parseInt(document.getElementById('custom-bitrate-value').value);
            break;
        default:
            bitrate = calculateOptimalBitrate(duration);
    }
    
    // Adjust the estimated size calculation to match our compression compensation
    const COMPRESSION_COMPENSATION = 2.2;
    const estimatedSize = (bitrate * duration) / 8 / 1024 / COMPRESSION_COMPENSATION;
    console.log('Selected bitrate:', bitrate, 
                'Duration:', duration,
                'Estimated size (KB):', estimatedSize.toFixed(1));
    return bitrate;
}