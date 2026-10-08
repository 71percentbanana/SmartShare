export class SignalingService {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private clientId: string;
  private onMessageCallback: ((data: any) => void) | null = null;
  private isConnected: boolean = false;

  constructor(sessionId: string, clientId: string) {
    this.sessionId = sessionId;
    this.clientId = clientId;
  }

  public connect(onMessage: (data: any) => void): Promise<void> {
    this.onMessageCallback = onMessage;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${this.sessionId}/${this.clientId}`;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (this.onMessageCallback) {
              this.onMessageCallback(data);
            }
          } catch (e) {
            console.error('Failed to parse websocket message', e);
          }
        };

        this.ws.onerror = (err) => {
          console.warn('WebSocket signaling error:', err);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  public send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}
