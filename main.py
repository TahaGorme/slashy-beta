import os
import uuid
import threading
import tempfile
from flask import Flask, request, jsonify
from ultralytics import YOLO
from PIL import Image

# Initialize Flask app
app = Flask(__name__)

# Load the YOLO model
print("Model loading...")
model = YOLO('model_- 9 january 2025 21_36.pt')  # Load the model
print("Model loaded successfully")

# Function to process each image request
def process_request(image_path, unique_filename, event, result_container):
    try:
        # Open the image from the temporary file using a context manager to ensure it's closed properly
        with Image.open(image_path) as image:
            # Perform inference on the image
            print(f"Running predictions on {image_path}...")
            results = model.predict(source=image_path, imgsz=640, conf=0.9, iou=0.45)

            # Get the original image dimensions
            img_width, img_height = image.size

            # Define the grid dimensions
            rows, cols = 3, 3
            cell_width = img_width / cols
            cell_height = img_height / rows

            grid_positions = []

            # Process results
            for result in results:
                boxes = result.boxes.xyxy.cpu().numpy()  # Bounding box coordinates (x1, y1, x2, y2)
                classes = result.boxes.cls.cpu().numpy()  # Class indices
                names = result.names  # Class names

                for i, box in enumerate(boxes):
                    x1, y1, x2, y2 = box
                    class_name = names[int(classes[i])]

                    # Calculate the center of the bounding box
                    x_center = (x1 + x2) / 2
                    y_center = (y1 + y2) / 2

                    # Determine the grid cell
                    grid_x = int(x_center // cell_width) + 1
                    grid_y = int(y_center // cell_height) + 1

                    # Add the grid cell information to the result
                    grid_positions.append({
                        "class": class_name,
                        "grid_x": grid_x,
                        "grid_y": grid_y
                    })

            # Store the result in the container
            result_container.append(grid_positions)

    except Exception as e:
        print(f"Error during image processing: {e}")

    finally:
        # Attempt to remove the temporary image file after processing
        try:
            os.remove(image_path)
        except PermissionError:
            print(f"Error removing file {image_path}: File may still be in use.")
        except Exception as e:
            print(f"Unexpected error removing file {image_path}: {e}")

        # Signal that the task is complete
        event.set()

# Define the endpoint to predict on the image
@app.route('/predict', methods=['POST'])
def predict():
    # Check if the image is in the request
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    # Get the image from the request
    image_file = request.files['image']
    
    # Generate a unique temporary filename using UUID
    unique_filename = f"temp_image_{uuid.uuid4().hex}.png"

    # Save the image to a temporary file
    temp_file_path = os.path.join(tempfile.gettempdir(), unique_filename)
    image_file.save(temp_file_path)

    # Prepare an event to signal completion and a container for the result
    event = threading.Event()
    result_container = []

    # Start the processing in a separate thread
    threading.Thread(target=process_request, args=(temp_file_path, unique_filename, event, result_container)).start()

    # Wait for the processing to complete
    event.wait()

    # Return the grid positions after processing is complete
    return jsonify({"grid_positions": result_container[0]}), 200

# Run the Flask app
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=6000, threaded=True)
