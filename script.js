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
            
            // Get position values from sliders (0-100)
            const xOffset = parseInt(cropX.value);
            const yOffset = parseInt(cropY.value);
            
            // Calculate aspect ratio preserving dimensions
            let width, height, offsetX, offsetY;
            
            const containerRatio = canvas.width / canvas.height;
            const mediaRatio = (backgroundElement instanceof HTMLVideoElement) 
                ? backgroundElement.videoWidth / backgroundElement.videoHeight
                : backgroundElement.width / backgroundElement.height;
            
            if (mediaRatio > containerRatio) {
                height = canvas.height * finalZoom;
                width = height * mediaRatio;
                // Apply horizontal adjustment
                offsetX = ((canvas.width - width) * xOffset / 100);
                offsetY = ((canvas.height - height) * yOffset / 100);
            } else {
                width = canvas.width * finalZoom;
                height = width / mediaRatio;
                // Apply vertical adjustment
                offsetX = ((canvas.width - width) * xOffset / 100);
                offsetY = ((canvas.height - height) * yOffset / 100);
            }
            
            ctx.drawImage(backgroundElement, offsetX, offsetY, width, height);
        }
    }
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        
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
        
        // Draw piggy on top
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
    
    // Check if MediaRecorder is available
    if (typeof MediaRecorder === 'undefined') {
        alert('Your browser does not support video recording. Please try Chrome or Firefox.');
        return;
    }
    
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    
    let supportedMimeType;
    const mimeTypes = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4'
    ];
    
    // Find first supported mime type
    for (const type of mimeTypes) {
        try {
            if (MediaRecorder.isTypeSupported(type)) {
                supportedMimeType = type;
                break;
            }
        } catch (e) {
            console.warn('Error checking mime type:', type, e);
        }
    }
    
    if (!supportedMimeType) {
        alert('No supported video format found. Please try Chrome or Firefox.');
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
        
        // Create blobs for both formats
        async function createBlob(mimeType) {
            const mediaRecorder = new MediaRecorder(mediaStream, {
                mimeType: mimeType,
                videoBitsPerSecond: isHighQuality ? 2000000 : 1000000
            });
            
            const chunks = [];
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            
            const recordingPromise = new Promise((resolve, reject) => {
                mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
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

            return recordingPromise;
        }

        // Create both WebM and MP4 versions
        const webmBlob = await createBlob('video/webm;codecs=vp9');
        const mp4Blob = await createBlob('video/mp4');
        
        loadingDiv.remove();

        const webmUrl = URL.createObjectURL(webmBlob);
        const mp4Url = URL.createObjectURL(mp4Blob);
        const webmSize = webmBlob.size / 1024;
        const mp4Size = mp4Blob.size / 1024;

        const exportDiv = document.createElement('div');
        exportDiv.className = 'export-dialog';
        
        exportDiv.innerHTML = `
            <h3>Export Sticker</h3>
            ${(webmSize > 256 || mp4Size > 256) ? 
                `<p class="size-warning">Warning: File size exceeds Telegram's 256KB limit!</p>` 
                : ''}
            <div class="format-group">
                <h4>WebM Format (${webmSize.toFixed(1)}KB)</h4>
                <button onclick="downloadSticker('${webmUrl}', 'telegram', 'webm')">
                    Download for Telegram
                </button>
                <button onclick="downloadSticker('${webmUrl}', 'discord', 'webm')">
                    Download for Discord
                </button>
            </div>
            <div class="format-group">
                <h4>MP4 Format (${mp4Size.toFixed(1)}KB)</h4>
                <button onclick="downloadSticker('${mp4Url}', 'telegram', 'mp4')">
                    Download for Telegram
                </button>
                <button onclick="downloadSticker('${mp4Url}', 'discord', 'mp4')">
                    Download for Discord
                </button>
            </div>
            ${(webmSize > 256 || mp4Size > 256) ? `
                <button onclick="compressAndExport(${Math.min(webmSize, mp4Size)})">
                    Try Compress (Experimental)
                </button>
            ` : ''}
            <button class="cancel" onclick="this.parentElement.remove()">Cancel</button>
            <p style="font-size: 12px; margin-top: 10px;">
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