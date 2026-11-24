import tensorflow as tf
import cv2
import numpy as np
import os

IMG_SIZE = 224

class PainDetector:
    def __init__(self, model_path='best_model.h5'):
        self.model_path = model_path
        self.model = None
        self.face_net = None
        self.load_model()
        self.load_face_detector()

    def load_model(self):
        """Load the pre-trained pain detection model."""
        if os.path.exists(self.model_path):
            self.model = tf.keras.models.load_model(self.model_path)
            print(f"Model loaded from {self.model_path}")
        else:
            raise FileNotFoundError(f"Model file {self.model_path} not found.")

    def load_face_detector(self):
        """Load Haar cascades for face detection."""
        # Try multiple possible cascade paths
        possible_paths = [
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml',
            cv2.data.haarcascades + 'haarcascade_frontalface_alt.xml',
            cv2.data.haarcascades + 'haarcascade_frontalface_alt2.xml',
            'haarcascade_frontalface_default.xml',  # Local file
        ]

        self.face_cascades = []
        for cascade_path in possible_paths:
            if os.path.exists(cascade_path):
                cascade = cv2.CascadeClassifier(cascade_path)
                if not cascade.empty():
                    self.face_cascades.append(cascade)
                    print(f"Face detector loaded successfully from: {cascade_path}")

        # If no cascades loaded, try to download it
        if not self.face_cascades:
            try:
                import urllib.request
                cascade_url = "https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml"
                cascade_path = "haarcascade_frontalface_default.xml"
                print("Downloading Haar cascade classifier...")
                urllib.request.urlretrieve(cascade_url, cascade_path)
                cascade = cv2.CascadeClassifier(cascade_path)
                if not cascade.empty():
                    self.face_cascades.append(cascade)
                    print("Face detector downloaded and loaded successfully.")
            except Exception as e:
                print(f"Failed to download cascade: {e}")

        if not self.face_cascades:
            print("Warning: Could not load Haar cascade classifier for face detection. Using entire image for prediction.")

    def preprocess_image(self, image):
        """
        Preprocess image for model prediction.
        - Detect face if possible, otherwise use entire image
        - Resize to model input size
        - Normalize
        Returns: (processed_image, has_face, face_bbox)
        """
        if image is None or image.size == 0:
            return None, False, None

        # Ensure image has valid dimensions
        if image.shape[0] < 20 or image.shape[1] < 20:
            print("Image too small for face detection")
            processed = cv2.resize(image, (IMG_SIZE, IMG_SIZE))
            processed = processed / 255.0
            processed = np.expand_dims(processed, axis=0)
            return processed, False, None

        # Convert to grayscale for face detection
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Use more conservative detection parameters to avoid OpenCV errors
        detection_configs = [
            {'scaleFactor': 1.1, 'minNeighbors': 5, 'minSize': (30, 30)},
            {'scaleFactor': 1.2, 'minNeighbors': 4, 'minSize': (30, 30)},
            {'scaleFactor': 1.3, 'minNeighbors': 3, 'minSize': (30, 30)},
        ]

        faces = []
        if self.face_cascades:
            for cascade in self.face_cascades:
                try:
                    for config in detection_configs:
                        detected_faces = cascade.detectMultiScale(
                            gray, **config
                        )
                        if len(detected_faces) > 0:
                            faces = detected_faces
                            print(f"Face detected with cascade and config: {config}")
                            break
                    if len(faces) > 0:
                        break
                except cv2.error as e:
                    print(f"OpenCV error with cascade: {e}")
                    continue

        face_bbox = None
        if len(faces) > 0:
            # Use the largest detected face
            faces = sorted(faces, key=lambda x: x[2] * x[3], reverse=True)
            x, y, w, h = faces[0]
            face_bbox = [int(x), int(y), int(w), int(h)]

            # Add some padding around the face
            padding = int(min(w, h) * 0.1)
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(image.shape[1] - x, w + 2 * padding)
            h = min(image.shape[0] - y, h + 2 * padding)

            face_roi = image[y:y+h, x:x+w]
            processed = cv2.resize(face_roi, (IMG_SIZE, IMG_SIZE))
            print(f"Face detected and processed: {x},{y},{w},{h}")
        else:
            # Use entire image if no face detected
            processed = cv2.resize(image, (IMG_SIZE, IMG_SIZE))
            print("No face detected, using entire image")

        # Normalize
        processed = processed / 255.0

        # Expand dimensions for model input
        processed = np.expand_dims(processed, axis=0)

        return processed, len(faces) > 0, face_bbox

    def predict_pain(self, image):
        """
        Predict pain probability from image.
        Returns: (pain_probability, has_face, label, face_bbox)
        """
        processed, has_face, face_bbox = self.preprocess_image(image)
        if processed is None:
            return 0.0, False, "Error", None

        prediction = self.model.predict(processed, verbose=0)
        pain_prob = float(prediction[0][0])

        threshold = 0.7
        label = "Pain" if pain_prob >= threshold else "No Pain"

        return pain_prob, has_face, label, face_bbox

    def process_frame_for_display(self, frame):
        """
        Process frame for display with pain detection overlay.
        Returns: (processed_frame, pain_prob, has_face, label)
        """
        pain_prob, has_face, label = self.predict_pain(frame)

        # Draw overlays
        if has_face:
            # Convert to grayscale for face detection
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = []
            for cascade in self.face_cascades:
                detected_faces = cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30)
                )
                if len(detected_faces) > 0:
                    faces = detected_faces
                    break

            for (x, y, w, h) in faces:
                color = (0, 0, 255) if label == "Pain" else (0, 255, 0)
                cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
                cv2.putText(frame, f"{label}: {pain_prob:.2f}",
                           (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
        else:
            color = (0, 0, 255) if label == "Pain" else (0, 255, 0)
            cv2.putText(frame, f"No Face - {label}: {pain_prob:.2f}",
                       (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, color, 2)

        return frame, pain_prob, has_face, label
