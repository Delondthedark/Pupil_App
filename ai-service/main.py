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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FaceMesh setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=False,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
)

LEFT_EYE = [33, 133, 159, 145]
RIGHT_EYE = [362, 263, 386, 374]
LEFT_IRIS = [468, 469, 470, 471]
RIGHT_IRIS = [473, 474, 475, 476]

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


def get_eye_center(landmarks, eye_indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in eye_indices]
    return np.mean(pts, axis=0), pts

def get_iris_center(landmarks, iris_indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in iris_indices]
    return np.mean(pts, axis=0)

def draw_gaze_vector(frame, eye_center, gaze_vector, length=30, color=(0, 0, 255)):
    start = (int(eye_center[0]), int(eye_center[1]))
    end = (
        int(start[0] + gaze_vector[0] * length),
        int(start[1] + gaze_vector[1] * length)
    )
    cv2.arrowedLine(frame, start, end, color, 2, tipLength=0.3)

@app.post("/eye_direction/")
async def eye_direction(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)

    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)

    image = cv2.flip(image, 1)
    h, w, _ = image.shape
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            left_eye_center, left_eye_pts = get_eye_center(face_landmarks.landmark, LEFT_EYE, (h, w))
            right_eye_center, right_eye_pts = get_eye_center(face_landmarks.landmark, RIGHT_EYE, (h, w))
            left_iris_center = get_iris_center(face_landmarks.landmark, LEFT_IRIS, (h, w))
            right_iris_center = get_iris_center(face_landmarks.landmark, RIGHT_IRIS, (h, w))

            # Gaze vectors
            left_gaze = left_iris_center - np.mean(left_eye_pts, axis=0)
            right_gaze = right_iris_center - np.mean(right_eye_pts, axis=0)
            avg_gaze = (left_gaze + right_gaze) / 2

            # Draw arrows on the frame
            draw_gaze_vector(image, left_eye_center, left_gaze, length=40, color=(255, 0, 0))
            draw_gaze_vector(image, right_eye_center, right_gaze, length=40, color=(255, 0, 0))
            #center_between_eyes = (left_eye_center + right_eye_center) / 2
            #draw_gaze_vector(image, center_between_eyes, avg_gaze, length=60, color=(0, 255, 0))

    _, buffer = cv2.imencode(".jpg", image)
    image_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "annotated_image": f"data:image/jpeg;base64,{image_base64}"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
