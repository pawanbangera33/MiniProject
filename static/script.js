// script.js - JavaScript for the index page

document.addEventListener('DOMContentLoaded', function() {
    const imageInput = document.getElementById('imageInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsDiv = document.getElementById('results');
    const resultContent = document.getElementById('resultContent');
    const imagePreview = document.getElementById('imagePreview');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');

    // Handle image selection
    imageInput.addEventListener('change', function(e) {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze';

            // Show image preview
            displayImagePreview(file);
        } else {
            analyzeBtn.disabled = true;
            analyzeBtn.textContent = 'Analyze';
            imagePreview.style.display = 'none';
        }
    });

    // Handle image analysis
    analyzeBtn.addEventListener('click', async function() {
        const file = imageInput.files[0];
        if (!file) {
            showError('Please select an image first.');
            return;
        }

        // Show loading state
        analyzeBtn.disabled = true;
        analyzeBtn.textContent = 'Analyzing...';

        try {
            // Create FormData for file upload
            const formData = new FormData();
            formData.append('file', file);

            // Send request to server
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (response.ok) {
                displayResults(result);
            } else {
                showError(result.error || 'An error occurred during analysis.');
            }
        } catch (error) {
            showError('Network error. Please try again.');
            console.error('Upload error:', error);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.textContent = 'Analyze';
        }
    });

    function displayResults(result) {
        resultsDiv.style.display = 'block';

        const painProb = (result.pain_prob * 100).toFixed(2);
        const label = result.label;
        const hasFace = result.has_face ? 'Yes' : 'No';

        resultContent.innerHTML = `
            <div class="result-item">
                <span class="result-label">Classification:</span>
                <span class="result-value">${label}</span>
            </div>
            <div class="result-item">
                <span class="result-label">Pain Probability:</span>
                <span class="result-value">${painProb}%</span>
            </div>
            <div class="result-item">
                <span class="result-label">Face Detected:</span>
                <span class="result-value">${hasFace}</span>
            </div>
        `;

        // Scroll to results
        resultsDiv.scrollIntoView({ behavior: 'smooth' });
    }

    function displayImagePreview(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';
            imagePreview.style.maxWidth = '300px';
            imagePreview.style.maxHeight = '300px';
            imagePreview.style.borderRadius = '8px';
            imagePreview.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
            imagePreview.style.marginTop = '20px';
        };
        reader.readAsDataURL(file);
    }

    function showError(message) {
        resultsDiv.style.display = 'block';
        resultContent.innerHTML = `
            <div class="alert alert-error">
                <strong>Error:</strong> ${message}
            </div>
        `;
    }
});
