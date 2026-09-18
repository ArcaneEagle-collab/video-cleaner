import json
import asyncio
from typing import Dict, List, Set, Any, Optional
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages active WebSocket connections, thread-safe broadcasting across event loops,
    and task cancellation flags.
    """
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.cancellation_flags: Dict[str, bool] = {}
        self.main_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_main_loop(self, loop: asyncio.AbstractEventLoop):
        self.main_loop = loop

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        message_json = json.dumps(message)
        dead_connections = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message_json)
            except Exception:
                dead_connections.append(connection)
        for dead in dead_connections:
            self.active_connections.discard(dead)

    def broadcast_sync(self, message: Dict[str, Any]):
        """
        Thread-safe broadcast called from background worker threads.
        Dispatches coroutine execution to the primary Uvicorn event loop that owns
        the active WebSocket transports, preventing IOCP Proactor transport corruption.
        """
        if self.main_loop and self.main_loop.is_running():
            try:
                future = asyncio.run_coroutine_threadsafe(self.broadcast(message), self.main_loop)
                # Wait briefly up to 0.25s for message to transmit to maintain ordered delivery
                future.result(timeout=0.25)
            except Exception:
                pass
        else:
            # Fallback if loop not registered or during standalone script execution
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self.broadcast(message))
                else:
                    loop.run_until_complete(self.broadcast(message))
            except Exception:
                pass

    def cancel_task(self, task_id: str):
        self.cancellation_flags[task_id] = True

    def is_task_cancelled(self, task_id: str) -> bool:
        return self.cancellation_flags.get(task_id, False)

    def clear_task(self, task_id: str):
        self.cancellation_flags.pop(task_id, None)

ws_manager = ConnectionManager()

