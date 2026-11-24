from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, emit
import cv2
import base64
import numpy as np
from pain_detector import PainDetector
import threading
import time

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

# Global variables
detector = None
camera = None
streaming = False

def initialize_detector():
    global detector
    try:
        detector = PainDetector()
        print("Pain detector initialized successfully.")
    except Exception as e:
        print(f"Error initializing detector: {e}")
        detector = None

def get_camera():
    """Get camera capture object, trying different sources."""
    global camera

    if camera and camera.isOpened():
        return camera

    # Try DroidCam first
    droidcam_ip = '192.168.0.103'  # Default IP
    droidcam_url = f'http://{droidcam_ip}:4747/video'
    camera = cv2.VideoCapture(droidcam_url)
    if camera.isOpened():
        ret, _ = camera.read()
        if ret:
            print(f"Connected to DroidCam at {droidcam_url}")
            return camera
        else:
            camera.release()

    # Fallback to built-in webcam
    for i in range(5):
        camera = cv2.VideoCapture(i)
        if camera.isOpened():
            ret, _ = camera.read()
            if ret:
                print(f"Connected to built-in camera at index {i}")
                return camera
            else:
                camera.release()

    print("Could not connect to any camera.")
    return None

def video_stream():
    """Background thread for video streaming."""
    global streaming, detector, camera
    frame_count = 0

    while streaming:
        if not camera or not camera.isOpened():
            camera = get_camera()
            if not camera:
                time.sleep(1)
                continue

        ret, frame = camera.read()
        if not ret:
            time.sleep(0.1)
            continue

        frame_count += 1

        # Process frame with pain detection
        if detector:
            processed_frame, pain_prob, has_face, label = detector.process_frame_for_display(frame)

            # Debug logging
            if frame_count % 30 == 0:  # Log every 30 frames (~1 second at 30fps)
                print(f"Frame {frame_count}: pain_prob={pain_prob:.3f}, has_face={has_face}, label={label}")

            # Encode frame as base64 for web transmission
            _, buffer = cv2.imencode('.jpg', processed_frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')

            # Emit frame and detection results
            socketio.emit('video_frame', {
                'frame': frame_base64,
                'pain_prob': pain_prob,
                'has_face': has_face,
                'label': label
            })
        else:
            # If detector not available, just send raw frame
            _, buffer = cv2.imencode('.jpg', frame)
            frame_base64 = base64.b64encode(buffer).decode('utf-8')
            socketio.emit('video_frame', {
                'frame': frame_base64,
                'pain_prob': 0.0,
                'has_face': False,
                'label': 'Detector not loaded'
            })

        time.sleep(0.1)  # ~10 FPS

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/live')
def live():
    return render_template('live.html')

@app.route('/upload', methods=['POST'])
def upload_image():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if file:
        # Read image file
        file_bytes = np.frombuffer(file.read(), np.uint8)
        image = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if image is None:
            return jsonify({'error': 'Invalid image file'}), 400

        # Perform pain detection
        if detector:
            pain_prob, has_face, label, face_bbox = detector.predict_pain(image)
            return jsonify({
                'pain_prob': pain_prob,
                'has_face': has_face,
                'label': label,
                'face_bbox': face_bbox
            })
        else:
            return jsonify({'error': 'Detector not initialized'}), 500

@app.route('/process_frame', methods=['POST'])
def process_frame():
    if 'frame' not in request.files:
        return jsonify({'error': 'No frame uploaded'}), 400

    file = request.files['frame']
    if file:
        # Read frame
        file_bytes = np.frombuffer(file.read(), np.uint8)
        frame = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({'error': 'Invalid frame'}), 400

        # Perform pain detection
        if detector:
            pain_prob, has_face, label, face_bbox = detector.predict_pain(frame)
            return jsonify({
                'pain_prob': pain_prob,
                'has_face': has_face,
                'label': label,
                'face_bbox': face_bbox
            })
        else:
            return jsonify({'error': 'Detector not initialized'}), 500

@socketio.on('start_stream')
def start_stream():
    global streaming
    if not streaming:
        streaming = True
        thread = threading.Thread(target=video_stream)
        thread.daemon = True
        thread.start()
        emit('stream_started')

@socketio.on('stop_stream')
def stop_stream():
    global streaming
    streaming = False
    emit('stream_stopped')

if __name__ == '__main__':
    initialize_detector()

    print("\n" + "="*60)
    print("FACIAL PAIN DETECTION SYSTEM STARTED")
    print("="*60)
    print("Local Access:")
    print("   http://127.0.0.1:5000")
    print("   http://localhost:5000")
    print("="*60)
    print("Available Pages:")
    print("   /         - Home page (Image upload & analysis)")
    print("   /live     - Live pain detection (Real-time camera)")
    print("="*60)
    print("Press Ctrl+C to stop the server")
    print("="*60 + "\n")

    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
