import subprocess
import sys
import os
import time

def main():
    print("=" * 60)
    print("  Starting UrHealth Emergency Orchestration & Re-Unification  ")
    print("=" * 60)

    root_dir = os.path.dirname(os.path.abspath(__file__))

    # 1. Start FastAPI Backend on port 8000
    print("\n[1/2] Launching FastAPI Backend & Database on http://localhost:8000 ...")
    backend_cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
    backend_proc = subprocess.Popen(backend_cmd, cwd=root_dir)

    time.sleep(2)

    # 2. Start Vite Frontend Server
    print("\n[2/2] Launching Vite Frontend on http://localhost:3000 ...")
    frontend_cmd = "npm run dev"
    frontend_proc = subprocess.Popen(frontend_cmd, shell=True, cwd=root_dir)

    print("\n" + "=" * 60)
    print("   UrHealth System Ready!")
    print("  - Backend & API Docs: http://localhost:8000/docs")
    print("  - WebSocket Channel:  ws://localhost:8000/ws/network")
    print("  - Frontend App:       http://localhost:3000")
    print("=" * 60 + "\n")

    try:
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("\nShutting down servers...")
        backend_proc.terminate()
        frontend_proc.terminate()

if __name__ == "__main__":
    main()
