// ============================================
// RadiAI — Frontend Application Logic
// Multi-page professional medical interface
// ============================================

(function () {
  'use strict';

  const API_BASE = window.location.origin;
  const MAX_FILE_SIZE = 20 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const HISTORY_KEY = 'radiai_history';

  // ========================================
  // NAVIGATION
  // ========================================

  const mainNav = document.getElementById('mainNav');
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');

  // Scrolled nav style
  if (mainNav) {
    window.addEventListener('scroll', () => {
      mainNav.classList.toggle('scrolled', window.scrollY > 20);
    });
  }

  // Mobile nav toggle
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
    // Close on link click
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => navLinks.classList.remove('open'));
    });
  }

  // ========================================
  // ANALYZE PAGE LOGIC
  // ========================================

  const uploadZone = document.getElementById('uploadZone');
  if (!uploadZone) {
    // Not on analyze page — init history page if needed
    initHistoryPage();
    return;
  }

  const fileInput = document.getElementById('fileInput');
  const imagePreview = document.getElementById('imagePreview');
  const previewImg = document.getElementById('previewImg');
  const removeBtn = document.getElementById('removeBtn');
  const fileNameEl = document.getElementById('fileName');
  const fileSizeEl = document.getElementById('fileSize');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const loadingSubtext = document.getElementById('loadingSubtext');
  const loadingProgressBar = document.getElementById('loadingProgressBar');
  const errorMessage = document.getElementById('errorMessage');
  const errorTitle = document.getElementById('errorTitle');
  const errorText = document.getElementById('errorText');
  const resultsSection = document.getElementById('resultsSection');
  const newAnalysisBtn = document.getElementById('newAnalysisBtn');

  // Form
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
  const resultsTimestamp = document.getElementById('resultsTimestamp');

  let selectedFile = null;

  const loadingMessages = [
    'Processing image with AI vision model...',
    'Evaluating image quality and positioning...',
    'Analyzing anatomical structures...',
    'Scanning for abnormalities...',
    'Identifying potential findings...',
    'Generating differential diagnoses...',
    'Assessing severity and urgency...',
    'Compiling analysis report...'
  ];

  // --- File Upload ---
  uploadZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });

  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault(); uploadZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });

  removeBtn.addEventListener('click', (e) => { e.stopPropagation(); clearFile(); });

  function handleFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      showError('Invalid File Format', 'Please upload a JPG, PNG, or WebP image file.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      showError('File Too Large', `Maximum file size is ${MAX_FILE_SIZE / (1024*1024)}MB. Your file is ${(file.size/(1024*1024)).toFixed(1)}MB.`);
      return;
    }

    selectedFile = file;
    hideError();

    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      imagePreview.classList.add('visible');
      uploadZone.style.display = 'none';
    };
    reader.readAsDataURL(file);

    fileNameEl.textContent = file.name;
    fileSizeEl.textContent = formatFileSize(file.size);
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

  // --- Analysis ---
  analyzeBtn.addEventListener('click', () => { if (selectedFile) performAnalysis(); });

  async function performAnalysis() {
    showLoading();
    hideError();
    resultsSection.classList.remove('visible');

    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % loadingMessages.length;
      loadingSubtext.textContent = loadingMessages[msgIndex];
    }, 2500);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);
      if (patientAge.value) formData.append('age', patientAge.value);
      if (patientSex.value) formData.append('sex', patientSex.value);
      if (xrayType.value) formData.append('xray_type', xrayType.value);
      if (patientSymptoms.value) formData.append('symptoms', patientSymptoms.value);
      if (medicalHistory.value) formData.append('medical_history', medicalHistory.value);

      const response = await fetch(`${API_BASE}/api/analyze`, { method: 'POST', body: formData });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server error (${response.status})`);
      }

      const result = await response.json();
      renderResults(result);
      saveToHistory(result);

    } catch (err) {
      console.error('Analysis error:', err);
      showError('Analysis Failed', err.message || 'Unable to connect to the server. Make sure it is running.');
    } finally {
      clearInterval(msgInterval);
      hideLoading();
    }
  }

  // --- Render Results ---
  function renderResults(data) {
    const analysis = data.analysis || {};

    // Timestamp
    if (resultsTimestamp) {
      const d = new Date(data.timestamp || Date.now());
      resultsTimestamp.textContent = d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    }

    // Urgency
    const urgency = (analysis.urgency || 'ROUTINE').toUpperCase();
    urgencyBadge.textContent = urgency;
    urgencyBadge.className = 'badge';
    if (urgency.includes('EMERGENT')) urgencyBadge.classList.add('badge-emergent');
    else if (urgency.includes('URGENT')) urgencyBadge.classList.add('badge-urgent');
    else urgencyBadge.classList.add('badge-routine');

    // Confidence
    const confidence = (analysis.confidence_level || 'MODERATE').toUpperCase();
    confidenceBadge.textContent = `Confidence: ${confidence}`;
    confidenceBadge.className = 'badge badge-confidence';
    if (confidence.includes('HIGH')) confidenceBadge.classList.add('high');
    else if (confidence.includes('LOW')) confidenceBadge.classList.add('low');
    else confidenceBadge.classList.add('moderate');

    // Patient Summary
    const summaryCard = document.getElementById('summaryCard');
    const summaryText = document.getElementById('patientSummaryText');
    if (summaryCard && summaryText) {
      if (analysis.patient_friendly_summary) {
        summaryText.textContent = analysis.patient_friendly_summary;
        summaryCard.style.display = 'block';
      } else {
        summaryCard.style.display = 'none';
      }
    }

    // Quality
    const quality = analysis.image_quality || 'Not assessed';
    const ql = quality.toLowerCase();
    qualityDot.className = 'quality-dot';
    if (ql.includes('good') || ql.includes('excellent')) qualityDot.classList.add('good');
    else if (ql.includes('poor')) qualityDot.classList.add('poor');
    else qualityDot.classList.add('acceptable');
    qualityText.textContent = quality;

    // Body part
    bodyPartText.textContent = analysis.body_part || 'Not identified';

    // Findings
    renderFindings(analysis.findings || []);
    renderDiagnoses(analysis.differential_diagnoses || []);
    renderRecommendations(analysis.recommendations || []);
    renderNotes(analysis.important_notes || []);

    resultsSection.classList.add('visible');
    setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
  }

  function renderFindings(findings) {
    if (!findings.length) { findingsList.innerHTML = '<p style="color:var(--text-muted)">No specific findings reported.</p>'; return; }
    findingsList.innerHTML = findings.map(f => {
      if (typeof f === 'string') return `<div class="finding-item"><div class="finding-name">${esc(f)}</div></div>`;
      const sev = (f.severity || '').toLowerCase();
      const cls = ['mild','moderate','severe'].includes(sev) ? sev : '';
      return `<div class="finding-item ${cls}">
        <div class="finding-name">${esc(f.finding || f.description || 'Finding')}</div>
        ${f.characteristics ? `<div class="finding-detail">${esc(f.characteristics)}</div>` : ''}
        ${f.location ? `<div class="finding-location">Location: ${esc(f.location)}</div>` : ''}
        ${sev ? `<span class="finding-severity-tag ${cls}">${sev}</span>` : ''}
      </div>`;
    }).join('');
  }

  function renderDiagnoses(dx) {
    if (!dx.length) { diagnosesList.innerHTML = '<p style="color:var(--text-muted)">No differential diagnoses generated.</p>'; return; }
    diagnosesList.innerHTML = dx.map(d => {
      if (typeof d === 'string') return `<div class="diagnosis-item"><div class="diagnosis-content"><div class="diagnosis-name">${esc(d)}</div></div></div>`;
      const lk = (d.likelihood || 'possible').toLowerCase();
      const lkCls = ['likely','possible','unlikely'].includes(lk) ? lk : 'possible';
      return `<div class="diagnosis-item">
        <div class="diagnosis-likelihood">
          <div class="likelihood-label ${lkCls}">${lk}</div>
          <div class="likelihood-bar"><div class="likelihood-fill ${lkCls}"></div></div>
        </div>
        <div class="diagnosis-content">
          <div class="diagnosis-name">${esc(d.diagnosis || d.condition || 'Condition')}</div>
          ${d.reasoning ? `<div class="diagnosis-reasoning">${esc(d.reasoning)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function renderRecommendations(recs) {
    if (!recs.length) { recommendationsList.innerHTML = '<p style="color:var(--text-muted)">No specific recommendations.</p>'; return; }
    recommendationsList.innerHTML = recs.map(r => `<div class="recommendation-item"><span class="rec-icon">&#8594;</span><span>${esc(typeof r === 'string' ? r : r.recommendation || '')}</span></div>`).join('');
  }

  function renderNotes(notes) {
    if (!notes.length) { notesList.innerHTML = '<p style="color:var(--text-muted)">--</p>'; return; }
    notesList.innerHTML = notes.map(n => `<div class="note-item"><span class="note-icon">&#9888;&#65039;</span><span>${esc(typeof n === 'string' ? n : n.note || '')}</span></div>`).join('');
  }

  // --- New Analysis ---
  if (newAnalysisBtn) {
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
  }

  // ========================================
  // HISTORY
  // ========================================

  function saveToHistory(result) {
    const history = getHistory();
    history.unshift({
      id: Date.now().toString(),
      timestamp: result.timestamp || new Date().toISOString(),
      bodyPart: result.analysis?.body_part || 'Unknown',
      urgency: result.analysis?.urgency || 'ROUTINE',
      findingsCount: (result.analysis?.findings || []).length,
      confidence: result.analysis?.confidence_level || 'MODERATE',
      imageName: result.image_path || selectedFile?.name || 'Unknown',
      analysis: result.analysis,
    });
    if (history.length > 50) history.pop();
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch { return []; }
  }

  // ========================================
  // HISTORY PAGE
  // ========================================

  function initHistoryPage() {
    const historyListEl = document.getElementById('historyList');
    if (!historyListEl) return;

    const totalEl = document.getElementById('totalAnalyses');
    const clearBtn = document.getElementById('clearHistoryBtn');
    const modal = document.getElementById('historyModal');
    const modalClose = document.getElementById('modalClose');
    const modalBody = document.getElementById('modalBody');

    const history = getHistory();

    if (totalEl) totalEl.textContent = history.length;

    if (!history.length) {
      historyListEl.innerHTML = `<div class="empty-state">
        <div class="empty-icon">&#128237;</div>
        <h3 class="empty-title">No Analyses Yet</h3>
        <p class="empty-desc">Upload an X-ray image to get your first AI-powered analysis.</p>
        <a href="/analyze" class="btn btn-primary">Start Analysis</a>
      </div>`;
      return;
    }

    historyListEl.innerHTML = history.map(entry => {
      const d = new Date(entry.timestamp);
      const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const urgency = (entry.urgency || 'ROUTINE').toUpperCase();
      let badgeClass = 'badge-routine';
      if (urgency.includes('EMERGENT')) badgeClass = 'badge-emergent';
      else if (urgency.includes('URGENT')) badgeClass = 'badge-urgent';

      return `<div class="history-item" data-id="${entry.id}">
        <div class="history-item-header">
          <span class="badge ${badgeClass}" style="font-size:0.65rem">${urgency}</span>
          <span class="history-item-date">${dateStr} ${timeStr}</span>
        </div>
        <div class="history-item-body">${esc(entry.bodyPart)}</div>
        <div class="history-item-findings">${entry.findingsCount} finding(s) &bull; ${entry.confidence} confidence</div>
      </div>`;
    }).join('');

    // Click to show modal
    historyListEl.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.id;
        const entry = history.find(e => e.id === id);
        if (!entry || !modal || !modalBody) return;
        openHistoryModal(entry, modal, modalBody);
      });
    });

    // Clear history
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Clear all analysis history? This cannot be undone.')) {
          localStorage.removeItem(HISTORY_KEY);
          location.reload();
        }
      });
    }

    // Modal close
    if (modalClose && modal) {
      modalClose.addEventListener('click', () => modal.classList.remove('active'));
      modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
    }
  }

  function openHistoryModal(entry, modal, modalBody) {
    const a = entry.analysis || {};
    const d = new Date(entry.timestamp);

    let html = `<p style="color:var(--text-muted);font-size:0.82rem;margin-bottom:16px">${d.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}</p>`;

    // Body part & quality
    html += `<div class="modal-section">
      <div class="modal-section-title">Anatomical Region</div>
      <p style="color:var(--text-heading);font-weight:600;font-size:1.1rem">${esc(a.body_part || 'Unknown')}</p>
    </div>`;

    if (a.image_quality) {
      html += `<div class="modal-section">
        <div class="modal-section-title">Image Quality</div>
        <p style="color:var(--text-secondary)">${esc(a.image_quality)}</p>
      </div>`;
    }

    // Findings
    if (a.findings && a.findings.length) {
      html += `<div class="modal-section"><div class="modal-section-title">Findings</div>`;
      a.findings.forEach(f => {
        if (typeof f === 'string') {
          html += `<div class="modal-finding"><div class="modal-finding-name">${esc(f)}</div></div>`;
        } else {
          html += `<div class="modal-finding">
            <div class="modal-finding-name">${esc(f.finding || '')}</div>
            ${f.characteristics ? `<div class="modal-finding-detail">${esc(f.characteristics)}</div>` : ''}
            ${f.location ? `<div class="modal-finding-detail" style="font-style:italic">Location: ${esc(f.location)}</div>` : ''}
          </div>`;
        }
      });
      html += '</div>';
    }

    // Diagnoses
    if (a.differential_diagnoses && a.differential_diagnoses.length) {
      html += `<div class="modal-section"><div class="modal-section-title">Differential Diagnoses</div>`;
      a.differential_diagnoses.forEach(d => {
        if (typeof d === 'string') {
          html += `<div class="modal-finding"><div class="modal-finding-name">${esc(d)}</div></div>`;
        } else {
          html += `<div class="modal-finding">
            <div class="modal-finding-name">${esc(d.diagnosis || '')} <span style="color:var(--accent-blue);font-size:0.75rem;font-weight:600">${(d.likelihood||'').toUpperCase()}</span></div>
            ${d.reasoning ? `<div class="modal-finding-detail">${esc(d.reasoning)}</div>` : ''}
          </div>`;
        }
      });
      html += '</div>';
    }

    // Recommendations
    if (a.recommendations && a.recommendations.length) {
      html += `<div class="modal-section"><div class="modal-section-title">Recommendations</div>`;
      a.recommendations.forEach(r => {
        html += `<div style="display:flex;gap:8px;padding:4px 0;color:var(--text-secondary);font-size:0.88rem"><span style="color:var(--accent-blue)">&#8594;</span><span>${esc(typeof r === 'string' ? r : '')}</span></div>`;
      });
      html += '</div>';
    }

    // Notes
    if (a.important_notes && a.important_notes.length) {
      html += `<div class="modal-section"><div class="modal-section-title">Important Notes</div>`;
      a.important_notes.forEach(n => {
        html += `<div style="display:flex;gap:8px;padding:4px 0;font-size:0.82rem;color:var(--text-muted)"><span>&#9888;&#65039;</span><span>${esc(typeof n === 'string' ? n : '')}</span></div>`;
      });
      html += '</div>';
    }

    modalBody.innerHTML = html;
    modal.classList.add('active');
  }

  // ========================================
  // UI HELPERS
  // ========================================

  function showLoading() {
    if (loadingOverlay) {
      loadingOverlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      // Reset progress bar animation
      if (loadingProgressBar) {
        loadingProgressBar.style.animation = 'none';
        loadingProgressBar.offsetHeight; // trigger reflow
        loadingProgressBar.style.animation = '';
      }
    }
  }

  function hideLoading() {
    if (loadingOverlay) {
      loadingOverlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  function showError(title, message) {
    if (errorMessage) {
      errorTitle.textContent = title;
      errorText.textContent = message;
      errorMessage.classList.add('visible');
    }
  }

  function hideError() {
    if (errorMessage) errorMessage.classList.remove('visible');
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

})();
