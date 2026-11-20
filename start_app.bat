@echo off
rem Menjalankan aplikasi analisis wajah secara lokal (hanya komputer ini)
cd /d "%~dp0"
start "" http://127.0.0.1:8791
python app\server.py
