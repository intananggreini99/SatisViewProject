"""Healthcheck Docker: consumer sehat bila heartbeat diperbarui < 120 detik lalu."""

import sys
import time
from pathlib import Path

from . import config

try:
    umur = time.time() - float(Path(config.HEARTBEAT_FILE).read_text())
except (OSError, ValueError):
    sys.exit(1)
sys.exit(0 if umur < 120 else 1)
