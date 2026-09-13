import json
from typing import Dict, List, Set, Any
from fastapi import WebSocket

class ConnectionManager:
    """
    Manages active WebSocket connections and task cancellation flags.
    """
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.cancellation_flags: Dict[str, bool] = {}

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

    def cancel_task(self, task_id: str):
        self.cancellation_flags[task_id] = True

    def is_task_cancelled(self, task_id: str) -> bool:
        return self.cancellation_flags.get(task_id, False)

    def clear_task(self, task_id: str):
        self.cancellation_flags.pop(task_id, None)

ws_manager = ConnectionManager()
