Creating and using a Python virtual environment (venv)

Windows (PowerShell / pwsh):

```powershell
cd ESP32_AP-Flasher/web-ui
python -m venv venv
# Activate venv
.\venv\Scripts\Activate.ps1    # pwsh
# Install requirements
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Unix / macOS (bash/zsh):

```sh
cd ESP32_AP-Flasher/web-ui
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Notes:
- The server prefers a venv located at `ESP32_AP-Flasher/venv` or `ESP32_AP-Flasher/.venv`.
- You can set the `PYTHON` environment variable to point to a specific python executable if needed.
- After activating the venv, running server actions from the web UI will use the venv interpreter automatically.
