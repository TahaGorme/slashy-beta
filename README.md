

# Slashy Beta
A beta version of [Slashy](https://github.com/TahaGorme/slashy), your tool for everything related to dank memer.

## Table of Contents
- [Installation](#installation)
- [Model Download](#model-download)
- [Setup](#setup)
- [Dependencies](#dependencies)
- [Getting Started](#getting-started)

---

## Model Download
Download the pre-trained model file from the following link:
[model_-_9_january_2025_21_36.pt](https://www.mediafire.com/file/awu48h18gzrlnhs/model_-_9_january_2025_21_36.pt/file)  
Place the downloaded `.pt` file in the same folder as the rest of the project files.

---

## Installation
To set up the project, follow the steps below:

1. Clone this repository:
   ```bash
   git clone https://github.com/TahaGorme/slashy-beta.git
   cd slashy-beta
   ```

2. Install the required Python dependencies:
   ```bash
   pip install ultralytics Flask Pillow
   ```

3. Install PyTorch and its dependencies:
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
   ```

4. Install Node.js dependencies:
   ```bash
   npm install
   ```

---

## Getting Started
Once all dependencies are installed and the model file is downloaded, you can start the project with the following commands:

```bash
# Starting the Flask server
py main.py

# Starting the Node.js application
node index.js
```
