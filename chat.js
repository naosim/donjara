class WebRTCP2PChat extends P2PConnection {
  constructor() {
    super({
      onOpen: () => {
        this.setStatus('connected', this.state.role);
        this.addSystemLog('🎉 WebRTC P2P 接続が開通しました！チャットが可能です。');
      },
      onClose: () => {
        this.setStatus('disconnected', 'none');
        this.addSystemLog('P2P DataChannel が閉じられました。');
      },
      onUnexpectedClose: () => {
        this.setStatus('disconnected', 'none');
        this.addSystemLog('通信が切断されました。');
      },
      onSendFailed: () => {
        this.addSystemLog('⚠️ 通信チャネルが開いていないためメッセージを送信できません。');
      },
      onMessage: (packet) => {
        if (packet && packet.type === 'chat') {
          this.addMessageBubble(packet, false);
        }
      }
    });

    this.state = {
      role: 'none',
      status: 'disconnected',
      theme: 'default',
      userName: 'プレイヤー1',
      simulationMode: false,
      scannerTarget: null
    };

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

  // --- Host Flow ---
  async setupHostMode() {
    this.state.userName = (document.getElementById('userNameInput')?.value || '').trim() || '親機';
    this.setStatus('connecting', 'host');
    document.getElementById('hostPanel').style.display = 'block';
    document.getElementById('guestPanel').style.display = 'none';

    this.addSystemLog('【親機】超極小招待コード（約40文字）＆特大ドットQRコードを生成中...');

    try {
      const offerCode = await this.buildOffer();
      document.getElementById('hostOfferCode').value = offerCode;
      this.safeRenderQR('hostOfferCanvas', offerCode, '【親機招待QR】');
    } catch (err) {
      console.error('Create Offer Error:', err);
      alert('招待コードの生成に失敗しました。');
    }
  }

  safeRenderQR(canvasId, textCode, label = '') {
    try {
      console.log(`[QR Debug] ${label} 描画開始. 文字数: ${textCode.length}`);
      if (typeof QRCode !== 'undefined' && QRCode.renderQRCode) {
        QRCode.renderQRCode(canvasId, textCode, 180);
        console.log(`[QR Debug] ${label} 描画成功! (文字数: ${textCode.length})`);
        this.addSystemLog(`${label} 特大ドットQRコードの描画に成功しました (文字数: わずか ${textCode.length} 文字!)`);
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
      await this.acceptAnswer(answerCode);
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
      const answerCode = await this.buildAnswer(offerCode);
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

  // --- Camera Scanner (UIはここで制御、スキャン本体はP2PConnection) ---
  async openScanner(targetRole) {
    this.state.scannerTarget = targetRole;
    const modal = document.getElementById('cameraModal');
    const video = document.getElementById('videoPreview');
    const statusText = document.getElementById('scanStatus');

    if (modal) modal.classList.add('active');
    if (statusText) statusText.innerText = 'カメラを起動中...';

    try {
      await this.startScanner(video, {
        onResult: (qrText) => this.handleScannedResult(qrText),
        onUnsupported: () => {
          if (statusText) statusText.innerText = '📷 カメラプレビュー中（コードは自動認識されません）';
        }
      });

      if (statusText) statusText.innerText = '🔍 QRコードを枠内にあわせてください...';
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
    this.stopScanner();
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

    if (!this.sendJSON(packet)) {
      this.addSystemLog('⚠️ 通信チャネルが開いていないためメッセージを送信できません。');
    }
  }

  disconnect() {
    this.closeScanner();
    super.disconnect();
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