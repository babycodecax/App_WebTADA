"""Temporary script to start the backend server."""
import subprocess, sys, time
p = subprocess.Popen([sys.executable, "main.py"], cwd="d:/CodeApp/Projects/App_WebTADA/backend")
print(f"Server PID: {p.pid}")
with open("server.pid", "w") as f:
    f.write(str(p.pid))
