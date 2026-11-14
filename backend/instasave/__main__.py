import logging
import os

import uvicorn

from .app import create_app

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
uvicorn.run(create_app(), host=os.environ.get("INSTASAVE_HOST", "127.0.0.1"),
            port=int(os.environ.get("INSTASAVE_PORT", "8000")), log_level="warning")
