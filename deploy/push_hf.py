"""Upload this project to a Hugging Face Docker Space with your own token:  HF_TOKEN=hf_xxx python deploy/push_hf.py user/space"""
import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

root = Path(__file__).resolve().parents[1]
space = sys.argv[1] if len(sys.argv) > 1 else sys.exit("usage: push_hf.py user/space")
token = os.environ.get("HF_TOKEN") or sys.exit("set HF_TOKEN to a write token")
api = HfApi(token=token)
api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True)
api.upload_folder(
    folder_path=str(root), repo_id=space, repo_type="space",
    ignore_patterns=["**/node_modules/**", "web/dist/**", "**/__pycache__/**", "**/*.db", ".git/**", "fixtures/**", "tools/**", "server/models/*.onnx", "README.md"],
)
api.upload_file(path_or_fileobj=str(root / "deploy" / "hf-README.md"), path_in_repo="README.md", repo_id=space, repo_type="space")
print("uploaded:", f"https://huggingface.co/spaces/{space}")
