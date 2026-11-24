"""Start PatchCenter frontend and backend on Windows."""
import argparse

from scripts.manage import start


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Start PatchCenter")
    parser.add_argument("--local", action="store_true", help="Only allow local access")
    args = parser.parse_args()
    raise SystemExit(start(args.local))
