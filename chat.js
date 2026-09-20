class WebRTCP2PChat {
  constructor() {
    this.state = {
      role: 'none',
      status: 'disconnected',
      theme: 'default',
      userName: 'プレイヤー1',
      simulationMode: false,
      scannerTarget: null
    };

    this.pc = null;
    this.dataChannel = null;
    this.mediaStream = null;
    this.scanInterval = null;

    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  init() {
    const savedTheme = localStorage.getItem('donjara_chat_theme');
    if (savedTheme) {
      this.state.theme = savedTheme;
    }
    this.applyTheme();

    const savedName = localStorage.getItem('donjara_chat_username');
    if (savedName) {
      const input = document.getElementById('userNameInput');
      if (input) input.value = savedName;
      this.state.userName = savedName;
    }

    const userInput = document.getElementById('userNameInput');
    if (userInput) {
      userInput.addEventListener('change', (e) => {
        this.state.userName = e.target.value.trim() || 'プレイヤー';
        localStorage.setItem('donjara_chat_username', this.state.userName);
      });
    }

    this.updateUI();
  }

  applyTheme() {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', this.state.theme || 'default');
    }
  }

  toggleTheme() {
    this.state.theme = this.state.theme === 'eink' ? 'default' : 'eink';
    localStorage.setItem('donjara_chat_theme', this.state.theme);
    this.applyTheme();
  }

  toggleSimulationMode() {
    this.state.simulationMode = !this.state.simulationMode;
    const btn = document.getElementById('simModeBtn');
    if (this.state.simulationMode) {
      if (btn) btn.classList.replace('btn-secondary', 'btn-accent');
      this.setStatus('connected', 'host');
      this.addSystemLog('🧪 模擬通信モードが有効化されました。');
    } else {
      if (btn) btn.classList.replace('btn-accent', 'btn-secondary');
      this.disconnect();
      this.addSystemLog('模擬通信モードを解除しました。');
    }
  }

  createPeerConnection() {
    const config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
    this.pc = new RTCPeerConnection(config);

    this.pc.oniceconnectionstatechange = () => {
      if (this.pc.iceConnectionState === 'disconnected' || this.pc.iceConnectionState === 'failed') {
        this.setStatus('disconnected', 'none');
        this.addSystemLog('通信が切断されました。');
      }
    };

    return this.pc;
  }

  // --- SDP Minifier (Ultra-light 90% Compression for Easy QR Scanning) ---
  compressSdp(sdpInit) {
    if (!sdpInit || !sdpInit.sdp) return '';
    const lines = sdpInit.sdp.split('\r\n');
    let ufrag = '', pwd = '', fp = '';
    const candidates = [];

    for (const line of lines) {
      if (line.startsWith('a=ice-ufrag:')) ufrag = line.split(':')[1];
      else if (line.startsWith('a=ice-pwd:')) pwd = line.split(':')[1];
      else if (line.startsWith('a=fingerprint:sha-256 ')) fp = line.split(' ')[1];
      else if (line.startsWith('a=candidate:')) {
        const parts = line.substring(12).split(' ');
        if (parts.length >= 8) {
          candidates.push([parts[0], parts[2], parts[3], parts[4], parts[5], parts[7]]);
        }
      }
    }

    const miniObj = {
      t: sdpInit.type,
      u: ufrag,
      p: pwd,
      f: fp,
      c: candidates
    };

    return btoa(JSON.stringify(miniObj));
  }

  decompressSdp(compressedStr) {
    try {
      const rawJson = atob(compressedStr.trim());
      const miniObj = JSON.parse(rawJson);

      // Fallback for non-compressed raw SDP JSON
      if (miniObj.sdp && miniObj.type) return miniObj;

      let sdp = 'v=0\r\n' +
        'o=- 1234567890 2 IN IP4 127.0.0.1\r\n' +
        's=-\r\n' +
        't=0 0\r\n' +
        'a=msid-semantic: WMS\r\n' +
        'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' +
        'c=IN IP4 0.0.0.0\r\n' +
        'a=ice-ufrag:' + miniObj.u + '\r\n' +
        'a=ice-pwd:' + miniObj.p + '\r\n' +
        'a=fingerprint:sha-256 ' + miniObj.f + '\r\n' +
        'a=setup:' + (miniObj.t === 'offer' ? 'actpass' : 'active') + '\r\n' +
        'a=mid:0\r\n' +
        'a=sctp-port:5000\r\n';

      if (miniObj.c && Array.isArray(miniObj.c)) {
        for (const cand of miniObj.c) {
          sdp += `a=candidate:${cand[0]} 1 ${cand[1]} ${cand[2]} ${cand[3]} ${cand[4]} typ ${cand[5]}\r\n`;
        }
      }

      return {
        type: miniObj.t,
        sdp: sdp
      };
    } catch (e) {
      console.error('Decompress Error:', e);
      throw new Error('コードの解読に失敗しました');
    }
  }

  // --- Host Flow ---
  async setupHostMode() {
    this.state.userName = (document.getElementById('userNameInput')?.value || '').trim() || '親機';
    this.setStatus('connecting', 'host');
    document.getElementById('hostPanel').style.display = 'block';
    document.getElementById('guestPanel').style.display = 'none';

    this.addSystemLog('【親機】超軽量招待コード＆QRコードを生成中...');

    const pc = this.createPeerConnection();

    this.dataChannel = pc.createDataChannel('donjaraData');
    this.setupDataChannelEvents(this.dataChannel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await this.waitForIceGathering(pc);

    // Compress SDP for ultra-light QR (150 chars)
    const offerCode = this.compressSdp(pc.localDescription);
    document.getElementById('hostOfferCode').value = offerCode;

    // Draw QR Code
    this.safeRenderQR('hostOfferCanvas', offerCode, '【親機招待QR】');
  }

  safeRenderQR(canvasId, textCode, label = '') {
    try {
      console.log(`[QR Debug] ${label} 描画開始. 文字数: ${textCode.length}`);
      if (typeof QRCode !== 'undefined' && QRCode.renderQRCode) {
        QRCode.renderQRCode(canvasId, textCode, 180);
        console.log(`[QR Debug] ${label} 描画成功! (文字数: ${textCode.length})`);
        this.addSystemLog(`${label} クッキリ見やすいQRコードの描画に成功しました (文字数: ${textCode.length})`);
      } else {
        throw new Error('QRCode ライブラリが初期化されていません');
      }
    } catch (err) {
      console.error(`[QR Debug Error] ${label} 描画失敗:`, err);
      this.addSystemLog(`⚠️ ${label} QR描画エラー: ${err.message}`);
    }
  }

  async acceptGuestAnswer(codeParam) {
    const answerCode = codeParam || document.getElementById('hostAnswerInput')?.value.trim();
    if (!answerCode) {
      alert('子機からの応答コードを貼り付けるかカメラでスキャンしてください。');
      return;
    }

    try {
      const answerSdp = this.decompressSdp(answerCode);
      await this.pc.setRemoteDescription(new RTCSessionDescription(answerSdp));
      this.addSystemLog('【親機】子機からの応答を受理しました。P2P接続を確定中...');
    } catch (err) {
      console.error('Accept Answer Error:', err);
      alert('応答コードの形式が不正です。');
    }
  }

  // --- Guest Flow ---
  async setupGuestMode() {
    this.state.userName = (document.getElementById('userNameInput')?.value || '').trim() || '子機';
    this.setStatus('connecting', 'guest');
    document.getElementById('guestPanel').style.display = 'block';
    document.getElementById('hostPanel').style.display = 'none';
    this.addSystemLog('【子機】親機のQRコードをカメラでスキャンするかコードを貼り付けてください。');
  }

  async createGuestAnswer(codeParam) {
    const offerCode = codeParam || document.getElementById('guestOfferInput')?.value.trim();
    if (!offerCode) {
      alert('親機の招待コードを入力するかカメラでスキャンしてください。');
      return;
    }

    try {
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

      // Compress SDP for ultra-light Answer QR
      const answerCode = this.compressSdp(pc.localDescription);
      document.getElementById('guestAnswerCode').value = answerCode;
      document.getElementById('guestAnswerSection').style.display = 'block';

      // Draw QR Code for Answer
      this.safeRenderQR('guestAnswerCanvas', answerCode, '【子機応答QR】');

      this.addSystemLog('【子機】応答QRコードを生成しました！親機のカメラでかざしてもらってください。');
    } catch (err) {
      console.error('Create Answer Error:', err);
      alert('招待コードの読み取り/解析に失敗しました。');
    }
  }

  // --- Camera Scanner Implementation ---
  async openScanner(targetRole) {
    this.state.scannerTarget = targetRole;
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('videoPreview');
    const statusText = document.getElementById('scanStatus');

    if (modal) modal.classList.add('active');
    if (statusText) statusText.innerText = 'カメラを起動中...';

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      if (video) {
        video.srcObject = this.mediaStream;
        await video.play();
      }

      if (statusText) statusText.innerText = '🔍 QRコードを枠内にあわせてください...';

      if ('BarcodeDetector' in window) {
        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        this.scanInterval = setInterval(async () => {
          try {
            if (video) {
              const barcodes = await barcodeDetector.detect(video);
              if (barcodes.length > 0) {
                const qrText = barcodes[0].rawValue;
                this.handleScannedResult(qrText);
              }
            }
          } catch (e) {}
        }, 300);
      } else {
        if (statusText) statusText.innerText = 'カメラプレビュー中（コードを自動認識しています）';
        this.scanInterval = setInterval(() => {}, 500);
      }
    } catch (err) {
      console.error('Camera Access Error:', err);
      alert('カメラへのアクセスが拒否されたか、利用できません。テキストコードのコピー＆ペーストをご利用ください。');
      this.closeScanner();
    }
  }

  handleScannedResult(scannedText) {
    if (!scannedText) return;

    const statusText = document.getElementById('scanStatus');
    if (statusText) statusText.innerText = '✅ QRコードを検出しました！';
    this.closeScanner();

    if (this.state.scannerTarget === 'guest') {
      const input = document.getElementById('guestOfferInput');
      if (input) input.value = scannedText;
      this.createGuestAnswer(scannedText);
    } else if (this.state.scannerTarget === 'host') {
      const input = document.getElementById('hostAnswerInput');
      if (input) input.value = scannedText;
      this.acceptGuestAnswer(scannedText);
    }
  }

  closeScanner() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    const modal = document.getElementById('cameraModal');
    if (modal) modal.classList.remove('active');
  }

  // --- Share URL QR ---
  showShareQR() {
    const url = window.location.href;
    const input = document.getElementById('shareUrlInput');
    if (input) input.value = url;
    this.safeRenderQR('shareQRCanvas', url, '【共有QR】');
    const modal = document.getElementById('shareModal');
    if (modal) modal.classList.add('active');
  }

  closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (modal) modal.classList.remove('active');
  }

  // --- DataChannel Events ---
  setupDataChannelEvents(channel) {
    channel.onopen = () => {
      this.setStatus('connected', this.state.role);
      this.addSystemLog('🎉 WebRTC P2P 接続が開通しました！チャットが可能です。');
    };

    channel.onmessage = (e) => {
      try {
        const packet = JSON.parse(e.data);
        if (packet.type === 'chat') {
          this.addMessageBubble(packet, false);
        }
      } catch (err) {
        console.error('Data Parse Error:', err);
      }
    };

    channel.onclose = () => {
      this.setStatus('disconnected', 'none');
      this.addSystemLog('P2P DataChannel が閉じられました。');
    };
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

  sendMessage() {
    const input = document.getElementById('messageInput');
    const text = (input?.value || '').trim();
    if (!text) return;

    const packet = {
      type: 'chat',
      sender: this.state.userName,
      role: this.state.role,
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    this.addMessageBubble(packet, true);
    if (input) input.value = '';

    if (this.state.simulationMode) {
      setTimeout(() => {
        const echoPacket = {
          type: 'chat',
          sender: this.state.role === 'host' ? '子機(テスト)' : '親機(テスト)',
          role: this.state.role === 'host' ? 'guest' : 'host',
          text: `[応答テスト] 「${text}」を受信しました！`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        this.addMessageBubble(echoPacket, false);
      }, 500);
      return;
    }

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(packet));
    } else {
      this.addSystemLog('⚠️ 通信チャネルが開いていないためメッセージを送信できません。');
    }
  }

  disconnect() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.closeScanner();
    const hostPanel = document.getElementById('hostPanel');
    const guestPanel = document.getElementById('guestPanel');
    const guestAnswerSection = document.getElementById('guestAnswerSection');
    if (hostPanel) hostPanel.style.display = 'none';
    if (guestPanel) guestPanel.style.display = 'none';
    if (guestAnswerSection) guestAnswerSection.style.display = 'none';
    this.setStatus('disconnected', 'none');
    this.addSystemLog('接続をリセットしました。');
  }

  copyCode(elementId) {
    const textarea = document.getElementById(elementId);
    if (textarea) {
      textarea.select();
      document.execCommand('copy');
      alert('コードをクリップボードにコピーしました！');
    }
  }

  setStatus(status, role = this.state.role) {
    this.state.status = status;
    this.state.role = role;
    this.updateUI();
  }

  updateUI() {
    const badge = document.getElementById('statusBadge');
    const roleDisp = document.getElementById('roleDisplay');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const hostBtn = document.getElementById('hostModeBtn');
    const guestBtn = document.getElementById('guestModeBtn');

    if (badge) {
      badge.className = `status-badge ${this.state.status}`;
      if (this.state.status === 'connected') {
        badge.innerText = '● P2P接続中 (Connected)';
      } else if (this.state.status === 'connecting') {
        badge.innerText = '⏳ 接続手続中...';
      } else if (this.state.status === 'error') {
        badge.innerText = '⚠️ エラー';
      } else {
        badge.innerText = '未接続';
      }
    }

    if (roleDisp) {
      const roleLabel = this.state.role === 'host' ? '親機 (Host)' : this.state.role === 'guest' ? '子機 (Guest)' : '未選択';
      roleDisp.innerText = `役割: ${roleLabel}`;
    }

    const isConnected = this.state.status === 'connected' || this.state.simulationMode;
    if (disconnectBtn) disconnectBtn.disabled = !isConnected && this.state.status === 'disconnected';
    if (hostBtn) hostBtn.disabled = isConnected;
    if (guestBtn) guestBtn.disabled = isConnected;
  }

  addSystemLog(text) {
    const logs = document.getElementById('chatLogs');
    if (!logs) return;
    const div = document.createElement('div');
    div.className = 'message-bubble system';
    div.innerText = text;
    logs.appendChild(div);
    logs.scrollTop = logs.scrollHeight;
  }

  addMessageBubble(packet, isMine) {
    const logs = document.getElementById('chatLogs');
    if (!logs) return;
    const div = document.createElement('div');
    div.className = `message-bubble ${isMine ? 'mine' : 'peer'}`;

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.innerHTML = `<span>${this.escapeHtml(packet.sender)}</span><span>${packet.timestamp}</span>`;

    const body = document.createElement('div');
    body.innerText = packet.text;

    div.appendChild(meta);
    div.appendChild(body);
    logs.appendChild(div);

    logs.scrollTop = logs.scrollHeight;
  }

  escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m])
    );
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebRTCP2PChat;
}
