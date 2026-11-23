"""Run the API and the built web app:  python run.py   (PORT and HOST are read from the environment)."""
import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "8780")), log_level="info")
