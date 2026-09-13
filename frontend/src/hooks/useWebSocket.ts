import { useEffect, useRef, useState, useCallback } from "react";
import { ProgressData } from "../types/video";
import { getWsBaseUrl } from "../config/api";

interface WebSocketMessage {
  type: "progress" | "completed" | "cancelled" | "error";
  task_id: string;
  stage?: string;
  percent?: number;
  timestamp?: number;
  total_duration?: number;
  scenes_detected?: number;
  likely_images?: number;
  likely_usable?: number;
  result?: any;
  error?: string;
  message?: string;
}

export function useWebSocket(
  onProgress?: (data: ProgressData) => void,
  onCompleted?: (result: any) => void,
  onError?: (err: string) => void,
  onCancelled?: () => void
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<any>(null);

  const connect = useCallback(() => {
    const wsUrl = `${getWsBaseUrl()}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg: WebSocketMessage = jsonParseSafe(event.data);
          if (!msg) return;

          if (msg.type === "progress") {
            onProgress?.({
              stage: msg.stage || "Analyzing...",
              percent: msg.percent ?? 0,
              timestamp: msg.timestamp ?? 0,
              total_duration: msg.total_duration ?? 0,
              scenes_detected: msg.scenes_detected ?? 0,
              likely_images: msg.likely_images ?? 0,
              likely_usable: msg.likely_usable ?? 0
            });
          } else if (msg.type === "completed") {
            onCompleted?.(msg.result);
          } else if (msg.type === "cancelled") {
            onCancelled?.();
          } else if (msg.type === "error") {
            onError?.(msg.error || "Analysis error occurred");
          }
        } catch (e) {
          console.error("WS Parse error:", e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    } catch (e) {
      console.warn("WebSocket connection attempt failed:", e);
    }
  }, [onProgress, onCompleted, onError, onCancelled]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const send = useCallback((data: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { isConnected, send };
}

function jsonParseSafe(str: string) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
