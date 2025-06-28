from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import mediapipe as mp
import base64

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

LEFT_IRIS = [474, 475, 476, 477]
RIGHT_IRIS = [469, 470, 471, 472]

def calculate_iris_diameter(landmarks, indices, w, h):
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in indices]
    if len(pts) >= 4:
        return float(np.linalg.norm(np.array(pts[1]) - np.array(pts[3])))
    return 0.0

@app.post("/analyze/")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)

    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)

    image = cv2.flip(image, 1)
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    left_size, right_size = 0.0, 0.0
    if results.multi_face_landmarks:
        for landmarks in results.multi_face_landmarks:
            h, w, _ = image.shape

            for idx in LEFT_IRIS:
                pt = landmarks.landmark[idx]
                cv2.circle(image, (int(pt.x * w), int(pt.y * h)), 2, (0, 255, 0), -1)
            for idx in RIGHT_IRIS:
                pt = landmarks.landmark[idx]
                cv2.circle(image, (int(pt.x * w), int(pt.y * h)), 2, (255, 0, 0), -1)

            left_size = calculate_iris_diameter(landmarks.landmark, LEFT_IRIS, w, h)
            right_size = calculate_iris_diameter(landmarks.landmark, RIGHT_IRIS, w, h)

    _, buffer = cv2.imencode(".jpg", image)
    image_base64 = base64.b64encode(buffer).decode("utf-8")
    return {
        "left_pupil_size": left_size,
        "right_pupil_size": right_size,
        "annotated_image": f"data:image/jpeg;base64,{image_base64}"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
