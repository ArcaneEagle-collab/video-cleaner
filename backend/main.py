import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .api.routes import router as api_router, dashboard_router
from .api.websocket import ws_manager

app = FastAPI(
    title="Video Cleaner API",
    description="Local-first video cleaner and usable footage extractor powered by OpenCV and FFmpeg",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API & Dashboard Routers
app.include_router(api_router)
app.include_router(dashboard_router)

# Mount outputs directory for direct download of clips and master videos
OUTPUTS_DIR = Path("outputs")
OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/outputs", StaticFiles(directory="outputs"), name="outputs")

# WebSocket endpoint for real-time progress and live updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Can receive ping or cancellation requests
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

@app.get("/")
async def root():
    return {
        "app": "Video Cleaner",
        "status": "online",
        "description": "Local video analyzer and clean footage extractor"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
