// content.js - Script chạy trên trang web game - Fixed version

// ========== CẤU HÌNH TRANG WEB ==========
const ALLOWED_DOMAINS = (typeof CONFIG !== 'undefined' && CONFIG.allowedDomains) 
  ? CONFIG.allowedDomains 
  : ['noitu.pro'];

const ALLOW_SUBDOMAINS = (typeof CONFIG !== 'undefined' && CONFIG.allowSubdomains) 
  ? CONFIG.allowSubdomains 
  : true;

const DEBUG_MODE = (typeof CONFIG !== 'undefined' && CONFIG.debugMode) 
  ? CONFIG.debugMode 
  : false;

// Kiểm tra xem có nên chạy trên trang này không
function shouldRunOnThisPage() {
  const currentDomain = window.location.hostname;
  
  if (ALLOWED_DOMAINS.includes(currentDomain)) {
    return true;
  }
  
  if (ALLOW_SUBDOMAINS) {
    for (const domain of ALLOWED_DOMAINS) {
      if (currentDomain.endsWith('.' + domain) || currentDomain === domain) {
        return true;
      }
    }
  }
  
  return false;
}

if (!shouldRunOnThisPage()) {
  if (DEBUG_MODE) {
    console.log('[Word Chain] Extension chỉ hoạt động trên các domain:', ALLOWED_DOMAINS);
    console.log('[Word Chain] Domain hiện tại:', window.location.hostname);
  }
  throw new Error('Extension không hoạt động trên domain này');
}

if (DEBUG_MODE) {
  console.log('[Word Chain] ✅ Extension đang chạy trên domain:', window.location.hostname);
}

class WordChainHelper {
  constructor() {
    this.dictionary = [];
    this.usedWords = new Set();
    this.initialized = false;
    this.autoPlayEnabled = false;
    this.observer = null;
    this.logs = [];
    this.enterDelay = 300;
    this.autoReplayEnabled = false;
    this.replayObserver = null;
    this.autoEnterEnabled = true;
    this.isProcessing = false;
    this.actionDelay = 800;
    this.lastActionTime = 0;
    this.logQueue = [];
    this.isFlushingLogs = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    this.addLogToQueue('Đang khởi tạo extension...', 'info');
    
    try {
      if (!chrome || !chrome.storage || !chrome.storage.local) {
        throw new Error('Chrome storage API không khả dụng');
      }

      const stored = await chrome.storage.local.get(['dictionary', 'enterDelay', 'autoReplayEnabled', 'autoEnterEnabled', 'actionDelay']);
      
      if (stored.dictionary && stored.dictionary.length > 0) {
        this.dictionary = stored.dictionary;
        this.addLogToQueue(`Đã tải ${this.dictionary.length} từ từ cache`, 'success');
      } else {
        this.addLogToQueue('⚠️ Chưa có từ điển! Vui lòng mở popup và tải từ điển.', 'warning');
      }
      
      if (stored.enterDelay !== undefined) {
        this.enterDelay = stored.enterDelay;
      }
      
      if (stored.actionDelay !== undefined) {
        this.actionDelay = stored.actionDelay;
      }
      
      if (stored.autoReplayEnabled !== undefined) {
        this.autoReplayEnabled = stored.autoReplayEnabled;
        if (this.autoReplayEnabled) {
          this.startReplayObserver();
        }
      }
      
      if (stored.autoEnterEnabled !== undefined) {
        this.autoEnterEnabled = stored.autoEnterEnabled;
      }
      
      this.initialized = true;
      
      // Bắt đầu flush logs định kỳ
      this.startLogFlusher();
      
    } catch (error) {
      this.addLogToQueue('Lỗi khởi tạo: ' + error.message, 'error');
      
      if (error.message.includes('Extension context invalidated')) {
        this.showReloadNotification();
      }
    }
  }

  showReloadNotification() {
    const notification = document.createElement('div');
    notification.id = 'wch-reload-notification';
    notification.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #FF5252 0%, #F44336 100%);
        color: white;
        padding: 30px;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        z-index: 99999;
        text-align: center;
        max-width: 400px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      ">
        <h3 style="margin: 0 0 15px 0; font-size: 20px;">⚠️ Extension Cần Reload</h3>
        <p style="margin: 0 0 20px 0; font-size: 14px; opacity: 0.9;">
          Extension đã được cập nhật hoặc reload.<br>
          Vui lòng <strong>reload trang web</strong> để tiếp tục sử dụng.
        </p>
        <button onclick="location.reload()" style="
          padding: 12px 30px;
          background: white;
          color: #F44336;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
        ">🔄 Reload Ngay</button>
      </div>
    `;
    document.body.appendChild(notification);
  }

  addLogToQueue(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const log = { timestamp, message, type };
    
    this.logQueue.push(log);
    
    // Cập nhật UI ngay lập tức
    this.updateLogDisplay(log);
  }

  // Flush logs batch vào storage để tránh quá nhiều write operations
  async flushLogs() {
    if (this.isFlushingLogs || this.logQueue.length === 0) return;
    
    this.isFlushingLogs = true;
    
    try {
      // Lấy logs hiện tại từ storage
      const stored = await chrome.storage.local.get(['logs']);
      const currentLogs = stored.logs || [];
      
      // Thêm logs mới vào đầu
      const newLogs = [...this.logQueue, ...currentLogs].slice(0, 100);
      
      // Lưu lại
      await chrome.storage.local.set({ logs: newLogs });
      
      // Cập nhật logs local
      this.logs = newLogs;
      
      // Xóa queue
      this.logQueue = [];
      
    } catch (error) {
      console.warn('Không thể lưu logs:', error.message);
    } finally {
      this.isFlushingLogs = false;
    }
  }

  startLogFlusher() {
    // Flush logs mỗi 5 giây thay vì mỗi lần add log
    setInterval(() => {
      this.flushLogs();
    }, 5000);
  }

  updateLogDisplay(latestLog = null) {
    const logContainer = document.getElementById('wch-logs');
    if (!logContainer) return;
    
    // Nếu có log mới, thêm vào đầu
    if (latestLog) {
      const color = {
        'info': '#4A9EFF',
        'success': '#4CAF50',
        'error': '#F44336',
        'warning': '#FF9800'
      }[latestLog.type] || '#4A9EFF';
      
      const logHtml = `
        <div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.1);font-size:10px;">
          <span style="opacity:0.6;">${latestLog.timestamp}</span>
          <span style="color:${color};margin-left:8px;">${latestLog.message}</span>
        </div>
      `;
      
      logContainer.insertAdjacentHTML('afterbegin', logHtml);
      
      // Giữ tối đa 10 logs trong UI
      const logItems = logContainer.querySelectorAll('div');
      if (logItems.length > 10) {
        logItems[logItems.length - 1].remove();
      }
    }
  }

  findWordsByFirstSyllable(syllable) {
    return this.dictionary.filter(word => {
      const parts = word.split(' ');
      return parts[0] === syllable.toLowerCase() && !this.usedWords.has(word);
    });
  }

  getLastSyllable(word) {
    const parts = word.trim().split(/\s+/);
    return parts[parts.length - 1].toLowerCase();
  }

  findBestWordStartingWith(firstSyllable) {
    const candidates = this.findWordsByFirstSyllable(firstSyllable);
    
    if (candidates.length === 0) return null;
    
    const scored = candidates.map(word => {
      const nextSyllable = this.getLastSyllable(word);
      const nextOptions = this.findWordsByFirstSyllable(nextSyllable);
      
      return {
        word,
        score: nextOptions.length,
        hasFollowing: nextOptions.length > 0
      };
    });
    
    const valid = scored.filter(s => s.hasFollowing);
    
    if (valid.length === 0) {
      return candidates[0];
    }
    
    valid.sort((a, b) => a.score - b.score);
    
    return valid[0].word;
  }

  markWordUsed(word) {
    this.usedWords.add(word.toLowerCase());
  }

  reset() {
    this.usedWords.clear();
    this.addLogToQueue('Đã reset danh sách từ đã sử dụng', 'info');
  }

  getStats() {
    return {
      totalWords: this.dictionary.length,
      usedWords: this.usedWords.size,
      remainingWords: this.dictionary.length - this.usedWords.size
    };
  }

  async setEnterDelay(delay) {
    this.enterDelay = delay;
    try {
      await chrome.storage.local.set({ enterDelay: delay });
      this.addLogToQueue(`Đã đặt delay = ${delay}ms`, 'success');
    } catch (error) {
      this.addLogToQueue('Lỗi khi lưu delay: ' + error.message, 'error');
    }
  }

  async toggleAutoEnter(enabled) {
    this.autoEnterEnabled = enabled;
    
    try {
      await chrome.storage.local.set({ autoEnterEnabled: enabled });
    } catch (error) {
      this.addLogToQueue('Lỗi khi lưu cài đặt auto enter: ' + error.message, 'error');
    }

    if (enabled) {
      this.addLogToQueue('⌨️ Bật tự động nhấn Enter', 'success');
    } else {
      this.addLogToQueue('⏸️ Tắt tự động nhấn Enter (chỉ điền từ)', 'info');
    }
  }

  async setActionDelay(delay) {
    this.actionDelay = delay;
    try {
      await chrome.storage.local.set({ actionDelay: delay });
      this.addLogToQueue(`Đã đặt delay giữa hành động = ${delay}ms`, 'success');
    } catch (error) {
      this.addLogToQueue('Lỗi khi lưu action delay: ' + error.message, 'error');
    }
  }

  isMyTurn() {
    const statusElements = [
      document.querySelector('.game-status'),
      document.querySelector('.turn-status'),
      document.querySelector('#status'),
      document.querySelector('[class*="status"]')
    ];

    for (const el of statusElements) {
      if (el && el.textContent) {
        const text = el.textContent.toLowerCase();
        
        if (text.includes('đối thủ đang') || 
            text.includes('opponent') || 
            text.includes('waiting') ||
            text.includes('chờ đối thủ')) {
          this.addLogToQueue('⏳ Đối thủ đang trả lời, chờ...', 'warning');
          return false;
        }
      }
    }

    const inputElement = document.getElementById('text');
    if (inputElement && inputElement.disabled) {
      this.addLogToQueue('⏳ Input đang bị khóa, chờ lượt của mình...', 'warning');
      return false;
    }

    const headElement = document.getElementById('head');
    if (!headElement || !headElement.textContent.trim()) {
      return false;
    }

    return true;
  }

  canPerformAction() {
    const now = Date.now();
    const timeSinceLastAction = now - this.lastActionTime;
    
    if (timeSinceLastAction < this.actionDelay) {
      const waitTime = this.actionDelay - timeSinceLastAction;
      this.addLogToQueue(`⏱️ Throttle: chờ ${waitTime}ms trước hành động tiếp theo`, 'info');
      return false;
    }
    
    return true;
  }

  updateLastActionTime() {
    this.lastActionTime = Date.now();
  }

  startAutoPlay() {
    if (this.autoPlayEnabled) {
      this.addLogToQueue('Auto play đã được bật rồi', 'warning');
      return;
    }
    
    this.autoPlayEnabled = true;
    this.addLogToQueue('🤖 Bật chế độ auto play', 'success');
    
    this.checkAndPlay();
    this.startObserver();
  }

  stopAutoPlay() {
    this.autoPlayEnabled = false;
    this.addLogToQueue('⏸️ Tắt chế độ auto play', 'info');
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  startObserver() {
    const targetNode = document.getElementById('head');
    if (!targetNode) {
      this.addLogToQueue('Không tìm thấy element #head trên trang', 'error');
      return;
    }

    const config = { 
      childList: true, 
      characterData: true, 
      subtree: true 
    };

    let timeoutId = null;

    this.observer = new MutationObserver((mutations) => {
      if (!this.autoPlayEnabled) return;
      
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(() => {
        this.checkAndPlay();
      }, 300);
    });

    this.observer.observe(targetNode, config);
    this.addLogToQueue('Đã bắt đầu theo dõi thay đổi trên trang', 'info');
  }

  submitInput(inputElement, word) {
    if (!this.autoEnterEnabled) {
      this.addLogToQueue('ℹ️ Đã điền từ nhưng không tự động nhấn Enter (chức năng đã tắt)', 'info');
      return;
    }

    this.addLogToQueue(`🎯 Bắt đầu gửi từ với delay ${this.enterDelay}ms...`, 'info');

    setTimeout(() => {
      try {
        const events = [
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          }),
          new KeyboardEvent('keypress', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          }),
          new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
          })
        ];

        events.forEach(event => inputElement.dispatchEvent(event));

        const form = inputElement.closest('form');
        if (form) {
          if (typeof form.submit === 'function') {
            form.submit();
          }
          
          const submitEvent = new Event('submit', { 
            bubbles: true, 
            cancelable: true 
          });
          form.dispatchEvent(submitEvent);
        }

        const submitButton = document.querySelector('button[type="submit"]') ||
                            document.querySelector('input[type="submit"]') ||
                            document.querySelector('button:not([type])');
        
        if (submitButton) {
          submitButton.click();
        }

        const changeEvent = new Event('change', { bubbles: true });
        inputElement.dispatchEvent(changeEvent);

        this.addLogToQueue(`✅ Hoàn tất gửi từ: "${word}"`, 'success');
        updateStats();

      } catch (error) {
        this.addLogToQueue('❌ Lỗi khi submit: ' + error.message, 'error');
      }
    }, this.enterDelay);
  }

  checkAndPlay() {
    if (this.isProcessing) {
      return;
    }

    if (!this.canPerformAction()) {
      return;
    }

    if (!this.autoPlayEnabled) return;

    this.isProcessing = true;

    try {
      const headElement = document.getElementById('head');
      const inputElement = document.getElementById('text');

      if (!headElement || !inputElement) {
        this.addLogToQueue('Không tìm thấy element cần thiết (#head hoặc #text)', 'error');
        this.isProcessing = false;
        return;
      }

      if (!this.isMyTurn()) {
        this.isProcessing = false;
        return;
      }

      const firstSyllable = headElement.textContent.trim();
      
      if (!firstSyllable) {
        this.isProcessing = false;
        return;
      }

      this.addLogToQueue(`📖 Phát hiện tiếng đầu: "${firstSyllable}"`, 'info');

      const bestWord = this.findBestWordStartingWith(firstSyllable);

      if (!bestWord) {
        this.addLogToQueue(`❌ Không tìm thấy từ nào bắt đầu bằng "${firstSyllable}"`, 'error');
        this.isProcessing = false;
        return;
      }

      const parts = bestWord.split(' ');
      const secondSyllable = parts[1];

      this.addLogToQueue(`✨ Tìm thấy từ tốt nhất: "${bestWord}"`, 'success');

      inputElement.value = secondSyllable;
      this.addLogToQueue(`⌨️ Đã điền tiếng thứ 2: "${secondSyllable}"`, 'info');

      this.markWordUsed(bestWord);

      const inputEvent = new Event('input', { bubbles: true });
      inputElement.dispatchEvent(inputEvent);

      this.updateLastActionTime();

      this.submitInput(inputElement, bestWord);

      setTimeout(() => {
        this.isProcessing = false;
      }, this.enterDelay + 200);

    } catch (error) {
      this.addLogToQueue('❌ Lỗi trong checkAndPlay: ' + error.message, 'error');
      this.isProcessing = false;
    }
  }

  manualPlay() {
    if (this.autoPlayEnabled) {
      this.addLogToQueue('⚠️ Đang ở chế độ auto play, vui lòng tắt trước', 'warning');
      return;
    }
    this.checkAndPlay();
  }

  async toggleAutoReplay(enabled) {
    this.autoReplayEnabled = enabled;
    
    try {
      await chrome.storage.local.set({ autoReplayEnabled: enabled });
    } catch (error) {
      this.addLogToQueue('Lỗi khi lưu cài đặt auto replay: ' + error.message, 'error');
    }

    if (enabled) {
      this.addLogToQueue('🔄 Bật tự động chơi lại', 'success');
      this.startReplayObserver();
    } else {
      this.addLogToQueue('⏸️ Tắt tự động chơi lại', 'info');
      this.stopReplayObserver();
    }
  }

  startReplayObserver() {
    this.stopReplayObserver();

    let checkTimeout = null;

    this.replayObserver = new MutationObserver((mutations) => {
      if (checkTimeout) {
        clearTimeout(checkTimeout);
      }
      
      checkTimeout = setTimeout(() => {
        this.checkForReplayButton();
      }, 500);
    });

    this.replayObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.addLogToQueue('👀 Đang theo dõi nút chơi lại...', 'info');
    
    setTimeout(() => this.checkForReplayButton(), 500);
  }

  stopReplayObserver() {
    if (this.replayObserver) {
      this.replayObserver.disconnect();
      this.replayObserver = null;
    }
  }

  checkForReplayButton() {
    if (!this.autoReplayEnabled) return;

    const replayButton = document.querySelector('button.swal-button.swal-button--confirm');
    
    if (replayButton && replayButton.textContent.includes('Chơi lại')) {
      this.addLogToQueue('🎯 Phát hiện nút "Chơi lại"!', 'success');
      
      setTimeout(() => {
        if (this.autoReplayEnabled) {
          this.addLogToQueue('🔄 Đang reset game và bắt đầu ván mới...', 'info');
          
          this.reset();
          
          replayButton.click();
          this.addLogToQueue('✅ Đã nhấn "Chơi lại"', 'success');
          
          if (this.autoPlayEnabled) {
            setTimeout(() => {
              this.checkAndPlay();
            }, 1000);
          }
        }
      }, 1500);
    }
  }
}

const helper = new WordChainHelper();

// Tạo UI panel với khả năng kéo thả
function createPanel() {
  const panel = document.createElement('div');
  panel.id = 'word-chain-helper';
  panel.innerHTML = `
    <div class="wch-header" id="wch-drag-handle">
      <h3>NoiTu.Pro - Internal Cheat | @htch9999</h3>
    </div>
    <div class="wch-content">
      <div class="wch-auto-control">
        <button id="wch-auto-start" class="btn-auto">🤖 Bật Auto</button>
        <button id="wch-auto-stop" class="btn-auto" style="display:none;">⏸️ Tắt Auto</button>
        <button id="wch-manual-play" class="btn-manual">▶️ Chơi 1 Lượt</button>
      </div>

      <div class="wch-section">
        <h4>🔄 Auto Replay</h4>
        <label class="switch-container">
          <input type="checkbox" id="auto-replay-toggle">
          <span class="switch-slider"></span>
          <span class="switch-label">Tự động chơi lại</span>
        </label>
      </div>

      <div class="wch-section">
        <h4>⏱️ Cài Đặt</h4>
        <label class="switch-container">
          <input type="checkbox" id="auto-enter-toggle" checked>
          <span class="switch-slider"></span>
          <span class="switch-label">Tự động nhấn Enter</span>
        </label>
        <div id="delay-settings">
          <label style="font-size:11px;">Delay Enter: <strong id="delay-value">300</strong>ms</label>
          <input type="range" id="delay-slider" min="0" max="7000" step="50" value="300">
        </div>
        <div style="margin-top:8px;">
          <label style="font-size:11px;">Delay giữa hành động: <strong id="action-delay-value">800</strong>ms</label>
          <input type="range" id="action-delay-slider" min="200" max="3000" step="100" value="800">
        </div>
      </div>

      <div class="wch-section">
        <h4>📋 Logs</h4>
        <div id="wch-logs" class="logs-box"></div>
      </div>

      <div class="wch-actions">
        <button id="wch-reset">🔄 Reset</button>
      </div>
      
      <div class="wch-stats" id="wch-stats"></div>
    </div>
  `;
  
  document.body.appendChild(panel);
  
  // Khả năng kéo thả panel
  makeDraggable(panel);
  
  // CSS
  const style = document.createElement('style');
  style.textContent = `
    #word-chain-helper {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      max-height: 90vh;
      overflow: hidden;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 10000;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: white;
    }
    .wch-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      background: inherit;
      cursor: move;
      user-select: none;
    }
    .wch-header h3 {
      margin: 0;
      font-size: 16px;
    }

    .wch-content {
      padding: 12px;
      max-height: calc(90vh - 52px);
      overflow-y: auto;
    }

    .wch-auto-control {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin-bottom: 12px;
    }
    .btn-auto, .btn-manual {
      padding: 10px;
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 13px;
      font-weight: bold;
      transition: all 0.2s;
    }
    .btn-auto {
      background: #4CAF50;
    }
    .btn-auto:hover {
      background: #45a049;
      transform: translateY(-1px);
    }
    #wch-auto-stop {
      background: #FF5722;
    }
    #wch-auto-stop:hover {
      background: #E64A19;
    }
    .btn-manual {
      background: #2196F3;
    }
    .btn-manual:hover {
      background: #0b7dda;
      transform: translateY(-1px);
    }
    .wch-section {
      margin-bottom: 12px;
      background: rgba(255,255,255,0.1);
      padding: 10px;
      border-radius: 8px;
    }
    .wch-section h4 {
      margin: 0 0 8px 0;
      font-size: 13px;
      opacity: 0.9;
    }
    .switch-container {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      margin-bottom: 8px;
    }
    .switch-container input[type="checkbox"] {
      display: none;
    }
    .switch-slider {
      position: relative;
      width: 44px;
      height: 24px;
      background: rgba(255,255,255,0.2);
      border-radius: 12px;
      transition: all 0.3s;
      flex-shrink: 0;
    }
    .switch-slider::before {
      content: '';
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: white;
      top: 3px;
      left: 3px;
      transition: all 0.3s;
    }
    .switch-container input:checked + .switch-slider {
      background: #4CAF50;
    }
    .switch-container input:checked + .switch-slider::before {
      transform: translateX(20px);
    }
    .switch-label {
      font-size: 12px;
      user-select: none;
    }
    #delay-settings {
      padding-left: 8px;
      opacity: 1;
      transition: opacity 0.3s;
    }
    #delay-settings.disabled {
      opacity: 0.4;
      pointer-events: none;
    }
    #delay-slider, #action-delay-slider {
      width: 100%;
      margin-top: 4px;
      margin-bottom: 8px;
    }
    .logs-box {
      background: rgba(0,0,0,0.2);
      padding: 8px;
      border-radius: 6px;
      max-height: 180px;
      overflow-y: auto;
      font-size: 10px;
    }
    .logs-box::-webkit-scrollbar {
      width: 5px;
    }
    .logs-box::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.1);
      border-radius: 3px;
    }
    .logs-box::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3);
      border-radius: 3px;
    }
    .wch-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .wch-actions button {
      flex: 1;
      padding: 8px;
      background: rgba(255,255,255,0.2);
      border: none;
      border-radius: 6px;
      color: white;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }
    .wch-actions button:hover {
      background: rgba(255,255,255,0.3);
      transform: translateY(-1px);
    }
    .wch-stats {
      font-size: 10px;
      opacity: 0.7;
      text-align: center;
      padding-top: 8px;
      border-top: 1px solid rgba(255,255,255,0.2);
    }
    .wch-content::-webkit-scrollbar {
      width: 6px;
    }
    .wch-content::-webkit-scrollbar-track {
      background: rgba(255,255,255,0.1);
    }
    .wch-content::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.3);
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);
  
  // Event listeners
  document.getElementById('wch-auto-start').addEventListener('click', () => {
    helper.startAutoPlay();
    document.getElementById('wch-auto-start').style.display = 'none';
    document.getElementById('wch-auto-stop').style.display = 'block';
  });

  document.getElementById('wch-auto-stop').addEventListener('click', () => {
    helper.stopAutoPlay();
    document.getElementById('wch-auto-start').style.display = 'block';
    document.getElementById('wch-auto-stop').style.display = 'none';
  });

  document.getElementById('wch-manual-play').addEventListener('click', () => {
    helper.manualPlay();
  });

  const autoReplayToggle = document.getElementById('auto-replay-toggle');
  autoReplayToggle.checked = helper.autoReplayEnabled;
  
  autoReplayToggle.addEventListener('change', (e) => {
    helper.toggleAutoReplay(e.target.checked);
  });

  const autoEnterToggle = document.getElementById('auto-enter-toggle');
  const delaySettings = document.getElementById('delay-settings');
  
  autoEnterToggle.checked = helper.autoEnterEnabled;
  
  if (!helper.autoEnterEnabled) {
    delaySettings.classList.add('disabled');
  }
  
  autoEnterToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    helper.toggleAutoEnter(enabled);
    
    if (enabled) {
      delaySettings.classList.remove('disabled');
    } else {
      delaySettings.classList.add('disabled');
    }
  });

  const delaySlider = document.getElementById('delay-slider');
  const delayValue = document.getElementById('delay-value');
  
  delaySlider.value = helper.enterDelay;
  delayValue.textContent = helper.enterDelay;
  
  delaySlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    delayValue.textContent = value;
    helper.setEnterDelay(value);
  });

  const actionDelaySlider = document.getElementById('action-delay-slider');
  const actionDelayValue = document.getElementById('action-delay-value');
  
  actionDelaySlider.value = helper.actionDelay;
  actionDelayValue.textContent = helper.actionDelay;
  
  actionDelaySlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    actionDelayValue.textContent = value;
    helper.setActionDelay(value);
  });
  
  document.getElementById('wch-reset').addEventListener('click', () => {
    helper.reset();
    updateStats();
  });

  setInterval(updateStats, 2000);
}

// Hàm tạo khả năng kéo thả cho panel
function makeDraggable(element) {
  const handle = element.querySelector('#wch-drag-handle');
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e.preventDefault();
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    
    let newTop = element.offsetTop - pos2;
    let newLeft = element.offsetLeft - pos1;
    
    // Giới hạn không cho kéo ra ngoài viewport
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - 100));
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
    
    element.style.top = newTop + "px";
    element.style.left = newLeft + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

function updateStats() {
  const stats = helper.getStats();
  document.getElementById('wch-stats').innerHTML = `
    📚 ${stats.totalWords} từ | ✅ ${stats.usedWords} đã dùng | 📝 ${stats.remainingWords} còn lại
  `;
}

// Khởi động
(async function init() {
  try {
    if (!chrome || !chrome.storage) {
      console.error('Extension context không hợp lệ. Vui lòng reload trang.');
      return;
    }

    await helper.initialize();
    createPanel();
    updateStats();
    helper.addLog('Extension đã khởi động thành công', 'success');
    
  } catch (error) {
    console.error('Lỗi khởi động extension:', error);
    
    if (error.message.includes('Extension context invalidated')) {
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: #F44336;
          color: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 99999;
          font-family: Arial;
          max-width: 300px;
        ">
          <strong>⚠️ Extension đã reload</strong><br>
          Vui lòng <a href="#" onclick="location.reload(); return false;" style="color: white; text-decoration: underline;">reload trang</a> để tiếp tục.
        </div>
      `;
      document.body.appendChild(notification);
    }
  }
})();