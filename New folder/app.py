"""
RadiAI -- AI X-Ray Reader Backend
Multi-page Flask application with OpenRouter API integration.

DISCLAIMER: This tool provides preliminary analysis for educational purposes only.
It is NOT a medical diagnosis tool and does NOT replace professional medical advice.
"""

import os
import re
import json
import logging
import time
import hashlib
import base64
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, Any

from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from openai import OpenAI

# ============================================
# CONFIGURATION
# ============================================

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('radiai')

# Flask app
app = Flask(__name__, static_folder='static', template_folder='templates')
CORS(app)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

ALLOWED_EXTENSIONS = {'jpg', 'jpeg', 'png', 'webp'}

API_KEY = os.getenv('OPENROUTER_API_KEY', '')
MODEL = os.getenv('OPENROUTER_MODEL', 'anthropic/claude-3.5-sonnet')

if API_KEY:
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=API_KEY,
    )
else:
    client = None

# ============================================
# SYSTEM PROMPT
# ============================================

SYSTEM_PROMPT = """You are an expert medical imaging assistant trained to analyze X-ray images 
and provide preliminary diagnostic insights. Your role is to help patients 
and medical professionals understand X-ray findings.

IMPORTANT DISCLAIMERS:
- You provide PRELIMINARY ANALYSIS ONLY, not definitive diagnoses
- All findings must be reviewed by a qualified radiologist
- Users should always consult with a healthcare professional
- This tool is for educational and informational purposes

ANALYSIS FRAMEWORK:
When analyzing an X-ray, provide a structured report including:

1. IMAGE QUALITY ASSESSMENT
   - Technical quality (good/acceptable/poor)
   - Positioning and coverage
   - Any artifacts or limitations

2. ANATOMICAL IDENTIFICATION
   - What body part(s) are shown
   - Relevant anatomical landmarks identified
   - Comparison sides (if bilateral imaging)

3. PRIMARY FINDINGS
   - Normal versus abnormal findings
   - Location of findings using anatomical terminology
   - Size, density, and characteristic descriptions
   - Distribution patterns

4. DIFFERENTIAL CONSIDERATIONS
   - Potential diagnoses based on findings (prefixed with "may suggest" or "could indicate")
   - Common conditions that present similarly
   - Why certain conditions are more/less likely

5. SEVERITY ASSESSMENT
   - Acute versus chronic appearance
   - Urgency level (ROUTINE / URGENT / EMERGENT)
   - Potential impact on patient care

6. RECOMMENDATIONS
   - Suggested next steps (additional imaging, specialist consultation, etc.)
   - When immediate medical attention is needed
   - Clinical correlation recommendations

7. CONFIDENCE LEVEL
   - How confident you are in the findings (LOW / MODERATE / HIGH)
   - Factors affecting confidence
   - Limitations specific to this image

RESPONSE FORMAT:
You MUST return ONLY a valid JSON object with this exact structure (no markdown, no explanation outside JSON, no code fences):
{
  "patient_friendly_summary": "A highly compassionate, easy-to-understand summary of the results explained in plain English, avoiding complex medical jargon. Imagine you are explaining this to a regular patient.",
  "image_quality": "description of technical quality",
  "body_part": "identified anatomical region",
  "findings": [
    {
      "finding": "description of the finding",
      "location": "anatomical location",
      "severity": "mild/moderate/severe",
      "characteristics": "detailed description"
    }
  ],
  "differential_diagnoses": [
    {
      "diagnosis": "possible condition",
      "likelihood": "likely/possible/unlikely",
      "reasoning": "why this is considered"
    }
  ],
  "urgency": "ROUTINE or URGENT or EMERGENT",
  "recommendations": [
    "recommended action 1",
    "recommended action 2"
  ],
  "confidence_level": "LOW or MODERATE or HIGH",
  "confidence_reasoning": "explanation of confidence level",
  "important_notes": [
    "This is a preliminary analysis for educational purposes only",
    "All findings must be confirmed by a qualified radiologist"
  ]
}

CRITICAL RULES:
1. Always include disclaimer language in important_notes
2. Never provide definitive diagnosis - use conditional language
3. Flag any urgent findings immediately with URGENT or EMERGENT urgency
4. Be conservative - when in doubt, recommend specialist review
5. Provide anatomically correct terminology in the 'findings' array
6. The 'patient_friendly_summary' MUST be highly accessible to non-medical readers, using empathetic and simple language
7. If image quality is poor, explicitly state limitations
8. Do not diagnose conditions outside typical X-ray imaging scope
9. Consider patient context if provided
10. Always recommend radiologist review for final diagnosis
11. Return ONLY valid JSON -- no markdown code fences, no extra text before or after the JSON"""

SPECIALIZED_PROMPTS = {
    "chest": """Focus specifically on:
- Heart size and shape (cardiomegaly assessment, cardiothoracic ratio)
- Lung fields (consolidation, infiltrates, effusions, nodules, masses)
- Mediastinum (widening, masses, lymphadenopathy)
- Rib cage (fractures, deformities, lytic lesions)
- Diaphragm (clarity, elevation, free air)
- Costophrenic angles (blunting suggesting effusions)
- Hilar regions (lymphadenopathy, masses)
- Trachea (deviation, narrowing)
- Soft tissues and bones""",

    "bone": """Focus specifically on:
- Alignment (angulation, displacement, subluxation)
- Fracture lines (transverse, oblique, spiral, comminuted)
- Cortical integrity (disruption, thinning, thickening)
- Medullary canal (involvement, lesions)
- Soft tissues (swelling, foreign bodies, calcification)
- Joint spaces (narrowing, widening, effusion)
- Growth plates (in pediatric cases)
- Periosteal reaction (if present)
- Bone density (osteopenia, osteosclerosis)""",

    "abdominal": """Focus specifically on:
- Bowel gas pattern (distension, obstruction patterns)
- Air-fluid levels
- Free intraperitoneal air (perforation signs)
- Organ silhouettes (liver, spleen, kidneys)
- Vascular calcification (aortic, iliac)
- Calcifications (gallstones, kidney stones, pancreatic)
- Foreign bodies
- Psoas shadows
- Bony structures (spine, pelvis)""",

    "dental": """Focus specifically on:
- Tooth structure and integrity (enamel, dentin, pulp)
- Root morphology, length, and abnormalities
- Alveolar bone levels and periodontal status
- Periodontal ligament space
- Caries/cavities (interproximal, occlusal)
- Periapical pathology (abscess, granuloma, cyst)
- Previous restorations (fillings, crowns, implants)
- Impacted or supernumerary teeth
- TMJ assessment (if visible)""",

    "spine": """Focus specifically on:
- Vertebral alignment (scoliosis, kyphosis, lordosis)
- Vertebral body height and shape
- Disc spaces (narrowing, calcification)
- Facet joints
- Pedicles and posterior elements
- Spinal canal (stenosis signs)
- Paraspinal soft tissues
- Fractures (compression, burst, chance)
- Degenerative changes (osteophytes, sclerosis)"""
}


# ============================================
# HELPERS
# ============================================

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def build_user_prompt(patient_context: Dict[str, Any], xray_type: str = '') -> str:
    parts = ["Please analyze this X-ray image and provide a detailed medical report.\n"]

    if xray_type and xray_type in SPECIALIZED_PROMPTS:
        parts.append(f"This is a {xray_type.upper()} X-RAY.")
        parts.append(SPECIALIZED_PROMPTS[xray_type])
        parts.append("")

    has_context = False
    context_parts = ["PATIENT CONTEXT:"]
    for key, label in [('age', 'Age'), ('sex', 'Sex'), ('symptoms', 'Presenting symptoms'), ('medical_history', 'Relevant history')]:
        if patient_context.get(key):
            context_parts.append(f"- {label}: {patient_context[key]}")
            has_context = True
    if has_context:
        parts.append('\n'.join(context_parts))
        parts.append("")

    parts.append("""IMPORTANT: Respond with ONLY a valid JSON object. Do NOT wrap it in markdown code fences. Do NOT include any text before or after the JSON.
The JSON must contain these keys: image_quality, body_part, findings, differential_diagnoses, urgency, recommendations, confidence_level, confidence_reasoning, important_notes.
Use preliminary language. Emphasize the need for professional radiologist review.""")

    return '\n'.join(parts)


def parse_analysis_response(text: str) -> Dict[str, Any]:
    """Parse the OpenAI-style response, extracting JSON from the text."""
    # Clean up the text
    text = text.strip()
    
    # Try direct JSON parse first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try to find JSON in markdown code fences
    fence_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # Try to find any JSON object
    json_match = re.search(r'\{.*\}', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    # Fallback
    logger.warning("Could not parse JSON from response")
    return {
        "analysis_text": text,
        "image_quality": "Unable to parse structured response",
        "body_part": "See analysis text",
        "findings": [{"finding": text[:500], "location": "N/A", "severity": "moderate", "characteristics": "Raw AI response"}],
        "differential_diagnoses": [],
        "urgency": "ROUTINE",
        "recommendations": ["Please retry the analysis or consult a radiologist directly"],
        "confidence_level": "LOW",
        "confidence_reasoning": "Response could not be parsed into structured format",
        "important_notes": ["This is a preliminary analysis for educational purposes only"]
    }


def analyze_xray(image_path: str, patient_context: Dict[str, Any],
                  xray_type: str = '', max_retries: int = 3) -> Dict[str, Any]:
    """
    Core analysis function: sends X-ray to OpenRouter API (OpenAI compatibility layer).
    """
    if not client:
        raise ValueError(
            "OPENROUTER_API_KEY is not set. Get a free key at https://openrouter.ai "
            "and add it to your .env file."
        )

    # Encode image 
    base64_image = encode_image(image_path)
    extension = image_path.rsplit('.', 1)[1].lower()
    if extension == 'jpg': extension = 'jpeg'

    # Build prompt
    user_prompt = build_user_prompt(patient_context, xray_type)

    # Retry loop
    last_error = None
    for attempt in range(max_retries):
        try:
            logger.info(f"Sending X-ray to OpenRouter API (attempt {attempt+1}/{max_retries})")

            response = client.chat.completions.create(
                model=MODEL,
                messages=[
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": user_prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/{extension};base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=3000,
                temperature=0.3,
            )

            raw_text = response.choices[0].message.content
            analysis = parse_analysis_response(raw_text)

            result = {
                "timestamp": datetime.now().isoformat(),
                "image_path": Path(image_path).name,
                "analysis": analysis,
                "model": MODEL,
                "usage": {
                    "note": f"API usage tracked via OpenRouter API"
                }
            }

            logger.info("X-ray analysis completed successfully via OpenRouter")
            return result

        except Exception as e:
            error_str = str(e)
            logger.warning(f"Attempt {attempt+1} failed: {error_str}")

            if '429' in error_str or 'rate limit' in error_str.lower():
                wait_time = 2 ** attempt
                last_error = "Rate limited by API. Please wait a moment and try again."
                time.sleep(wait_time)
            elif '401' in error_str or 'unauthorized' in error_str.lower():
                raise ValueError("Invalid OpenRouter API key.")
            elif '403' in error_str or 'permission' in error_str.lower():
                raise ValueError("API key doesn't have permission.")
            else:
                last_error = f"API error: {error_str}"
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                else:
                    raise ValueError(last_error)

    raise ValueError(last_error or "Analysis failed after multiple retries")


# ============================================
# PAGE ROUTES
# ============================================

@app.route('/')
def home():
    return render_template('index.html', active_page='home')


@app.route('/analyze')
def analyze_page():
    return render_template('analyze.html', active_page='analyze')


@app.route('/history')
def history_page():
    return render_template('history.html', active_page='history')


@app.route('/about')
def about_page():
    return render_template('about.html', active_page='about')


# ============================================
# API ROUTES
# ============================================

@app.route('/api/health', methods=['GET'])
def health_check():
    api_key_set = bool(API_KEY)
    return jsonify({
        "status": "healthy",
        "service": "RadiAI X-Ray Reader",
        "model": MODEL,
        "api_key_set": api_key_set,
        "timestamp": datetime.now().isoformat(),
    }), 200


@app.route('/api/analyze', methods=['POST'])
def api_analyze():
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image file provided."}), 400

        file = request.files['image']
        if file.filename == '':
            return jsonify({"error": "No file selected."}), 400

        if not allowed_file(file.filename):
            return jsonify({"error": f"Invalid file format. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400

        filename = secure_filename(file.filename)
        name_hash = hashlib.md5(f"{filename}{time.time()}".encode()).hexdigest()[:8]
        safe_name = f"{name_hash}_{filename}"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_name)
        file.save(filepath)

        try:
            patient_context = {}
            if request.form.get('age'):
                try:
                    patient_context['age'] = int(request.form['age'])
                except ValueError:
                    patient_context['age'] = request.form['age']
            if request.form.get('sex'):
                patient_context['sex'] = request.form['sex']
            if request.form.get('symptoms'):
                patient_context['symptoms'] = request.form['symptoms']
            if request.form.get('medical_history'):
                patient_context['medical_history'] = request.form['medical_history']

            xray_type = request.form.get('xray_type', '')
            result = analyze_xray(filepath, patient_context, xray_type)
            return jsonify(result), 200

        finally:
            try:
                os.remove(filepath)
            except OSError:
                pass

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        return jsonify({"error": "An unexpected error occurred. Please try again."}), 500


# ============================================
# MAIN
# ============================================

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_DEBUG', 'true').lower() == 'true'

    print(f"""
================================================
         RadiAI -- AI X-Ray Reader
------------------------------------------------
  Server:  http://localhost:{port}
  Model:   {MODEL}
  API Key: {'SET' if API_KEY else 'NOT SET -- add to .env'}
  Pages:   Home | Analyze | History | About
------------------------------------------------
  Using OpenRouter Integration
================================================

  DISCLAIMER: For educational purposes only.
  Not a medical diagnosis tool.
""")

    app.run(host='0.0.0.0', port=port, debug=debug)
