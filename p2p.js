/**
 * p2p.js - WebRTC DataChannel 接続の共通基盤
 * chat.js / game.js で共用する。DOM には依存しない（スキャナは video 要素を受け取る）。
 */
class P2PConnection {
  constructor(handlers = {}) {
    this.handlers = handlers;
    this.pc = null;
    this.dataChannel = null;
    this.mediaStream = null;
    this.scanInterval = null;
    this.role = 'none'; // 'host' | 'guest'
  }

  createPeerConnection() {
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    this.pc = new RTCPeerConnection(config);

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed') {
        if (this.handlers.onUnexpectedClose) this.handlers.onUnexpectedClose();
      }
    };

    return this.pc;
  }

  // --- Ultra-Compact Custom SDP Formatter (IPv6-safe) ---
  compressSdp(sdpInit) {
    if (!sdpInit || !sdpInit.sdp) return '';
    const lines = sdpInit.sdp.split('\r\n');
    let ufrag = '', pwd = '', fp = '';
    const candList = [];

    for (const line of lines) {
      if (line.startsWith('a=ice-ufrag:')) ufrag = line.split(':')[1];
      else if (line.startsWith('a=ice-pwd:')) pwd = line.split(':')[1];
      else if (line.startsWith('a=fingerprint:sha-256 ')) {
        fp = line.split(' ')[1].replace(/:/g, ''); // コロン除去
      } else if (line.startsWith('a=candidate:')) {
        const parts = line.substring(12).split(' ');
        if (parts.length >= 8) {
          // IP, Port, Type（セミコロン区切りでIPv6アドレスのコロンと衝突しない）
          candList.push(`${parts[4]};${parts[5]};${parts[7]}`);
        }
      }
    }

    const typeFlag = sdpInit.type === 'offer' ? 'O' : 'A';
    // Format: O,ufrag,pwd,fp,ip1;port1;typ1|ip2;port2;typ2
    return `${typeFlag},${ufrag},${pwd},${fp},${candList.join('|')}`;
  }

  decompressSdp(compressedStr) {
    try {
      const str = (compressedStr || '').trim();

      // Fallback for Base64 or JSON
      if (str.startsWith('{') || str.startsWith('eyJ')) {
        const rawJson = atob ? atob(str) : str;
        const obj = JSON.parse(rawJson);
        if (obj.sdp) return obj;
      }

      const parts = str.split(',');
      if (parts.length < 4) throw new Error('コードフォーマットが不正です');

      const typeFlag = parts[0];
      const ufrag = parts[1];
      const pwd = parts[2];
      const rawFp = parts[3];
      const candStr = parts[4] || '';

      // Reformat Fingerprint (add colons back)
      const fpFormatted = rawFp.match(/.{1,2}/g)?.join(':') || rawFp;

      const type = typeFlag === 'O' ? 'offer' : 'answer';

      let sdp = 'v=0\r\n' +
        'o=- 1234567890 2 IN IP4 127.0.0.1\r\n' +
        's=-\r\n' +
        't=0 0\r\n' +
        'a=msid-semantic: WMS\r\n' +
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
        'c=IN IP4 0.0.0.0\r\n' +
        'a=ice-ufrag:' + ufrag + '\r\n' +
        'a=ice-pwd:' + pwd + '\r\n' +
        'a=fingerprint:sha-256 ' + fpFormatted + '\r\n' +
        'a=setup:' + (type === 'offer' ? 'actpass' : 'active') + '\r\n' +
        'a=mid:0\r\n' +
        'a=sctp-port:5000\r\n';

      if (candStr) {
        const cands = candStr.split('|');
        cands.forEach((c, idx) => {
          let f = c.split(';');
          if (f.length < 2) f = c.split(':'); // 旧形式の相互互換
          const ip = f[0];
          const port = f[1];
          const ctype = f[2];
          // 不正ポート（非数値・IPv6誤分割）の候補はスキップしてSDPを壊さない
          if (ip && /^\d+$/.test(port)) {
            sdp += `a=candidate:${idx + 1} 1 udp ${2122260223 - idx} ${ip} ${port} typ ${ctype || 'host'}\r\n`;
          }
        });
      }

      return { type, sdp };
    } catch (e) {
      console.error('Decompress Error:', e);
      throw new Error('コードの解読に失敗しました: ' + e.message);
    }
  }

  waitForIceGathering(pc) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', checkState);
            resolve();
          }
        };
        pc.addEventListener('icegatheringstatechange', checkState);
        setTimeout(resolve, 1000);
      }
    });
  }

  setupDataChannelEvents(channel) {
    channel.onopen = () => {
      if (this.handlers.onOpen) this.handlers.onOpen();
    };
    channel.onmessage = (e) => {
      this.handleDataMessage(e.data);
    };
    channel.onclose = () => {
      if (this.handlers.onClose) this.handlers.onClose();
    };
  }

  handleDataMessage(data) {
    let packet = null;
    try {
      packet = JSON.parse(data);
    } catch (e) {
      if (this.handlers.onText) this.handlers.onText(data);
      return;
    }
    if (this.handlers.onMessage) this.handlers.onMessage(packet);
  }

  /** dataChannel が開いていれば JSON を送信。失敗時 false */
  sendJSON(obj) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(obj));
      return true;
    }
    if (this.handlers.onSendFailed) this.handlers.onSendFailed(obj);
    return false;
  }

  /** 親機: Offer を発行し圧縮コードを返す */
  async buildOffer() {
    this.role = 'host';
    const pc = this.createPeerConnection();
    this.dataChannel = pc.createDataChannel('donjaraData');
    this.setupDataChannelEvents(this.dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await this.waitForIceGathering(pc);
    return this.compressSdp(pc.localDescription);
  }

  /** 子機: Offer コードから Answer を生成し圧縮コードを返す */
  async buildAnswer(offerCode) {
    this.role = 'guest';
    const offerSdp = this.decompressSdp(offerCode);
    const pc = this.createPeerConnection();

    pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannelEvents(this.dataChannel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGathering(pc);
    return this.compressSdp(pc.localDescription);
  }

  /** 親機: 子機からの Answer を受領して接続確定 */
  async acceptAnswer(answerCode) {
    const answerSdp = this.decompressSdp(answerCode);
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
  }

  /**
   * カメラQRスキャンを開始する。DOM操作はせず video 要素を受け取る。
   * 検出時: callbacks.onResult(text) を呼び、スキャンは自動停止する。
   * 非対応環境でもカメラプレビューのみ開始する（stopScanner で終了）。
   */
  async startScanner(video, callbacks = {}) {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    if (video) {
      video.srcObject = this.mediaStream;
      await video.play();
    }

    if ('BarcodeDetector' in window) {
      const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      this.scanInterval = setInterval(async () => {
        try {
          if (video) {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes.length > 0) {
              const qrText = barcodes[0].rawValue;
              this.stopScanner();
              if (callbacks.onResult) callbacks.onResult(qrText);
            }
          }
        } catch (e) {}
      }, 300);
    } else {
      if (callbacks.onUnsupported) callbacks.onUnsupported();
      this.scanInterval = setInterval(() => {}, 500);
    }
    return true;
  }

  stopScanner() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
  }

  disconnect() {
    if (this.dataChannel) {
      try { this.dataChannel.close(); } catch (e) {}
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    this.stopScanner();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = P2PConnection;
}