import os
import sys
import time
import socket
import shutil
import subprocess
import webbrowser
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT_DIR / "frontend"
LOG_DIR = ROOT_DIR / "temp" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)

def is_port_open(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0

def wait_for_port(port: int, timeout: float = 12.0, host: str = "127.0.0.1") -> bool:
    start = time.time()
    while time.time() - start < timeout:
        if is_port_open(port, host):
            return True
        time.sleep(0.3)
    return False

def get_python_exe() -> str:
    """Finds pythonw.exe on Windows to run without opening a console window."""
    if os.name == "nt":
        pyw = Path(sys.executable).with_name("pythonw.exe")
        if pyw.exists():
            return str(pyw)
        which_pyw = shutil.which("pythonw")
        if which_pyw:
            return which_pyw
    return sys.executable

def get_spawn_kwargs() -> dict:
    """Configures Windows process flags so no console windows flash or open."""
    kwargs = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startupinfo.wShowWindow = subprocess.SW_HIDE
        kwargs["startupinfo"] = startupinfo
    return kwargs

def get_frontend_cmd() -> list:
    """Runs Vite directly via Node to eliminate cmd.exe shell wrapper popups."""
    node_exe = shutil.which("node")
    vite_bin = FRONTEND_DIR / "node_modules" / "vite" / "bin" / "vite.js"
    if node_exe and vite_bin.exists():
        return [node_exe, str(vite_bin), "--host", "127.0.0.1", "--port", "5173"]
    npm_cmd = "npm.cmd" if os.name == "nt" else "npm"
    return [npm_cmd, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"]

def main():
    spawn_kwargs = get_spawn_kwargs()

    # 1. Start backend if not already running
    if not is_port_open(8000):
        py_exe = get_python_exe()
        try:
            backend_fd = os.open(LOG_DIR / "backend.log", os.O_CREAT | os.O_WRONLY | os.O_APPEND)
        except Exception:
            backend_fd = subprocess.DEVNULL

        subprocess.Popen(
            [py_exe, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000"],
            cwd=str(ROOT_DIR),
            stdout=backend_fd,
            stderr=backend_fd,
            close_fds=False,
            **spawn_kwargs
        )

    # 2. Start frontend if not already running
    if not is_port_open(5173):
        try:
            frontend_fd = os.open(LOG_DIR / "frontend.log", os.O_CREAT | os.O_WRONLY | os.O_APPEND)
        except Exception:
            frontend_fd = subprocess.DEVNULL

        frontend_cmd = get_frontend_cmd()
        subprocess.Popen(
            frontend_cmd,
            cwd=str(FRONTEND_DIR),
            stdout=frontend_fd,
            stderr=frontend_fd,
            close_fds=False,
            **spawn_kwargs
        )

    # 3. Wait for services to respond
    wait_for_port(8000, timeout=10.0)
    wait_for_port(5173, timeout=12.0)
    time.sleep(0.3)

    # 4. Open default web browser
    webbrowser.open("http://127.0.0.1:5173/")

if __name__ == "__main__":
    main()
