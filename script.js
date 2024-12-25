// Initialize controls
// const speedControl = document.getElementById('speed-control');
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

// At the top of the file, add a constant for the logo URL
const LOGO_URL = 'https://res.cloudinary.com/dakoxedxt/image/upload/v1734964113/SQUIRTww_ltlzuv.png';

// Add piggyGif to globals
let piggyGif = null;

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
let lastUpdate = 0;

// Add these variables at the top with other globals
let zoomAnimationActive = false;
let zoomDirection = 1;
const ZOOM_SPEED = 0.5;
const MIN_ZOOM = 100;
const MAX_ZOOM = 115;
let zoomStartTime = 0;

// Add these at the top with other globals
let particles = [];
const PARTICLE_COUNT = 20;
const PARTICLE_LIFETIME = 1200;

// Add this at the top with other globals
let logoVisible = true;  // Instead of particlesEnabled

// Add these variables at the top with other globals
let mirrorX = false;
let mirrorY = false;

// Replace the particleSystem object with simpler state management
let particleSystemActive = false;
let lastParticleUpdate = 0;

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
        this.rotationSpeed = (Math.random() - 0.5) * 0.2; // Slower rotation
        this.gravity = 0.12; // Reduced gravity for longer air time
        this.bounce = 0.65; // Slightly increased bounce
        // Adjust velocities for higher arc
        this.velocityY = -speed * Math.sin(angle) * 2.2; // Increased upward velocity
        this.velocityX = speed * Math.cos(angle) * 1.2; // Slightly increased horizontal speed
        this.splashed = false;
        this.opacity = 1;
        this.blueShade = 220 + Math.random() * 35; // Higher blue range (220-255)
    }

    update(deltaTime) {
        this.lifetime += deltaTime;
        this.velocityY += this.gravity;
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.rotation += this.rotationSpeed;

        // Add splashing effect when particle hits "ground"
        if (this.y > this.startY && !this.splashed) {
            this.splashed = true;
            this.velocityY = -this.velocityY * this.bounce;
            this.velocityX *= 0.8;
            this.size *= 0.8;
        }

        // Fade out more slowly
        this.opacity = Math.max(0, 1 - (this.lifetime / PARTICLE_LIFETIME));
        
        return this.lifetime < PARTICLE_LIFETIME;
    }

    draw(ctx) {
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
        
        // More intense blue gradient
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.size);
        gradient.addColorStop(0, `rgba(200, 240, 255, ${this.opacity * 0.98})`);   // Slightly bluer core
        gradient.addColorStop(0.3, `rgba(40, 140, 255, ${this.opacity * 0.95})`);  // More saturated mid blue
        gradient.addColorStop(1, `rgba(0, ${this.blueShade}, 255, ${this.opacity * 0.9})`); // Intense blue edge
        
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Brighter highlight for contrast
        ctx.beginPath();
        ctx.arc(-this.size/4, -this.size/4, this.size/4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.9})`;
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
        
        // Debounce the input handler to prevent excessive updates
        let timeoutId;
        startFrame.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                videoStartTime = (e.target.value / 100) * videoDuration;
                startTimeDisplay.textContent = `${videoStartTime.toFixed(2)}s`;
                
                // Only update video time if not currently animating
                if (!animationLoop) {
                    backgroundElement.currentTime = videoStartTime;
                }
            }, 16); // Debounce to roughly 60fps
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

// Move handleBackgroundUpload function definition before it's used
function handleBackgroundUpload(e) {
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
}

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

// Add this at the top with other globals
let ctx = null;

function startAnimationLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    
    // Reset all animation timers
    startTime = performance.now();
    lastUpdate = startTime;
    
    // Reset GIF to first frame
    if (piggyGif) {
        piggyGif.move_to(0);
    }
    
    // Reset video to start point if it exists
    if (backgroundElement instanceof HTMLVideoElement) {
        backgroundElement.currentTime = videoStartTime;
    }
    
    // Reset zoom animation
    if (zoomAnimationActive) {
        zoomStartTime = startTime;
    }
    
    animate();
}

// Add these performance-related constants at the top
const PERFORMANCE_CONFIG = {
    USE_RAF: true,              // Use requestAnimationFrame
    THROTTLE_PARTICLES: true,   // Limit particle updates
    MAX_PARTICLES: 15,          // Reduce max particles for better performance
    BATCH_RENDERING: true,      // Batch render particles
    USE_OFFSCREEN: true         // Use offscreen canvas when available
};

// Add an offscreen canvas for particle rendering
let particleCanvas = null;
let particleCtx = null;

// Update the initialization
function initializeCanvases() {
    const mainCanvas = document.getElementById('preview-canvas');
    if (!mainCanvas) {
        throw new Error('Main canvas not found');
    }

    // Set canvas dimensions first
    mainCanvas.width = 512;
    mainCanvas.height = 512;
    
    // Initialize main context
    ctx = mainCanvas.getContext('2d', { 
        willReadFrequently: true,
        alpha: true  // Enable alpha for proper transparency
    });
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Create offscreen canvas for particles
    particleCanvas = document.createElement('canvas');
    particleCanvas.width = mainCanvas.width;
    particleCanvas.height = mainCanvas.height;
    particleCtx = particleCanvas.getContext('2d', {
        alpha: true
    });
}

// Update the animate function
async function animate() {
    const now = performance.now();
    if (!startTime) {
        startTime = now;
        lastUpdate = now;
        // Ensure we start from frame 0
        if (piggyGif) {
            piggyGif.move_to(0);
        }
    }

    const elapsed = now - startTime;
    const loopCount = parseInt(document.getElementById('loop-count').value);
    const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
    
    // Reset animation when it completes
    if (elapsed >= totalDuration) {
        startTime = now;
        lastUpdate = now;
        // Reset to first frame when looping
        if (piggyGif) {
            piggyGif.move_to(0);
        }
    }
    
    // Clear the entire canvas
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Draw background
    await drawBackground();
    
    // Draw squirt animation FIRST (under piggy)
    if (logoAnimationActive && logoImage) {
        const now = performance.now();
        if (!logoStartTime) {
            logoStartTime = now;
            lastParticleUpdate = now;
            particles = [];
            initializeParticles();
            particleSystemActive = true;
        }
        
        // Calculate animation progress
        const particleElapsed = now - logoStartTime;
        const duration = 1800; // Slightly faster cycle
        const progress = (particleElapsed % duration) / duration;
        
        // Update and draw particles
        if (particleSystemActive) {
            const deltaTime = now - lastParticleUpdate;
            lastParticleUpdate = now;
            
            // Update existing particles
            particles = particles.filter(particle => particle.update(deltaTime));
            
            // Generate new particles more consistently
            if (particles.length < PARTICLE_COUNT && Math.random() < 0.4) {
                const emitX = ctx.canvas.width * 0.35;
                const emitY = ctx.canvas.height * 0.9;
                const angle = (-30 + Math.random() * 60) * (Math.PI / 180);
                const speed = 6 + Math.random() * 4;
                const size = 20 + Math.random() * 15;
                particles.push(new Particle(emitX, emitY, angle, speed, size));
            }
            
            // Draw particles
            if (PERFORMANCE_CONFIG.BATCH_RENDERING && particleCtx) {
                particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
                particles.forEach(particle => particle.draw(particleCtx));
                ctx.drawImage(particleCanvas, 0, 0);
            } else {
                particles.forEach(particle => particle.draw(ctx));
            }
        }
        
        // Draw logo
        if (logoVisible) {
            const startX = ctx.canvas.width * 0.3;
            const startY = ctx.canvas.height * 0.9;
            const endX = ctx.canvas.width * 0.8;
            const endY = ctx.canvas.height * 0.1;
            
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
            
            drawLogo(ctx, progress, currentX, currentY, currentSize, bounce, currentAngle, opacity);
        }
    }
    
    // Draw piggy ON TOP
    if (piggyGif) {
        const frame = Math.floor((elapsed / FRAME_DURATION) % FRAMES_IN_SEQUENCE);
        try {
            piggyGif.move_to(frame);
            const piggyCanvas = piggyGif.get_canvas();
            if (piggyCanvas) {
                ctx.drawImage(piggyCanvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
            }
        } catch (e) {
            console.error('Error drawing frame:', e);
        }
    }
    
    // Request next frame
    animationFrameId = requestAnimationFrame(animate);
}

async function exportForSticker() {
    // Reset to first frame before starting export
    if (piggyGif) {
        piggyGif.move_to(0);
    }
    
    // Reset video if present
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

// Update the toggleLogoAnimation function
function toggleLogoAnimation() {
    if (!logoImage || !logoImage.complete) {
        console.error('Logo image not ready');
        return;
    }
    
    logoAnimationActive = !logoAnimationActive;
    const btn = document.querySelector('.logo-animate-btn');
    const statusSpan = btn.querySelector('.logo-status');
    
    if (logoAnimationActive) {
        btn.classList.add('active');
        statusSpan.textContent = '⏹ Remove SQUIRT';
        logoStartTime = performance.now();
        lastParticleUpdate = performance.now();
        particleSystemActive = true;
        particles = [];
        if (ctx) { // Make sure ctx exists before initializing particles
            initializeParticles();
        }
    } else {
        btn.classList.remove('active');
        statusSpan.textContent = '🌊 Add SQUIRT';
        logoStartTime = 0;
        particleSystemActive = false;
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
function drawLogo(ctx, progress, x, y, size, bounce, angle, opacity) {
    if (!logoImage || !logoVisible || logoImage.complete === false) return;
    
    try {
        ctx.save();
        ctx.translate(x, y + bounce);
        ctx.rotate(angle);
        ctx.globalAlpha = opacity;
        
        const logoWidth = size;
        const logoHeight = size * (logoImage.height / logoImage.width);
        ctx.drawImage(logoImage, -logoWidth/2, -logoHeight/2, logoWidth, logoHeight);
        
        ctx.restore();
    } catch (error) {
        console.error('Error drawing logo:', error);
        logoAnimationActive = false;
    }
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

// Add these functions for mirroring controls
function toggleMirrorX() {
    mirrorX = !mirrorX;
    const btn = document.querySelector('.mirror-x-status');
    btn.textContent = mirrorX ? '↔️ Flip Back' : '↔️ Flip X';
}

function toggleMirrorY() {
    mirrorY = !mirrorY;
    const btn = document.querySelector('.mirror-y-status');
    btn.textContent = mirrorY ? '↕️ Flip Back' : '↕️ Flip Y';
}

// Update the initializeParticles function to match the continuous particle generation
function initializeParticles() {
    particles = [];
    const emitX = ctx.canvas.width * 0.35;
    const emitY = ctx.canvas.height * 0.9;
    
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const angle = (-30 + Math.random() * 60) * (Math.PI / 180);
        const speed = 6 + Math.random() * 4;
        const size = 20 + Math.random() * 15;
        particles.push(new Particle(emitX, emitY, angle, speed, size));
    }
}

// Add this function back
function drawBackground() {
    if (!ctx || !backgroundElement) return;

    // Return a promise that resolves when background is drawn
    return new Promise((resolve) => {
        if (backgroundElement instanceof HTMLVideoElement) {
            const loopCount = parseInt(document.getElementById('loop-count').value);
            const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount) / 1000;
            const elapsed = (performance.now() - startTime) / 1000;
            const animationProgress = elapsed % totalDuration;
            const targetTime = videoStartTime + animationProgress;
            
            if (Math.abs(backgroundElement.currentTime - targetTime) > 0.1) {
                backgroundElement.currentTime = targetTime % backgroundElement.duration;
            }
        }

        const xOffset = parseInt(cropX.value);
        const yOffset = parseInt(cropY.value);
        const baseZoom = parseInt(zoomControl.value) / 100;
        
        let animationZoom = 1;
        if (zoomAnimationActive) {
            const now = performance.now();
            if (!zoomStartTime) zoomStartTime = now;
            
            const loopCount = parseInt(document.getElementById('loop-count').value);
            const totalDuration = (FRAME_DURATION * FRAMES_IN_SEQUENCE * loopCount);
            const elapsed = now - zoomStartTime;
            
            if (elapsed >= totalDuration) {
                zoomStartTime = now;
            }
            
            const progress = (elapsed % totalDuration) / totalDuration;
            const zoomProgress = Math.sin(progress * Math.PI * 2) * 0.5 + 0.5;
            animationZoom = 1 + ((MAX_ZOOM - MIN_ZOOM) / 100 * zoomProgress);
        }

        const finalZoom = baseZoom * animationZoom;

        const drawImage = (source) => {
            const containerRatio = ctx.canvas.width / ctx.canvas.height;
            const mediaRatio = source.width / source.height;
            
            let width, height, offsetX, offsetY;
            if (mediaRatio > containerRatio) {
                height = ctx.canvas.height * finalZoom;
                width = height * mediaRatio;
            } else {
                width = ctx.canvas.width * finalZoom;
                height = width / mediaRatio;
            }
            
            offsetX = ((ctx.canvas.width - width) * xOffset / 100);
            offsetY = ((ctx.canvas.height - height) * yOffset / 100);

            ctx.save();
            if (mirrorX || mirrorY) {
                ctx.translate(ctx.canvas.width/2, ctx.canvas.height/2);
                ctx.scale(mirrorX ? -1 : 1, mirrorY ? -1 : 1);
                ctx.translate(-ctx.canvas.width/2, -ctx.canvas.height/2);
            }
            
            ctx.drawImage(source, offsetX, offsetY, width, height);
            ctx.restore();
        };

        if ('createImageBitmap' in window) {
            createImageBitmap(backgroundElement)
                .then(bitmap => {
                    drawImage(bitmap);
                    bitmap.close();
                    resolve();
                })
                .catch(() => {
                    // Fallback if createImageBitmap fails
                    drawImage(backgroundElement);
                    resolve();
                });
        } else {
            drawImage(backgroundElement);
            resolve();
        }
    });
}

// Move all event listener attachments into a function
function attachEventListeners() {
    // Add event listeners for controls
    if (zoomControl) zoomControl.addEventListener('input', updatePreview);
    if (cropX) cropX.addEventListener('input', updatePreview);
    if (cropY) cropY.addEventListener('input', updatePreview);

    // Add loop count change listener
    const loopCountInput = document.getElementById('loop-count');
    if (loopCountInput) {
        loopCountInput.addEventListener('input', function(e) {
            document.getElementById('loop-count-display').textContent = e.target.value;
            updateDurationDisplay();
            if (zoomAnimationActive) {
                zoomStartTime = 0; // Reset zoom animation
            }
        });
    }

    // Add background upload listener
    const backgroundUpload = document.getElementById('background-upload');
    if (backgroundUpload) {
        backgroundUpload.addEventListener('change', handleBackgroundUpload);
    }

    // Add high quality change listener
    const highQualityInput = document.getElementById('high-quality');
    if (highQualityInput) {
        highQualityInput.addEventListener('change', function(e) {
            const loopInput = document.getElementById('loop-count');
            if (e.target.checked) {
                loopInput.max = Math.floor(MAX_LOOPS.normal * 0.6);
                if (parseInt(loopInput.value) > loopInput.max) {
                    loopInput.value = loopInput.max;
                }
            } else {
                loopInput.max = MAX_LOOPS.normal;
            }
            updateDurationDisplay();
        });
    }
}

// Update the initialization order
async function initializeApp() {
    try {
        // First initialize canvases
        initializeCanvases();
        
        // Then load resources
        await loadLogoImage();
        console.log('Logo loaded successfully');
        
        // Initialize the piggy GIF
        const piggyElement = document.getElementById('piggy-gif');
        if (!piggyElement) {
            throw new Error('Piggy GIF element not found');
        }
        
        piggyElement.crossOrigin = "anonymous";
        
        // Initialize SuperGif
        piggyGif = new SuperGif({ 
            gif: piggyElement,
            auto_play: false 
        });

        // Load the GIF
        await new Promise((resolve, reject) => {
            piggyGif.load(() => {
                console.log('GIF loaded');
                resolve();
            });
        });

        // Attach event listeners
        attachEventListeners();
        
        // Finally start animation loop
        startAnimationLoop();
    } catch (error) {
        console.error('Failed to initialize:', error);
        alert('Failed to initialize application: ' + error.message);
    }
}

// Wait for full page load, not just DOM
window.addEventListener('load', () => {
    initializeApp().catch(error => {
        console.error('Initialization failed:', error);
    });
});

// Add this function back (after removing the old initialization)
function loadLogoImage() {
    return new Promise((resolve, reject) => {
        if (logoImage && logoImage.complete) {
            resolve(logoImage);
            return;
        }
        
        logoImage = new Image();
        logoImage.crossOrigin = "anonymous";
        
        logoImage.onload = () => {
            console.log('Logo loaded successfully');
            logoVisible = true;
            resolve(logoImage);
        };
        
        logoImage.onerror = (e) => {
            console.error('Error loading logo image:', e);
            logoAnimationActive = false;
            logoVisible = false;
            reject(e);
        };
        
        logoImage.src = LOGO_URL;
    });
}

// Add performance monitoring
let frameCount = 0;
let lastFPSUpdate = performance.now();
let currentFPS = 0;

function updateFPS() {
    const now = performance.now();
    const delta = now - lastFPSUpdate;
    
    if (delta >= 1000) { // Update every second
        currentFPS = Math.round((frameCount * 1000) / delta);
        frameCount = 0;
        lastFPSUpdate = now;
        
        // Adjust performance settings if needed
        if (currentFPS < 30) {
            PERFORMANCE_CONFIG.MAX_PARTICLES = Math.max(5, PERFORMANCE_CONFIG.MAX_PARTICLES - 2);
            PERFORMANCE_CONFIG.THROTTLE_PARTICLES = true;
        }
    }
    frameCount++;
}