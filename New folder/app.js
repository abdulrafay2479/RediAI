// ============================================
// AI X-RAY READER — Frontend Application Logic
// ============================================

(function () {
  'use strict';

  // --- Config ---
  const API_BASE = 'http://localhost:5000';
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const HISTORY_KEY = 'radiai_history';

  // --- DOM Elements ---
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const removeBtn = document.getElementById('removeBtn');
  const fileName = document.getElementById('fileName');
  const fileSize = document.getElementById('fileSize');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingSubtext = document.getElementById('loadingSubtext');
  const errorMessage = document.getElementById('errorMessage');
  const errorTitle = document.getElementById('errorTitle');
  const errorText = document.getElementById('errorText');
  const resultsSection = document.getElementById('resultsSection');
  const newAnalysisBtn = document.getElementById('newAnalysisBtn');
  const historyList = document.getElementById('historyList');

  // Form elements
  const patientAge = document.getElementById('patientAge');
  const patientSex = document.getElementById('patientSex');
  const xrayType = document.getElementById('xrayType');
  const patientSymptoms = document.getElementById('patientSymptoms');
  const medicalHistory = document.getElementById('medicalHistory');

  // Result elements
  const urgencyBadge = document.getElementById('urgencyBadge');
  const confidenceBadge = document.getElementById('confidenceBadge');
  const qualityDot = document.getElementById('qualityDot');
  const qualityText = document.getElementById('qualityText');
  const bodyPartText = document.getElementById('bodyPartText');
  const findingsList = document.getElementById('findingsList');
  const diagnosesList = document.getElementById('diagnosesList');
  const recommendationsList = document.getElementById('recommendationsList');
  const notesList = document.getElementById('notesList');

  // --- State ---
  let selectedFile = null;

  // --- Loading Messages ---
  const loadingMessages = [
    'Processing image with AI vision model...',
    'Analyzing anatomical structures...',
    'Evaluating image quality and positioning...',
    'Identifying abnormalities...',
    'Generating differential diagnoses...',
    'Assessing severity and urgency...',
    'Compiling analysis report...'
  ];

  // ========================================
  // FILE UPLOAD HANDLING
  // ========================================

  // Click to upload
  uploadZone.addEventListener('click', () => fileInput.click());

  // File input change
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  });

  // Drag and drop
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('drag-over');
  });

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('drag-over');
  });

  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });

  // Remove image
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearFile();
  });

  function handleFile(file) {
    // Validate type
    if (!ALLOWED_TYPES.includes(file.type)) {
      showError('Invalid File Format', 'Please upload a JPG, PNG, or WebP image file.');
      return;
    }

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      showError('File Too Large', `Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
      return;
    }

    selectedFile = file;
    hideError();

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      imagePreview.classList.add('visible');
      uploadZone.style.display = 'none';
    };
    reader.readAsDataURL(file);

    // Update info
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);

    // Enable button
    analyzeBtn.disabled = false;
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = '';
    previewImg.src = '';
    imagePreview.classList.remove('visible');
    uploadZone.style.display = '';
    analyzeBtn.disabled = true;
    hideError();
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // ========================================
  // ANALYSIS
  // ========================================

  analyzeBtn.addEventListener('click', () => {
    if (!selectedFile) return;
    performAnalysis();
  });

  async function performAnalysis() {
    showLoading();
    hideError();
    resultsSection.classList.remove('visible');

    // Cycle loading messages
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      loadingSubtext.textContent = loadingMessages[msgIndex];
    }, 2500);

    try {
      // Build form data
      const formData = new FormData();
      formData.append('image', selectedFile);

      if (patientAge.value) formData.append('age', patientAge.value);
      if (patientSex.value) formData.append('sex', patientSex.value);
      if (xrayType.value) formData.append('xray_type', xrayType.value);
      if (patientSymptoms.value) formData.append('symptoms', patientSymptoms.value);
      if (medicalHistory.value) formData.append('medical_history', medicalHistory.value);

      // API call
      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server error (${response.status})`);
      }

      const result = await response.json();

      // Render results
      renderResults(result);

      // Save to history
      saveToHistory(result);

    } catch (err) {
      console.error('Analysis error:', err);
      showError('Analysis Failed', err.message || 'Unable to connect to the analysis server. Make sure the server is running.');
    } finally {
      clearInterval(msgInterval);
      hideLoading();
    }
  }

  // ========================================
  // RENDER RESULTS
  // ========================================

  function renderResults(data) {
    const analysis = data.analysis || {};

    // Urgency badge
    const urgency = (analysis.urgency || 'ROUTINE').toUpperCase();
    urgencyBadge.textContent = urgency;
    urgencyBadge.className = 'badge';
    if (urgency.includes('EMERGENT')) urgencyBadge.classList.add('badge-emergent');
    else if (urgency.includes('URGENT')) urgencyBadge.classList.add('badge-urgent');
    else urgencyBadge.classList.add('badge-routine');

    // Confidence badge
    const confidence = (analysis.confidence_level || 'MODERATE').toUpperCase();
    confidenceBadge.textContent = `Confidence: ${confidence}`;
    confidenceBadge.className = 'badge badge-confidence';
    if (confidence.includes('HIGH')) confidenceBadge.classList.add('high');
    else if (confidence.includes('LOW')) confidenceBadge.classList.add('low');
    else confidenceBadge.classList.add('moderate');

    // Image quality
    const quality = analysis.image_quality || 'Not assessed';
    const qualityLower = quality.toLowerCase();
    qualityDot.className = 'quality-dot';
    if (qualityLower.includes('good') || qualityLower.includes('excellent')) qualityDot.classList.add('good');
    else if (qualityLower.includes('poor')) qualityDot.classList.add('poor');
    else qualityDot.classList.add('acceptable');
    qualityText.textContent = quality;

    // Body part
    bodyPartText.textContent = analysis.body_part || 'Not identified';

    // Findings
    renderFindings(analysis.findings || []);

    // Differential diagnoses
    renderDiagnoses(analysis.differential_diagnoses || []);

    // Recommendations
    renderRecommendations(analysis.recommendations || []);

    // Notes
    renderNotes(analysis.important_notes || []);

    // Show results
    resultsSection.classList.add('visible');

    // Scroll to results
    setTimeout(() => {
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }

  function renderFindings(findings) {
    if (!findings.length) {
      findingsList.innerHTML = '<p style="color: var(--text-muted);">No specific findings reported.</p>';
      return;
    }

    findingsList.innerHTML = findings.map(f => {
      if (typeof f === 'string') {
        return `<div class="finding-item"><div class="finding-name">${escapeHtml(f)}</div></div>`;
      }

      const severity = (f.severity || '').toLowerCase();
      const severityClass = ['mild', 'moderate', 'severe'].includes(severity) ? severity : '';

      return `
        <div class="finding-item ${severityClass}">
          <div class="finding-name">${escapeHtml(f.finding || f.description || 'Finding')}</div>
          ${f.characteristics ? `<div class="finding-detail">${escapeHtml(f.characteristics)}</div>` : ''}
          ${f.location ? `<div class="finding-location">📍 ${escapeHtml(f.location)}</div>` : ''}
          ${severity ? `<span class="finding-severity-tag ${severityClass}">${severity}</span>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderDiagnoses(diagnoses) {
    if (!diagnoses.length) {
      diagnosesList.innerHTML = '<p style="color: var(--text-muted);">No differential diagnoses generated.</p>';
      return;
    }

    diagnosesList.innerHTML = diagnoses.map(d => {
      if (typeof d === 'string') {
        return `<div class="diagnosis-item"><div class="diagnosis-content"><div class="diagnosis-name">${escapeHtml(d)}</div></div></div>`;
      }

      const likelihood = (d.likelihood || 'possible').toLowerCase();
      const likelihoodClass = ['likely', 'possible', 'unlikely'].includes(likelihood) ? likelihood : 'possible';

      return `
        <div class="diagnosis-item">
          <div class="diagnosis-likelihood">
            <div class="likelihood-label ${likelihoodClass}">${likelihood}</div>
            <div class="likelihood-bar"><div class="likelihood-fill ${likelihoodClass}"></div></div>
          </div>
          <div class="diagnosis-content">
            <div class="diagnosis-name">${escapeHtml(d.diagnosis || d.condition || 'Condition')}</div>
            ${d.reasoning ? `<div class="diagnosis-reasoning">${escapeHtml(d.reasoning)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderRecommendations(recs) {
    if (!recs.length) {
      recommendationsList.innerHTML = '<p style="color: var(--text-muted);">No specific recommendations.</p>';
      return;
    }

    recommendationsList.innerHTML = recs.map(r => `
      <div class="recommendation-item">
        <span class="rec-icon">→</span>
        <span>${escapeHtml(typeof r === 'string' ? r : r.recommendation || r.action || '')}</span>
      </div>
    `).join('');
  }

  function renderNotes(notes) {
    if (!notes.length) {
      notesList.innerHTML = '<p style="color: var(--text-muted);">—</p>';
      return;
    }

    notesList.innerHTML = notes.map(n => `
      <div class="note-item">
        <span class="note-icon">⚠️</span>
        <span>${escapeHtml(typeof n === 'string' ? n : n.note || '')}</span>
      </div>
    `).join('');
  }

  // ========================================
  // HISTORY
  // ========================================

  function saveToHistory(result) {
    const history = getHistory();
    const entry = {
      id: Date.now().toString(),
      timestamp: result.timestamp || new Date().toISOString(),
      bodyPart: result.analysis?.body_part || 'Unknown',
      urgency: result.analysis?.urgency || 'ROUTINE',
      findingsCount: (result.analysis?.findings || []).length,
      confidence: result.analysis?.confidence_level || 'MODERATE',
      imageName: result.image_path || selectedFile?.name || 'Unknown',
      analysis: result.analysis,
    };

    history.unshift(entry);
    // Keep last 20
    if (history.length > 20) history.pop();

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    renderHistory();
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
    } catch {
      return [];
    }
  }

  function renderHistory() {
    const history = getHistory();

    if (!history.length) {
      historyList.innerHTML = '<div class="history-empty">No analyses yet. Upload an X-ray to get started.</div>';
      return;
    }

    historyList.innerHTML = history.map(entry => {
      const date = new Date(entry.timestamp);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      const urgency = (entry.urgency || 'ROUTINE').toUpperCase();
      let badgeClass = 'badge-routine';
      if (urgency.includes('EMERGENT')) badgeClass = 'badge-emergent';
      else if (urgency.includes('URGENT')) badgeClass = 'badge-urgent';

      return `
        <div class="history-item" data-id="${entry.id}" onclick="window.__loadHistory('${entry.id}')">
          <div class="history-item-header">
            <span class="badge ${badgeClass}" style="font-size: 0.65rem;">${urgency}</span>
            <span class="history-item-date">${dateStr} ${timeStr}</span>
          </div>
          <div class="history-item-body">
            <strong>${escapeHtml(entry.bodyPart)}</strong>
          </div>
          <div class="history-item-findings">${entry.findingsCount} finding(s) • ${entry.confidence} confidence</div>
        </div>
      `;
    }).join('');
  }

  // Expose loadHistory to inline onclick
  window.__loadHistory = function (id) {
    const history = getHistory();
    const entry = history.find(e => e.id === id);
    if (!entry) return;

    renderResults({
      timestamp: entry.timestamp,
      analysis: entry.analysis,
      image_path: entry.imageName,
    });
  };

  // ========================================
  // UI HELPERS
  // ========================================

  function showLoading() {
    loadingOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function hideLoading() {
    loadingOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function showError(title, message) {
    errorTitle.textContent = title;
    errorText.textContent = message;
    errorMessage.classList.add('visible');
  }

  function hideError() {
    errorMessage.classList.remove('visible');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // New Analysis button
  newAnalysisBtn.addEventListener('click', () => {
    resultsSection.classList.remove('visible');
    clearFile();
    patientAge.value = '';
    patientSex.value = '';
    xrayType.value = '';
    patientSymptoms.value = '';
    medicalHistory.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // ========================================
  // INIT
  // ========================================

  renderHistory();

})();
