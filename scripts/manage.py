"""Windows development launcher. Uses a job object to own only its children."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import urlopen
from uuid import uuid4

if os.name != "nt":
    raise SystemExit("Use the manual README commands on non-Windows systems.")

import msvcrt

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
RUNTIME = ROOT / ".runtime"
RUNTIME.mkdir(exist_ok=True)
STATE = RUNTIME / "state.json"
PYTHON = BACKEND / ".venv" / "Scripts" / "python.exe"
VITE = FRONTEND / "node_modules" / "vite" / "bin" / "vite.js"
CHILDREN = []


class BasicLimits(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", wintypes.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wintypes.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wintypes.DWORD),
        ("SchedulingClass", wintypes.DWORD),
    ]


class IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in (
        "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
        "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
    )]


class ExtendedLimits(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", BasicLimits),
        ("IoInfo", IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


def own_process_tree():
    # Enroll this launcher before spawning anything. Descendants automatically
    # join the job. Windows cleans up the entire job when the launcher exits,
    # including console close/crash; unrelated processes never join this job.
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [
        wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD
    ]
    kernel.SetInformationJobObject.restype = wintypes.BOOL
    kernel.GetCurrentProcess.argtypes = []
    kernel.GetCurrentProcess.restype = wintypes.HANDLE
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL
    handle = kernel.CreateJobObjectW(None, None)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    limits = ExtendedLimits()
    limits.BasicLimitInformation.LimitFlags = 0x2000  # KILL_ON_JOB_CLOSE
    if not kernel.SetInformationJobObject(handle, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
        error = ctypes.get_last_error()
        kernel.CloseHandle(handle)
        raise ctypes.WinError(error)
    if not kernel.AssignProcessToJobObject(handle, kernel.GetCurrentProcess()):
        error = ctypes.get_last_error()
        kernel.CloseHandle(handle)
        raise OSError(error, "Cannot create isolated process job. Run from a normal Windows terminal.")
    # Deliberately keep the non-inheritable handle open until process exit.
    return handle


def acquire_lock(file):
    file.seek(0)
    try:
        msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
        return True
    except OSError:
        return False


def unlock(file):
    file.seek(0)
    msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)


def open_lock():
    path = RUNTIME / "launcher.lock"
    file = path.open("a+b")
    if path.stat().st_size == 0:
        file.write(b"0")
        file.flush()
    return file


def write_state(token):
    tmp = RUNTIME / f"{token}.tmp"
    tmp.write_text(json.dumps({"token": token}), encoding="utf-8")
    tmp.replace(STATE)


def stop_requested(marker):
    if marker.exists():
        raise KeyboardInterrupt


def launch(args, cwd):
    process = subprocess.Popen([str(arg) for arg in args], cwd=cwd)
    CHILDREN.append(process)
    return process


def run_setup(args, cwd, marker):
    stop_requested(marker)
    process = launch(args, cwd)
    while process.poll() is None:
        stop_requested(marker)
        time.sleep(0.2)
    if process.returncode:
        raise RuntimeError(f"Setup failed (exit {process.returncode}): {args[0]}")


def digest(*paths):
    value = hashlib.sha256()
    for path in paths:
        if path.is_file():
            value.update(path.name.encode())
            value.update(path.read_bytes())
    return value.hexdigest()


def prepare(marker):
    if sys.version_info < (3, 10):
        raise RuntimeError("Python 3.10+ is required.")
    node = shutil.which("node.exe")
    if not node:
        raise RuntimeError("Install Node.js 22.12+ and make sure it is on PATH.")
    if not PYTHON.is_file():
        print("Creating Python virtual environment...", flush=True)
        run_setup([sys.executable, "-m", "venv", BACKEND / ".venv"], ROOT, marker)
    stamp = BACKEND / ".venv" / ".patchcenter-requirements"
    expected = digest(BACKEND / "requirements.txt")
    if not stamp.exists() or stamp.read_text() != expected:
        print("Installing backend dependencies...", flush=True)
        run_setup([PYTHON, "-m", "pip", "install", "-r", "requirements.txt"], BACKEND, marker)
        stamp.write_text(expected)
    stamp = FRONTEND / "node_modules" / ".patchcenter-dependencies"
    expected = digest(FRONTEND / "package.json", FRONTEND / "package-lock.json")
    if not VITE.is_file() or not stamp.exists() or stamp.read_text() != expected:
        if not shutil.which("npm.cmd"):
            raise RuntimeError("npm.cmd was not found on PATH.")
        print("Installing frontend dependencies...", flush=True)
        command = "npm.cmd ci" if (FRONTEND / "package-lock.json").exists() else "npm.cmd install --no-package-lock"
        run_setup([os.environ.get("COMSPEC", "cmd.exe"), "/d", "/c", command], FRONTEND, marker)
        stamp.write_text(expected)
    return node


def require_free_port(host, port):
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
            probe.bind((host, port))
    except OSError as error:
        raise RuntimeError(f"Port {port} is unavailable. Stop the old service manually; no process was killed.") from error


def wait_ready(url, processes, marker, health=False):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        stop_requested(marker)
        if any(process.poll() is not None for process in processes):
            raise RuntimeError(f"A service exited before it was ready: {url}")
        try:
            with urlopen(url, timeout=1) as response:
                ready = response.status == 200 and (not health or json.load(response).get("status") == "ok")
            if ready and all(process.poll() is None for process in processes):
                return
        except (OSError, ValueError, AttributeError):
            pass
        time.sleep(0.2)
    raise RuntimeError(f"Service did not become ready: {url}")


def start(local_only):
    with open_lock() as lock:
        if not acquire_lock(lock):
            print("PatchCenter is already running. Use python stop.py first.")
            return 0
        token = uuid4().hex
        marker = RUNTIME / f"{token}.stop"
        try:
            # Keep this handle alive until Python exits.
            job_handle = own_process_tree()
            write_state(token)
            host = "127.0.0.1" if local_only else "0.0.0.0"
            require_free_port("127.0.0.1", 8000)
            require_free_port(host, 5173)
            node = prepare(marker)
            stop_requested(marker)
            print("Starting backend...", flush=True)
            backend = launch([PYTHON, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"], BACKEND)
            wait_ready("http://127.0.0.1:8000/api/health", [backend], marker, health=True)
            print("Starting frontend...", flush=True)
            frontend = launch([node, VITE, "--host", host, "--port", "5173", "--strictPort"], FRONTEND)
            wait_ready("http://127.0.0.1:5173/", [backend, frontend], marker)
            wait_ready("http://127.0.0.1:5173/api/health", [backend, frontend], marker, health=True)
            print("\nPatchCenter is ready: http://localhost:5173/", flush=True)
            if not local_only:
                print("LAN: share Vite's Network address with authorized colleagues.", flush=True)
            print("Run python stop.py or press Ctrl+C to stop both services.", flush=True)
            try:
                # Use the Windows shell to open the browser outside our job.
                os.startfile("http://localhost:5173/")
            except OSError:
                print("Open the URL in your browser manually.", flush=True)
            while True:
                stop_requested(marker)
                if backend.poll() is not None or frontend.poll() is not None:
                    raise RuntimeError("A service exited unexpectedly.")
                time.sleep(0.3)
        except KeyboardInterrupt:
            print("\nStopping PatchCenter...", flush=True)
            return 0
        except Exception as error:
            print(f"\nERROR: {error}", file=sys.stderr, flush=True)
            return 1
        finally:
            # Stop direct children; the job object also removes any remaining
            # descendants when this launcher process exits.
            for process in reversed(CHILDREN):
                if process.poll() is None:
                    try:
                        process.terminate()
                    except OSError:
                        pass
            for process in reversed(CHILDREN):
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    try:
                        process.kill()
                    except OSError:
                        pass
            STATE.unlink(missing_ok=True)
            marker.unlink(missing_ok=True)
            unlock(lock)


def stop():
    with open_lock() as lock:
        if acquire_lock(lock):
            unlock(lock)
            print("PatchCenter is not running through the launcher.")
            return 0
        # The launcher publishes a per-run token; never terminate a PID or
        # delete an upload directory based on a stale file.
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                token = json.loads(STATE.read_text(encoding="utf-8"))["token"]
                if not isinstance(token, str) or len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
                    raise ValueError("Invalid launcher token")
                (RUNTIME / f"{token}.stop").touch()
                break
            except (OSError, ValueError, KeyError, TypeError):
                time.sleep(0.2)
        else:
            print("Launcher state is unavailable. Press Ctrl+C in its window.", file=sys.stderr)
            return 1
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            if acquire_lock(lock):
                unlock(lock)
                print("PatchCenter stopped.")
                return 0
            time.sleep(0.2)
        print("Stop requested, but the launcher has not exited. Check its window.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "start":
        raise SystemExit(start("--local" in sys.argv[2:]))
    if sys.argv[1:] == ["stop"]:
        raise SystemExit(stop())
    raise SystemExit("Usage: manage.py start [--local] | stop")
