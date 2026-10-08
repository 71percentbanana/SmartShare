import { SignalingService } from './signaling';

// Fast CRC32 calculation table
const makeCRCTable = () => {
  let c;
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }
  return crcTable;
};

const CRC_TABLE = makeCRCTable();

export function calculateCRC32(bytes: Uint8Array): string {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  crc = (crc ^ -1) >>> 0;
  return crc.toString(16).padStart(8, '0');
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private signaling: SignalingService;
  private onDataCallback: ((data: ArrayBuffer) => void) | null = null;
  private onStateCallback: ((state: string) => void) | null = null;

  constructor(signaling: SignalingService) {
    this.signaling = signaling;
  }

  public async initializePeer(
    isInitiator: boolean,
    onData: (data: ArrayBuffer) => void,
    onState: (state: string) => void
  ) {
    this.onDataCallback = onData;
    this.onStateCallback = onState;

    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    try {
      this.peerConnection = new RTCPeerConnection(configuration);

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.signaling.send({
            type: 'ice_candidate',
            candidate: event.candidate
          });
        }
      };

      this.peerConnection.onconnectionstatechange = () => {
        if (this.peerConnection) {
          onState(this.peerConnection.connectionState);
        }
      };

      if (isInitiator) {
        // Initiator creates DataChannel
        this.dataChannel = this.peerConnection.createDataChannel('smartshare_channel', {
          ordered: true
        });
        this.setupDataChannel(this.dataChannel);

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.signaling.send({ type: 'sdp_offer', sdp: offer });
      } else {
        // Receiver waits for DataChannel
        this.peerConnection.ondatachannel = (event) => {
          this.dataChannel = event.channel;
          this.setupDataChannel(this.dataChannel);
        };
      }
    } catch (err) {
      console.warn('WebRTC peer initialization fallback to WebSocket relay:', err);
      onState('relay_fallback');
    }
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => {
      if (this.onStateCallback) this.onStateCallback('connected_direct');
    };
    channel.onclose = () => {
      if (this.onStateCallback) this.onStateCallback('disconnected');
    };
    channel.onmessage = (event) => {
      if (this.onDataCallback && event.data instanceof ArrayBuffer) {
        this.onDataCallback(event.data);
      }
    };
  }

  public async handleSignalingMessage(message: any) {
    if (!this.peerConnection) return;

    if (message.type === 'sdp_offer') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      this.signaling.send({ type: 'sdp_answer', sdp: answer });
    } else if (message.type === 'sdp_answer') {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.sdp));
    } else if (message.type === 'ice_candidate') {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(message.candidate));
      } catch (e) {
        console.warn('Error adding ICE candidate', e);
      }
    }
  }

  public sendBinary(data: ArrayBuffer): boolean {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data);
      return true;
    }
    return false;
  }

  public close() {
    if (this.dataChannel) this.dataChannel.close();
    if (this.peerConnection) this.peerConnection.close();
  }
}
