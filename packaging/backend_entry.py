"""PyInstaller entry point for the bundled LocalPilot backend.

Frozen into ``localpilot-backend`` so the GUI can launch the control server
without a separate Python install. It exposes the same CLI as ``localpilot``
(``localpilot-backend serve``, ``... config``, ``... run``).
"""

from __future__ import annotations

import multiprocessing

from localpilot.main import app

if __name__ == "__main__":
    multiprocessing.freeze_support()
    app()
