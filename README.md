# Facial Pain Detection

A Flask app that estimates pain from uploaded images or a live camera stream using a TensorFlow model.

## Run locally

Make sure `best_model.h5` is in the project root, then install the dependencies and start the app:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` in your browser. Allow camera access to use live detection.

This project is for educational purposes only and is not a medical assessment or diagnosis.
