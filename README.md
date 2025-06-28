# 👁️ Humanity Vision Web App

A multi-modal AI health monitoring app for web browsers, combining pupil size detection, gaze tracking, sleep analysis, and food recognition. Built using React (frontend), FastAPI (AI service), Node.js (backend), PostgreSQL (database), and cloud tunneling (Cloudflare).

---

## 📁 Project Structure

```
Pupil_App/
├── frontend/              # React app (camera UI, graphs, menus)
├── backend/               # Node.js API layer (future expansion)
├── ai-service/            # Python FastAPI service with MediaPipe, OpenCV
├── node_modules/          # Installed modules
├── package.json           # Root-level config for shared scripts (optional)
```

---

## 🧠 Features

### ✅ Pupil Size Detection
- Live webcam feed
- Annotated iris landmarks
- Pupil diameter measurement
- Chart.js time series graph
- CSV export with metadata

### ✅ Sleep Analysis *(via Sahha API)*
- Background sleep stage detection
- Medical-grade accuracy
- HIPAA-compliant

### ✅ Food Analysis *(via Passio SDK)*
- Real-time food detection
- 3D volume estimation via LiDAR (iPhone)
- Japanese food recognition

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/Humanity_PAP.git
cd Pupil_App
```

---

### 2. Setup `ai-service` (Python + FastAPI)

```bash
cd ai-service
python -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

📦 `requirements.txt`

```
fastapi
uvicorn
python-multipart
mediapipe
opencv-python
numpy
```

---

### 3. Setup Frontend (React)

```bash
cd ../frontend
npm install
npm start
```

📍 This runs the frontend on `http://localhost:3000`

---

### 4. (Optional) Setup Cloudflare Tunnel

If you need remote access to your AI service from a mobile browser:

```bash
npx cloudflared tunnel --url http://localhost:8000
```

Use the returned `https://*.trycloudflare.com/analyze/` URL in your frontend `fetch` calls.

---

## 📊 Export Format (CSV)

The exported pupil size CSV includes:
- Subject ID
- Project ID
- Stimulus Content ID
- Serial numbers
- Dominant Eye
- Timestamped pupil measurements
- Graph labels: `LX, LY, LP, RX, RY, RP, LUMINANCE`

---

## 🛠️ Technologies Used

| Layer         | Tech Stack                             |
|--------------|-----------------------------------------|
| Frontend     | React, Chart.js                         |
| Backend      | Node.js (future expansion)              |
| AI Service   | Python, FastAPI, MediaPipe, OpenCV      |
| DB           | PostgreSQL (planned integration)        |
| Deployment   | Cloudflare Tunnels, AWS (future)        |

---

## 📱 Future Enhancements

- Database integration for historical tracking
- Enhanced gaze shift analytics
- Responsive offline PWA support
- Passio + Sahha native SDKs for mobile

---

## 🧑‍⚕️ Disclaimer

This app is a **prototype** and not intended for medical diagnosis. Always consult a healthcare provider for professional advice.

---

