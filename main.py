from ultralytics import YOLO

import time
from flask import Flask, request, jsonify
from PIL import Image
import io
import requests

print("Model loading...")
model = YOLO('fish.pt')  # Load model
print("Model loaded successfully")
app = Flask(__name__)

@app.route('/predict', methods=['POST'])
def predict():
    if 'url' not in request.json:
        return jsonify({'error': 'No URL provided'}), 400
    
    image_url = request.json['url']
    response = requests.get(image_url)
    if response.status_code != 200:
        return jsonify({'error': 'Failed to download image'}), 400
    
    image = Image.open(io.BytesIO(response.content))
    results = model.predict(image, conf=0.80, device='cuda',save=True)

    
    # print(results)
# boxes: ultralytics.engine.results.Boxes object
# keypoints: None
# masks: None
# names: {0: 'fish', 1: 'hand'}
# obb: None
# orig_img: array([[[255, 207, 125],
#         [255, 207, 125],
#         [255, 207, 125],
#         ...,
#         [135,  87,  37],
#         [135,  84,  39],
#         [135,  79,  43]],

#        [[255, 207, 125],
#         [255, 207, 125],
#         [255, 207, 125],
#         ...,
#         [135,  87,  37],
#         [135,  84,  39],
#         [135,  79,  43]],

#        [[253, 181, 102],
#         [253, 181, 102],
#         [253, 181, 102],
#         ...,
#         [137,  89,  40],
#         [140,  88,  40],
#         [144,  82,  43]],

#        ...,

#        [[248, 124,  50],
#         [248, 124,  50],
#         [236, 121,  49],
#         ...,
#         [135,  87,  37],
#         [135,  87,  37],
#         [135,  87,  37]],

#        [[249, 139,  64],
#         [249, 139,  64],
#         [237, 133,  61],
#         ...,
#         [135,  87,  37],
#         [135,  87,  37],
#         [135,  87,  37]],

#        [[255, 207, 125],
#         [255, 207, 125],
#         [233, 180, 105],
#         ...,
#         [135,  87,  37],
#         [135,  87,  37],
#         [135,  87,  37]]], shape=(378, 378, 3), dtype=uint8)
# orig_shape: (378, 378)
# path: 'image0.jpg'
# probs: None
# save_dir: 'runs/detect/predict4'
# speed: {'preprocess': 7.725000381469727, 'inference': 19.467592239379883, 'postprocess': 336.23814582824707}]
    

    spikes=0
    fish=0
   # print bounding box coordinates

    for result in results:
        boxes = result.boxes
        if boxes is not None:
            x1, y1, x2, y2 = boxes.xyxy[0].cpu().numpy()
            print(x1, y1, x2, y2)

            square = 0
            img_width, img_height = image.size
            square_width = img_width / 3
            square_height = img_height / 3

            for i in range(3):
                for j in range(3):
                    if x1 >= i * square_width and x1 <= (i + 1) * square_width and y1 >= j * square_height and y1 <= (j + 1) * square_height:
                        square = 3 * j + i + 1
                        break
            if result.names[boxes.cls[0].item()] == 'fish':  # Check if the class is 'fish'
                print(square)
                fish = square
                return jsonify({'success': True, 'square': square}), 200
        jsonify({'success': False}), 400
            
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)