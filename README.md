# NeuroLens

**Multimodal Cognitive Fatigue & Mental Overload Detection System**

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)
![ONNX](https://img.shields.io/badge/ONNX_Runtime-1.18-7B68EE)
![Gemini](https://img.shields.io/badge/Gemini_1.5_Flash-API-4285F4?logo=google&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--v3-blue)
![Author](https://img.shields.io/badge/Author-Aaditya%20Anand-red)
![Stars](https://img.shields.io/github/stars/Aaditya-Anand11/NeuroLens?style=social)

---

## Problem Statement

Cognitive fatigue is a silent epidemic in modern knowledge work:

- **20% of road accidents** are caused by driver fatigue (AAA Foundation, 2024)
- **$136 billion/year** in lost productivity due to fatigue-related presenteeism in the US alone (American Journal of Health Promotion)
- **76% of workers** report feeling burned out at least sometimes (Gallup, 2023)
- Traditional fatigue detection relies on **expensive wearable hardware** (EEG headsets, smartwatches) that creates friction and privacy concerns

NeuroLens solves this by detecting cognitive fatigue **non-invasively** using only a standard laptop webcam, microphone, keyboard, and mouse — hardware every knowledge worker already has.

---

## Architecture Overview

```
                    +------------------+
                    |   Next.js 14     |
                    |   Dashboard UI   |
                    |  (Port 3000)     |
                    +--------+---------+
                             |
                    WebSocket + REST API
                             |
                    +--------+---------+
                    |   FastAPI Server  |
                    |   (Port 8000)    |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------+--+  +-------+---+  +-------+----+
     | Face/Vision|  | Eye Track |  | Biometrics |
     | MediaPipe  |  | Gaze Est. |  | Keys+Mouse |
     | MobileNetV3|  | MPIIGaze  |  | Fitts' Law |
     +--------+--+  +-------+---+  +-------+----+
              |              |              |
              +--------------+--------------+
                             |
                    +--------+---------+       +------------------+
                    |  Audio Stress    |       |  XGBoost Fusion  |
                    |  Librosa + LSTM  |       |  Meta-Learner    |
                    +--------+---------+       +--------+---------+
                             |                          |
                             +--------------------------+
                                         |
                                +--------+---------+
                                | Cognitive Load   |
                                | Index (CLI) 0-100|
                                +--------+---------+
                                         |
                                +--------+---------+
                                | Intervention     |
                                | Engine           |
                                | Rules + Gemini   |
                                +------------------+
```

### Data Flow

1. **Webcam frames** (640x480 JPEG) are sent via WebSocket at 5 FPS
2. **Audio chunks** (16kHz float32 PCM) are streamed alongside video
3. **Keyboard/mouse events** are batched and sent with each frame
4. Each **modality analyzer** produces an independent fatigue sub-score (0-100)
5. The **XGBoost fusion engine** combines sub-scores into a unified CLI score
6. The **intervention engine** evaluates rules and optionally calls Gemini for personalized suggestions
7. Results stream back to the frontend via WebSocket in real-time

---

## How Each Modality Works

### 1. Facial Vision Analysis (`face_vision.py`)

Uses **MediaPipe FaceMesh** (468 landmarks) for real-time facial analysis:

- **Blink Rate**: Computed via Eye Aspect Ratio (EAR) from 6 eye landmarks per eye. Normal range: 15-20 blinks/min. Significantly reduced blink rate indicates screen fixation fatigue.
- **PERCLOS** (Percentage of Eye Closure): The gold-standard drowsiness metric from the transportation research community (Dinges, 1998). Tracks the percentage of time eyes are >80% closed over a 60-second sliding window. PERCLOS > 15% = significant drowsiness.
- **Head Pose Estimation**: Uses `cv2.solvePnP` with 6 facial landmarks mapped to a 3D face model to compute pitch, yaw, and roll angles. Head nodding/tilting indicates drowsiness.
- **Micro-Expression Classification**: A fine-tuned **MobileNetV3** (exported to ONNX) classifies facial expressions into 8 categories (neutral, happy, sad, surprise, fear, disgust, anger, contempt). Sustained negative expressions correlate with stress and fatigue.

### 2. Eye Tracking (`eye_tracking.py`)

Software-based gaze estimation without hardware eye tracker:

- **Gaze Direction**: Iris position relative to eye corners provides horizontal/vertical gaze estimates (similar to MPIIGaze approach).
- **Fixation Stability**: Computed as the inverse of gaze point variance over a 2-second window. Declining stability indicates attention fragmentation.
- **Saccade Detection**: Rapid gaze shifts (>30 deg/s) are counted per minute. Excessive saccades indicate difficulty maintaining focus.
- **Microsleep Detection**: Eye closure events lasting >500ms are flagged as microsleeps — brief involuntary sleep episodes that are a critical fatigue indicator.

### 3. Behavioral Biometrics (`biometrics.py`)

Keystroke dynamics and mouse movement analysis:

- **Dwell Time**: Duration each key is held down. Increases with fatigue as motor control degrades.
- **Flight Time**: Inter-key interval. Becomes more variable with cognitive load.
- **Typing Rhythm Entropy**: Shannon entropy of inter-key intervals, binned into 20 bins. Higher entropy = more irregular rhythm = possible fatigue.
- **Error Rate**: Backspace/Delete frequency as a fraction of total keystrokes.
- **Mouse Jitter**: High-frequency positional noise computed as standard deviation over a sliding 5-sample window.
- **Velocity Decay**: Comparison of average mouse velocity in the first vs. second half of the analysis window. Declining velocity indicates motor fatigue.
- **Fitts' Law Deviation**: Compares actual click-to-click movement time against Fitts' Law prediction (MT = a + b * log2(2D/W + 1)). Larger deviations indicate impaired motor planning.

### 4. Audio Stress Analysis (`audio_stress.py`)

Voice-based stress and fatigue detection:

- **Speech Rate**: Estimated from energy peaks (syllable nuclei detection) using RMS energy thresholding. Decreasing speech rate correlates with fatigue.
- **Fundamental Frequency (F0)**: Extracted via `librosa.pyin`. F0 drops as vocal cord tension decreases with fatigue. Mean F0 drop of >10% from baseline is significant.
- **Vocal Tremor**: Computed as the ratio of spectral energy in the 4-8 Hz modulation band of the F0 contour. Tremor increases under stress and fatigue.
- **Silence Ratio**: Proportion of frames below -40 dB. High silence ratio combined with previous speech activity may indicate disengagement.
- **Arousal-Valence Mapping**: Features are mapped to a 2D arousal-valence plane using a lightweight LSTM model (or heuristic fallback). Low arousal + negative valence = fatigue.

### 5. Fusion Engine (`ensemble.py`)

Late-fusion multimodal architecture:

- Each modality produces a sub-score (0-100)
- An **XGBoost meta-learner** (or weighted average fallback) combines sub-scores with derived features (max, min, std, vision+eye average) into a unified **Cognitive Load Index (CLI)**
- Exponential Moving Average (EMA, alpha=0.3) smooths the CLI to prevent jitter
- CLI maps to four fatigue stages:
  - **Alert** (0-30): Normal cognitive state
  - **Borderline** (31-55): Early signs of fatigue
  - **Fatigued** (56-75): Significant fatigue indicators
  - **Critical** (76-100): Immediate intervention needed

---

## Setup Instructions

### Prerequisites

- Python 3.11+
- Node.js 20+
- Webcam and microphone
- (Optional) GEMINI_API_KEY for LLM-powered interventions

### Manual Setup

**Backend:**

```bash
cd neurolens/backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn neurolens.backend.main:app --host 0.0.0.0 --port 8000 --reload
```

**Frontend:**

```bash
cd neurolens/frontend
npm install
npm run dev
```

**Environment Variables:**

```bash
# Optional: Enable Gemini-powered intervention messages
export GEMINI_API_KEY=your_api_key_here

# Optional: Override API URLs (defaults shown)
export NEXT_PUBLIC_API_URL=http://localhost:8000
export NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### Docker Setup

```bash
cd neurolens

# Optional: Set Gemini API key
export GEMINI_API_KEY=your_api_key_here

docker-compose up --build
```

The dashboard will be available at `http://localhost:3000` and the API at `http://localhost:8000`.

### ONNX Models

Place your trained ONNX model files in the `models/` directory:

- `mobilenetv3_expression.onnx` — MobileNetV3 fine-tuned on AffectNet/RAF-DB for expression classification
- `mpiigaze_regression.onnx` — MPIIGaze-style gaze regression model
- `audio_stress_lstm.onnx` — LSTM for audio arousal-valence prediction
- `xgboost_fusion.onnx` — XGBoost meta-learner for multimodal fusion

All models are optional — the system uses heuristic fallbacks when ONNX models are not available.

---

## Core Features

### Calibration Module
60-second onboarding session that establishes personalized baselines for blink rate, PERCLOS, typing speed, rhythm entropy, mouse jitter, gaze stability, F0, and speech rate. These baselines ensure fatigue detection is tailored to each individual.

### Live Dashboard
WebSocket-connected real-time monitoring showing:
- Live webcam feed with MediaPipe face mesh overlay
- CLI score gauge chart (0-100)
- Per-modality sub-scores with progress bars
- Detailed metrics (blink rate, PERCLOS, expression, WPM, gaze stability, microsleep)
- Session timeline with fatigue curve
- Real-time intervention alerts

### Session Replay
Post-session analysis with:
- Fatigue timeline chart showing CLI over time
- Modality sub-score overlays
- Intervention event markers on the timeline
- Summary statistics (average CLI, peak CLI, duration, intervention count)

### Intervention Engine
Hybrid rule-based + LLM architecture:
- **Static rules** trigger fast alerts for critical conditions (microsleep, PERCLOS > 15%, CLI > 85)
- **Gemini 1.5 Flash** generates contextual, personalized suggestions using session metadata (time of day, session length, dominant trigger modality, user history)
- Per-rule cooldowns prevent alert fatigue
- Desktop push notifications for critical alerts

### Privacy-First Architecture
- All CV/ML inference runs locally via ONNX Runtime
- No video/audio recordings are ever persisted
- Only computed metrics are stored in local SQLite
- One-click data wipe from the Privacy page
- Full transparency: the Privacy page documents exactly what data is collected and how

### REST API
- `POST /api/session/start` — Start a monitoring session
- `POST /api/session/stop` — Stop the active session
- `GET /api/session` — List sessions
- `GET /api/fatigue/history?session_id=N` — Fatigue timeline for a session
- `GET /api/interventions` — Intervention log
- `POST /api/calibrate` — Start/check/complete calibration
- `POST /api/biometric/event` — Record keystroke/mouse events
- `POST /api/privacy/wipe` — Delete all user data
- `WS /ws/fatigue` — Real-time fatigue streaming

---

## Demo

<!-- Replace with actual demo GIF -->
![Demo GIF Placeholder](https://via.placeholder.com/800x400?text=NeuroLens+Demo+GIF)

---

## Key Differentiators

| Feature | NeuroLens | Typical Solutions |
|---------|-----------|-------------------|
| Hardware Required | Laptop webcam + mic only | EEG headset, smartwatch, eye tracker |
| Cloud Dependency | Zero (ONNX edge inference) | Cloud ML APIs |
| Signal Fusion | 4-modality late fusion | Single signal (usually blink only) |
| Personalization | 60s calibration, per-user baselines | Fixed thresholds |
| Interventions | LLM-generated, context-aware | Beep/vibrate alerts |
| Output Granularity | Continuous 0-100 score + timeline | Binary tired/not-tired |
| Privacy | All processing on-device | Video uploaded to cloud |

---

## Research References

- **PERCLOS**: Dinges, D.F. (1998). "PERCLOS: A valid psychophysiological measure of alertness as assessed by psychomotor vigilance." FHWA-MCRT-98-006.
- **AffectNet**: Mollahosseini, A., Hasani, B., & Mahoor, M.H. (2019). "AffectNet: A database for facial expression, valence, and arousal computing in the wild." IEEE TAFFC.
- **RAF-DB**: Li, S., et al. (2017). "Reliable crowdsourcing and deep locality-preserving learning for expression recognition in the wild." CVPR.
- **MPIIGaze**: Zhang, X., et al. (2017). "It's written all over your face: Full-face appearance-based gaze estimation." CVPR Workshops.
- **Fitts' Law**: Fitts, P.M. (1954). "The information capacity of the human motor system in controlling the amplitude of movement." Journal of Experimental Psychology.
- **OpenSMILE**: Eyben, F., et al. (2010). "openSMILE: The Munich versatile and fast open-source audio feature extractor." ACM Multimedia.
- **Keystroke Dynamics**: Monrose, F., & Rubin, A.D. (2000). "Keystroke dynamics as a biometric for authentication." Future Generation Computer Systems.
- **XGBoost**: Chen, T., & Guestrin, C. (2016). "XGBoost: A scalable tree boosting system." KDD.

---

## Privacy Guarantee

NeuroLens is built with a **privacy-first architecture**:

1. **All ML inference runs locally** via ONNX Runtime — no video, audio, or raw biometric data ever leaves your device
2. **No recordings are saved** — raw frames and audio chunks are processed in real-time and immediately discarded
3. **Only computed metrics are stored** — fatigue scores, sub-scores, and timestamps in a local SQLite database
4. **Keystroke content is never captured** — only timing patterns (dwell time, flight time) are analyzed
5. **Optional Gemini API calls** send only computed scores and session metadata — never raw sensor data
6. **One-click data wipe** permanently deletes all stored data from the Privacy page

---

## Future Roadmap

- [ ] **EEG Integration**: Add support for consumer-grade EEG headbands (Muse, NeuroSky) for neural signal fusion
- [ ] **Chrome Extension**: Browser extension to capture tab switching, scroll behavior, and reading patterns as additional fatigue signals
- [ ] **Mobile App**: React Native companion app for commute fatigue monitoring via front camera
- [ ] **Team Dashboard**: Manager-facing anonymized team fatigue heatmaps (opt-in only)
- [ ] **Circadian Modeling**: Incorporate time-of-day fatigue curves and sleep debt estimation
- [ ] **Wearable Fusion**: Optional Apple Watch / Fitbit heart rate variability (HRV) integration
- [ ] **Adaptive Break Scheduler**: Auto-schedule Pomodoro breaks based on predicted fatigue trajectory
- [ ] **Multi-Language Voice Analysis**: Expand audio analysis beyond English prosody
- [ ] **Federated Calibration**: Improve baseline estimation by learning from anonymized population statistics without sharing individual data

---

---

## Author

**Aaditya Anand**

- GitHub: [@Aaditya-Anand11](https://github.com/Aaditya-Anand11)
- Email: aa5256@srmist.edu.in

> This project was designed and built entirely by Aaditya Anand.
> Any use, fork, or derivative work **must** include clear attribution to the original author as required by the AGPL-3.0 license.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)** — see [LICENSE](LICENSE) for full details.

**What this means:**
- You **must** give credit to the original author (Aaditya Anand) in any use or derivative work
- You **must** open-source any modifications under the same license
- You **may NOT** claim this work as your own or remove attribution

Copyright © 2024 Aaditya Anand. All rights reserved.
