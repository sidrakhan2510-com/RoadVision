from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
from io import BytesIO
from pathlib import Path
from ultralytics import YOLO
from datetime import datetime
from uuid import uuid4
import base64
import sqlite3
import json

app = Flask(__name__)
CORS(app)

# Project folders
BASE_DIR = Path(__file__).parent
MODEL_PATH = BASE_DIR / "models" / "best.pt"
DATABASE_PATH = BASE_DIR / "roadvision_history.db"

UPLOAD_FOLDER = BASE_DIR / "uploads"
RESULTS_FOLDER = BASE_DIR / "results"

UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
RESULTS_FOLDER.mkdir(parents=True, exist_ok=True)


# SQLite database setup
def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def initialize_database():
    with get_db_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS detections (
                image_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                original_filename TEXT NOT NULL,
                result_filename TEXT NOT NULL,
                created_at TEXT NOT NULL,
                detections_count INTEGER NOT NULL,
                detections_json TEXT NOT NULL,
                image_width INTEGER NOT NULL,
                image_height INTEGER NOT NULL
            )
        """)
        connection.commit()


initialize_database()

# Load AI model
model = YOLO(str(MODEL_PATH))


@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "success",
        "message": "RoadVision AI is running"
    })


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "success",
        "message": "RoadVision AI model loaded"
    })


@app.route("/upload", methods=["POST"])
def upload_image():
    if "image" not in request.files:
        return jsonify({
            "status": "error",
            "error": "No image uploaded"
        }), 400

    file = request.files["image"]

    if not file.filename:
        return jsonify({
            "status": "error",
            "error": "Please select an image"
        }), 400

    try:
        image_bytes = file.read()
        image = Image.open(BytesIO(image_bytes)).convert("RGB")

        image_width, image_height = image.size
        image_id = uuid4().hex

        original_filename = f"{image_id}.jpg"
        result_filename = f"{image_id}.jpg"

        original_path = UPLOAD_FOLDER / original_filename
        result_path = RESULTS_FOLDER / result_filename

        # Save original image
        image.save(original_path, format="JPEG", quality=95)

        # Run pothole detection
        results = model.predict(
            source=image,
            conf=0.25,
            verbose=False
        )

        detections = []

        for result in results:
            for box in result.boxes:
                class_id = int(box.cls[0])
                confidence = float(box.conf[0])

                coordinates = [
                    round(float(value), 2)
                    for value in box.xyxy[0].tolist()
                ]

                x1, y1, x2, y2 = coordinates

                detections.append({
                    "class": result.names[class_id],
                    "confidence": round(confidence, 4),
                    "confidence_percent": round(confidence * 100, 2),
                    "box": coordinates,
                    "box_width": round(max(0, x2 - x1), 2),
                    "box_height": round(max(0, y2 - y1), 2)
                })

        # Draw bounding boxes
        annotated = results[0].plot()
        annotated_rgb = Image.fromarray(annotated[:, :, ::-1])

        # Save annotated result image
        annotated_rgb.save(
            result_path,
            format="JPEG",
            quality=95
        )

        # Encode annotated image for immediate frontend display
        buffer = BytesIO()
        annotated_rgb.save(buffer, format="JPEG", quality=90)

        encoded_image = base64.b64encode(
            buffer.getvalue()
        ).decode("utf-8")

        created_at = datetime.now().astimezone().isoformat(
            timespec="seconds"
        )

        # Save detection record permanently in SQLite
        with get_db_connection() as connection:
            connection.execute("""
                INSERT INTO detections (
                    image_id,
                    filename,
                    original_filename,
                    result_filename,
                    created_at,
                    detections_count,
                    detections_json,
                    image_width,
                    image_height
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                image_id,
                file.filename,
                original_filename,
                result_filename,
                created_at,
                len(detections),
                json.dumps(detections),
                image_width,
                image_height
            ))
            connection.commit()

        return jsonify({
            "status": "success",
            "image_id": image_id,
            "filename": file.filename,
            "detections_count": len(detections),
            "detections": detections,
            "annotated_image": encoded_image,
            "saved_original": f"uploads/{original_filename}",
            "saved_result": f"results/{result_filename}",
            "original_url": f"http://127.0.0.1:5000/uploads/{original_filename}",
            "result_url": f"http://127.0.0.1:5000/results/{result_filename}",
            "created_at": created_at,
            "image_width": image_width,
            "image_height": image_height,
            "message": "Detection complete"
        })

    except Exception:
        app.logger.exception("Image detection failed")

        return jsonify({
            "status": "error",
            "error": "Image detection failed. Please try another image."
        }), 500


# Get all saved history records
@app.route("/history", methods=["GET"])
def get_history():
    with get_db_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM detections
            ORDER BY created_at DESC
        """).fetchall()

    history = []

    for row in rows:
        history.append({
            "image_id": row["image_id"],
            "filename": row["filename"],
            "created_at": row["created_at"],
            "detections_count": row["detections_count"],
            "detections": json.loads(row["detections_json"]),
            "image_width": row["image_width"],
            "image_height": row["image_height"],
            "original_url": f"http://127.0.0.1:5000/uploads/{row['original_filename']}",
            "result_url": f"http://127.0.0.1:5000/results/{row['result_filename']}"
        })

    return jsonify({
        "status": "success",
        "history": history
    })


# Delete one history record and its saved images
@app.route("/history/<image_id>", methods=["DELETE"])
def delete_history_item(image_id):
    with get_db_connection() as connection:
        row = connection.execute("""
            SELECT original_filename, result_filename
            FROM detections
            WHERE image_id = ?
        """, (image_id,)).fetchone()

        if row is None:
            return jsonify({
                "status": "error",
                "error": "History item not found"
            }), 404

        connection.execute(
            "DELETE FROM detections WHERE image_id = ?",
            (image_id,)
        )
        connection.commit()

    for folder, filename in [
        (UPLOAD_FOLDER, row["original_filename"]),
        (RESULTS_FOLDER, row["result_filename"])
    ]:
        path = folder / filename
        if path.exists():
            path.unlink()

    return jsonify({
        "status": "success",
        "message": "History item deleted"
    })


# Clear all history records and saved images
@app.route("/history", methods=["DELETE"])
def clear_history():
    with get_db_connection() as connection:
        rows = connection.execute("""
            SELECT original_filename, result_filename
            FROM detections
        """).fetchall()

        connection.execute("DELETE FROM detections")
        connection.commit()

    for row in rows:
        for folder, filename in [
            (UPLOAD_FOLDER, row["original_filename"]),
            (RESULTS_FOLDER, row["result_filename"])
        ]:
            path = folder / filename
            if path.exists():
                path.unlink()

    return jsonify({
        "status": "success",
        "message": "History cleared"
    })


# View saved original images
@app.route("/uploads/<path:filename>", methods=["GET"])
def get_uploaded_image(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


# View saved annotated result images
@app.route("/results/<path:filename>", methods=["GET"])
def get_result_image(filename):
    return send_from_directory(RESULTS_FOLDER, filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)