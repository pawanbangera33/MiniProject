// Enhanced Live Pain Detection JavaScript

let socket;
let videoElement;
let canvasElement;
let isStreaming = false;
let animationId;
let lastFrameTime = 0;
let frameCount = 0;
let fps = 0;

document.addEventListener('DOMContentLoaded', function() {
    videoElement = document.getElementById('videoElement');
    canvasElement = document.getElementById('canvasElement');

    // Initialize Socket.IO connection
    socket = io();

    // Socket event listeners
    socket.on('connect', function() {
        console.log('Connected to server');
        updateStatus('Connected', 'active');
    });

    socket.on('disconnect', function() {
        console.log('Disconnected from server');
        updateStatus('Disconnected', 'inactive');
    });

    socket.on('video_frame', function(data) {
        // Update results and draw overlays on canvas
        updateResults({
            pain_prob: data.pain_prob,
            has_face: data.has_face,
            label: data.label
        });

        // Draw detection overlays on canvas
        drawDetectionOverlay(data);
    });

    socket.on('stream_started', function() {
        console.log('Stream started');
        updateStatus('Streaming...', 'active');
    });

    socket.on('stream_stopped', function() {
        console.log('Stream stopped');
        updateStatus('Stopped', 'inactive');
    });

    // Button event listeners
    document.getElementById('startBtn').addEventListener('click', startDetection);
    document.getElementById('stopBtn').addEventListener('click', stopDetection);

    // Initialize camera access
    initializeCamera();
});

async function initializeCamera() {
    try {
        console.log('Requesting camera access...');

        // Check if getUserMedia is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser');
        }

        const constraints = {
            video: {
                width: { ideal: 640, min: 320 },
                height: { ideal: 480, min: 240 },
                facingMode: 'user'
            },
            audio: false
        };

        console.log('Using constraints:', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        console.log('Camera stream obtained:', stream);
        console.log('Stream tracks:', stream.getTracks());

        // Stop any existing streams first
        if (videoElement.srcObject) {
            videoElement.srcObject.getTracks().forEach(track => track.stop());
        }

        videoElement.srcObject = stream;

        // Wait for metadata to load
        await new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                console.log('Video metadata loaded:', videoElement.videoWidth, 'x', videoElement.videoHeight);
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                resolve();
            };
        });

        // Start playing the video
        await videoElement.play();
        console.log('Video playing successfully');

        updateStatus('Camera ready', 'active');
        console.log('Camera initialized successfully');

        // Add error handler for video element
        videoElement.onerror = function(e) {
            console.error('Video element error:', e);
            updateStatus('Video error', 'inactive');
        };

    } catch (error) {
        console.error('Error accessing camera:', error);
        updateStatus('Camera access denied', 'inactive');
        showAlert('Please allow camera access to use live detection. Error: ' + error.message, 'danger');
    }
}

function startDetection() {
    if (!isStreaming) {
        isStreaming = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        document.getElementById('overlay').style.display = 'block';
        document.getElementById('resultsPanel').style.display = 'block';

        updateStatus('Detecting...', 'active');

        // Start sending frames to server
        sendFrameToServer();

        // Start FPS calculation
        calculateFPS();
    }
}

function stopDetection() {
    if (isStreaming) {
        isStreaming = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('overlay').style.display = 'none';

        updateStatus('Stopped', 'inactive');

        // Stop streaming via Socket.IO
        socket.emit('stop_stream');

        // Clear canvas
        const ctx = canvasElement.getContext('2d');
        ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        // Stop FPS calculation
        if (animationId) {
            cancelAnimationFrame(animationId);
        }
    }
}

function sendFrameToServer() {
    if (!isStreaming) return;

    // Check if video is ready
    if (!videoElement || videoElement.readyState < 2) {
        console.log('Video not ready, skipping frame');
        setTimeout(sendFrameToServer, 100);
        return;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    console.log('Canvas dimensions:', canvas.width, 'x', canvas.height);
    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(function(blob) {
        if (!blob) {
            console.error('Failed to create blob from canvas');
            setTimeout(sendFrameToServer, 100);
            return;
        }

        console.log('Blob created, size:', blob.size);
        const formData = new FormData();
        formData.append('frame', blob);

        console.log('Sending frame to server...');
        fetch('/process_frame', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            console.log('Response received:', response);
            if (!response.ok) {
                throw new Error('HTTP error! status: ' + response.status);
            }
            return response.json();
        })
        .then(data => {
            console.log('Data received:', data);
            if (data.error) {
                console.error('Server error:', data.error);
            } else {
                // Update UI with detection results
                updateResults(data);
                drawDetectionOverlay(data);
            }
        })
        .catch(error => {
            console.error('Error sending frame:', error);
        });
    }, 'image/jpeg', 0.8);

    // Continue sending frames
    setTimeout(sendFrameToServer, 100); // 10 FPS
}

function updateResults(data) {
    document.getElementById('painLevel').textContent = data.pain_prob ? `${(data.pain_prob * 100).toFixed(1)}%` : '--';
    document.getElementById('confidence').textContent = data.pain_prob ? `${((1 - data.pain_prob) * 100).toFixed(1)}%` : '--';
    document.getElementById('faceCount').textContent = data.has_face ? '1' : '0';

    if (data.pain_prob > 0.7) {
        showAlert('High pain level detected! Please seek medical attention.', 'warning');
    }
}

function drawDetectionOverlay(data) {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Only draw frame and overlays when face is detected
    if (data.has_face) {
        // Draw the current video frame on canvas
        ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

        // Draw detection overlays
        ctx.fillStyle = data.label === 'Pain' ? '#ff4444' : '#44ff44';
        ctx.font = '20px Arial';
        const status = data.label === 'Pain' ? `PAIN DETECTED: ${(data.pain_prob * 100).toFixed(1)}%` : `NO PAIN: ${(data.pain_prob * 100).toFixed(1)}%`;
        ctx.fillText(status, 10, 30);

        // Draw bounding box around face if available
        if (data.face_bbox) {
            const [x, y, w, h] = data.face_bbox;
            ctx.strokeStyle = data.label === 'Pain' ? '#ff4444' : '#44ff44';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
        }
    }
    // Don't draw anything when no face is detected - canvas stays clear
}

function drawFaceBox(data) {
    const ctx = canvasElement.getContext('2d');
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    if (data.faces && data.faces.length > 0) {
        data.faces.forEach(face => {
            const [x, y, w, h] = face.bbox;

            // Draw bounding box
            ctx.strokeStyle = data.pain_detected ? '#ff4444' : '#44ff44';
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);

            // Draw label
            ctx.fillStyle = data.pain_detected ? '#ff4444' : '#44ff44';
            ctx.font = '16px Arial';
            const label = data.pain_detected ? `Pain: ${(face.pain_level * 100).toFixed(1)}%` : 'No Pain';
            ctx.fillText(label, x, y - 10);
        });
    }
}

function updateStatus(text, status) {
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');

    statusText.textContent = text;
    statusIndicator.className = `status-indicator ${status}`;
}

function showAlert(message, type) {
    const alertSystem = document.getElementById('alertSystem');
    const alertMessage = document.getElementById('alertMessage');

    alertMessage.textContent = message;
    alertSystem.style.display = 'block';
    alertSystem.className = `alert alert-${type}`;

    // Auto-hide after 5 seconds
    setTimeout(() => {
        alertSystem.style.display = 'none';
    }, 5000);
}

function calculateFPS() {
    const now = performance.now();
    frameCount++;

    if (now - lastFrameTime >= 1000) {
        fps = Math.round((frameCount * 1000) / (now - lastFrameTime));
        document.getElementById('fps').textContent = fps;
        frameCount = 0;
        lastFrameTime = now;
    }

    if (isStreaming) {
        animationId = requestAnimationFrame(calculateFPS);
    }
}

function toggleFullscreen() {
    const videoContainer = document.getElementById('videoContainer');

    if (!document.fullscreenElement) {
        videoContainer.requestFullscreen().catch(err => {
            console.error('Error attempting to enable fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

// Handle fullscreen changes
document.addEventListener('fullscreenchange', function() {
    const videoContainer = document.getElementById('videoContainer');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    if (document.fullscreenElement) {
        fullscreenBtn.innerHTML = '<i class="fas fa-compress"></i> Exit Fullscreen';
    } else {
        fullscreenBtn.innerHTML = '<i class="fas fa-expand"></i> Fullscreen';
    }
});

// Error handling
window.addEventListener('error', function(e) {
    console.error('JavaScript error:', e.error);
    updateStatus('Error occurred', 'inactive');
});

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (isStreaming) {
        stopDetection();
    }
    if (videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
    }
});
