from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import cv2
import numpy as np
import mediapipe as mp
import base64

from collections import deque

# Simple state to track past iris centers
iris_history = deque(maxlen=20)  # last 20 frames

def draw_gaze_shift_trail(image, trail):
    for i in range(1, len(trail)):
        pt1 = tuple(map(int, trail[i - 1]))
        pt2 = tuple(map(int, trail[i]))
        cv2.line(image, pt1, pt2, (0, 0, 255), 2)
    return image

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

def get_eye_center(landmarks, eye_indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in eye_indices]
    return np.mean(pts, axis=0), pts

def get_iris_center(landmarks, iris_indices, shape):
    h, w = shape
    pts = [(int(landmarks[idx].x * w), int(landmarks[idx].y * h)) for idx in iris_indices]
    return np.mean(pts, axis=0)

def get_blink_ratio(eye_pts):
    vertical = np.linalg.norm(eye_pts[2] - eye_pts[3])  # top-bottom
    horizontal = np.linalg.norm(eye_pts[0] - eye_pts[1])  # outer-inner
    return vertical / horizontal if horizontal else 0

def draw_arrow(frame, start, direction, label, color=(255, 0, 0)):
    end = (
        int(start[0] + direction[0] * 30),
        int(start[1] + direction[1] * 30)
    )
    if np.linalg.norm(direction) < 2:  # Considered "center"
        cv2.circle(frame, (int(start[0]), int(start[1])), 6, (0, 255, 0), -1)
    else:
        cv2.arrowedLine(frame, (int(start[0]), int(start[1])), end, color, 2, tipLength=0.3)
        cv2.putText(frame, label, (int(start[0]) - 10, int(start[1]) - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

def classify_direction(dx, dy):
    if abs(dx) < 1.5 and abs(dy) < 1.5:
        return "center"
    if abs(dx) > abs(dy):
        return "right" if dx > 0 else "left"
    else:
        return "down" if dy > 0 else "up"

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

    direction = "undetected"

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            left_eye_center, left_eye_pts = get_eye_center(face_landmarks.landmark, LEFT_EYE, (h, w))
            right_eye_center, right_eye_pts = get_eye_center(face_landmarks.landmark, RIGHT_EYE, (h, w))
            left_iris_center = get_iris_center(face_landmarks.landmark, LEFT_IRIS, (h, w))
            right_iris_center = get_iris_center(face_landmarks.landmark, RIGHT_IRIS, (h, w))

            left_eye_pts_arr = np.array(left_eye_pts)
            right_eye_pts_arr = np.array(right_eye_pts)

            # Blink detection
            left_ratio = get_blink_ratio(left_eye_pts_arr)
            right_ratio = get_blink_ratio(right_eye_pts_arr)
            if left_ratio < 0.2 and right_ratio < 0.2:
                direction = "blink"
                cv2.putText(image, "Blinking", (30, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2)
                break

            # Gaze vector
            left_vector = left_iris_center - np.mean(left_eye_pts_arr, axis=0)
            right_vector = right_iris_center - np.mean(right_eye_pts_arr, axis=0)
            avg_vector = (left_vector + right_vector) / 2
            dx, dy = avg_vector[0], avg_vector[1]

            # Direction classification
            abs_dx, abs_dy = abs(dx), abs(dy)
            if abs_dx < 5.0 and abs_dy < 5.0:
                direction = "forward"
                cv2.circle(image, (int(left_eye_center[0]), int(left_eye_center[1])), 6, (0, 255, 0), -1)
                cv2.circle(image, (int(right_eye_center[0]), int(right_eye_center[1])), 6, (0, 255, 0), -1)
            elif abs_dx > abs_dy:
                direction = "right" if dx > 0 else "left"
                draw_arrow(image, left_eye_center, left_vector, direction)
                draw_arrow(image, right_eye_center, right_vector, direction)
            else:
                direction = "down" if dy > 0 else "up"
                draw_arrow(image, left_eye_center, left_vector, direction)
                draw_arrow(image, right_eye_center, right_vector, direction)

    _, buffer = cv2.imencode(".jpg", image)
    image_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "annotated_image": f"data:image/jpeg;base64,{image_base64}",
        "direction": direction
    }

@app.post("/analyze/")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    image = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)

    if image is None:
        return JSONResponse(content={"error": "Invalid image"}, status_code=400)

    image = cv2.flip(image, 1)
    h, w, _ = image.shape
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = face_mesh.process(rgb)

    left_pupil_size = None
    right_pupil_size = None

    if results.multi_face_landmarks:
        for face_landmarks in results.multi_face_landmarks:
            left_iris_pts = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in LEFT_IRIS]
            right_iris_pts = [(int(face_landmarks.landmark[i].x * w), int(face_landmarks.landmark[i].y * h)) for i in RIGHT_IRIS]

            left_pupil_size = round(np.linalg.norm(np.array(left_iris_pts[0]) - np.array(left_iris_pts[2])), 2)
            right_pupil_size = round(np.linalg.norm(np.array(right_iris_pts[0]) - np.array(right_iris_pts[2])), 2)

            # Draw pupils
            for pt in left_iris_pts + right_iris_pts:
                cv2.circle(image, pt, 2, (0, 255, 255), -1)

    _, buffer = cv2.imencode(".jpg", image)
    image_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "annotated_image": f"data:image/jpeg;base64,{image_base64}",
        "left_pupil_size": left_pupil_size,
        "right_pupil_size": right_pupil_size
    }

@app.get("/ping")
def ping():
    return {"message": "AI service is alive"}

@app.post("/gaze_shift/")
async def gaze_shift(file: UploadFile = File(...)):
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
            # Get center of left and right iris
            left_iris_center = get_iris_center(face_landmarks.landmark, LEFT_IRIS, (h, w))
            right_iris_center = get_iris_center(face_landmarks.landmark, RIGHT_IRIS, (h, w))

            # Average gaze point
            avg_iris = ((left_iris_center[0] + right_iris_center[0]) / 2,
                        (left_iris_center[1] + right_iris_center[1]) / 2)

            iris_history.append(avg_iris)

            # Draw trail
            image = draw_gaze_shift_trail(image, list(iris_history))

            # Highlight current position
            cv2.circle(image, tuple(map(int, avg_iris)), 5, (0, 255, 255), -1)

    _, buffer = cv2.imencode(".jpg", image)
    image_base64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "annotated_image": f"data:image/jpeg;base64,{image_base64}"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
