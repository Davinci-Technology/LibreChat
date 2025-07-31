import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { JSONRPCMessage, JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import WebSocket from 'ws';

const SUBPROTOCOL = "mcp";

/**
 * Server-side WebSocket client transport with headers support
 */
export class WebSocketClientTransportWithHeaders implements Transport {
  private _socket?: WebSocket;
  private _url: URL;
  private _headers?: Record<string, string>;

  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(url: URL, options?: { headers?: Record<string, string> }) {
    this._url = url;
    this._headers = options?.headers;
  }

  start(): Promise<void> {
    if (this._socket) {
      throw new Error(
        "WebSocketClientTransportWithHeaders already started! If using Client class, note that connect() calls start() automatically.",
      );
    }

    return new Promise((resolve, reject) => {
      try {
        // Use the ws package directly with headers support
        const wsOptions: any = {
          protocol: SUBPROTOCOL,
        };

        // Add headers if provided
        if (this._headers && Object.keys(this._headers).length > 0) {
          wsOptions.headers = this._headers;
        }

        // Create WebSocket using ws package
        this._socket = new WebSocket(this._url.toString(), wsOptions);

      } catch (error) {
        reject(error);
        return;
      }

      this._socket.onerror = (event) => {
        const error = new Error(`WebSocket error: ${JSON.stringify(event)}`);
        reject(error);
        this.onerror?.(error);
      };

      this._socket.onopen = () => {
        resolve();
      };

      this._socket.onclose = () => {
        this.onclose?.();
      };

      this._socket.onmessage = (event: WebSocket.MessageEvent) => {
        let message: JSONRPCMessage;
        try {
          const data = typeof event.data === 'string' ? event.data : event.data.toString();
          message = JSONRPCMessageSchema.parse(JSON.parse(data));
        } catch (error) {
          this.onerror?.(error as Error);
          return;
        }

        this.onmessage?.(message);
      };
    });
  }

  async close(): Promise<void> {
    this._socket?.close();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this._socket || this._socket.readyState !== WebSocket.OPEN) {
        reject(new Error("Not connected"));
        return;
      }

      this._socket?.send(JSON.stringify(message));
      resolve();
    });
  }
}
