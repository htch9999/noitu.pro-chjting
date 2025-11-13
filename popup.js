// popup.js - Fixed version
let logsUpdateInterval;
let isUpdating = false;

// Kiểm tra domain hiện tại
async function checkCurrentDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      const domain = url.hostname;
      
      document.getElementById('domain-name').textContent = domain;
      
      const allowedDomains = [
        'noitu.pro',
      ];
      
      const isAllowed = allowedDomains.some(allowed => 
        domain === allowed || domain.endsWith('.' + allowed)
      );
      
      const statusEl = document.getElementById('domain-status');
      if (isAllowed) {
        statusEl.innerHTML = '✅ <strong style="color: #4CAF50;">Extension đang hoạt động</strong>';
      } else {
        statusEl.innerHTML = `
          ⚠️ <strong style="color: #FF9800;">Extension KHÔNG hoạt động trên domain này</strong><br>
          <span style="font-size: 11px; opacity: 0.8;">
            Domains được phép: ${allowedDomains.join(', ')}
          </span>
        `;
      }
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra domain:', error);
    document.getElementById('domain-name').textContent = 'Không xác định';
  }
}

async function updateStats() {
  // Ngăn cập nhật đồng thời
  if (isUpdating) return;
  
  isUpdating = true;
  
  try {
    // Kiểm tra chrome.storage còn hoạt động không
    if (!chrome || !chrome.storage || !chrome.storage.local) {
      throw new Error('Extension context invalidated');
    }

    const data = await chrome.storage.local.get(['dictionary', 'lastUpdate', 'logs']);
    
    if (data.dictionary && data.dictionary.length > 0) {
      document.getElementById('word-count').textContent = data.dictionary.length.toLocaleString();
      
      const size = new Blob([JSON.stringify(data.dictionary)]).size;
      const sizeKB = (size / 1024).toFixed(2);
      document.getElementById('storage-size').textContent = sizeKB + ' KB';
      
      if (data.lastUpdate) {
        const date = new Date(data.lastUpdate);
        document.getElementById('last-update').textContent = date.toLocaleDateString('vi-VN');
      } else {
        document.getElementById('last-update').textContent = 'Chưa rõ';
      }
    } else {
      document.getElementById('word-count').textContent = '0';
      document.getElementById('storage-size').textContent = '0 KB';
      document.getElementById('last-update').textContent = 'Chưa tải';
    }

    // Update logs
    updateLogs(data.logs || []);
    
  } catch (error) {
    console.error('Lỗi khi cập nhật thống kê:', error);
    
    if (error.message.includes('Extension context invalidated')) {
      // Dừng interval để không cố cập nhật nữa
      if (logsUpdateInterval) {
        clearInterval(logsUpdateInterval);
      }
      
      document.getElementById('status-text').innerHTML = 
        '⚠️ Extension đã reload. Vui lòng <strong>đóng popup và mở lại</strong>.';
      document.getElementById('status-text').style.background = '#F44336';
    }
  } finally {
    isUpdating = false;
  }
}

function updateLogs(logs) {
  const container = document.getElementById('logs-container');
  
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-logs">Chưa có logs nào...</div>';
    return;
  }

  // Hiển thị 50 logs gần nhất
  const recentLogs = logs.slice(0, 50);
  
  container.innerHTML = recentLogs.map(log => {
    const typeClass = `log-${log.type || 'info'}`;
    return `
      <div class="log-item">
        <div class="log-time">${log.timestamp}</div>
        <div class="log-message ${typeClass}">${escapeHtml(log.message)}</div>
      </div>
    `;
  }).join('');

  // Count used words from logs
  const usedWordsCount = logs.filter(l => 
    l.message.includes('Đã gửi từ') || l.message.includes('đã điền từ') || l.message.includes('Hoàn tất gửi từ')
  ).length;
  document.getElementById('used-count').textContent = usedWordsCount;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.getElementById('reload-dict').addEventListener('click', async () => {
  const button = document.getElementById('reload-dict');
  const originalText = button.textContent;
  button.textContent = '⏳ Đang tải...';
  button.disabled = true;
  
  try {
    document.getElementById('status-text').textContent = '⏳ Đang tải từ điển từ CSDL...';
    
    const url = '/words.txt';
    const response = await fetch(url);
    const text = await response.text();
    const lines = text.trim().split('\n');
    
    const allWords = lines.map(line => {
      try {
        return JSON.parse(line).text.toLowerCase();
      } catch {
        return null;
      }
    }).filter(Boolean);
    
    const dictionary = allWords.filter(word => {
      const parts = word.split(' ');
      return parts.length === 2 && 
             !word.includes('-') && 
             !word.includes('(') && 
             !word.includes(')');
    });
    
    await chrome.storage.local.set({ 
      dictionary: dictionary,
      lastUpdate: new Date().toISOString()
    });
    
    document.getElementById('status-text').textContent = `✅ Đã tải thành công ${dictionary.length} từ!`;
    await updateStats();
    
  } catch (error) {
    document.getElementById('status-text').textContent = '❌ Lỗi: ' + error.message;
  } finally {
    button.textContent = originalText;
    button.disabled = false;
  }
});

document.getElementById('clear-logs').addEventListener('click', async () => {
  if (confirm('Bạn có chắc muốn xóa toàn bộ logs?')) {
    await chrome.storage.local.set({ logs: [] });
    document.getElementById('status-text').textContent = '🗑️ Đã xóa logs';
    await updateStats();
  }
});

document.getElementById('clear-data').addEventListener('click', async () => {
  if (confirm('⚠️ CẢNH BÁO: Hành động này sẽ xóa toàn bộ từ điển và logs!\n\nBạn có chắc chắn không?')) {
    await chrome.storage.local.clear();
    document.getElementById('status-text').textContent = '🗑️ Đã xóa toàn bộ dữ liệu';
    await updateStats();
  }
});

// Tự động cập nhật logs mỗi 3 giây (tăng từ 2 giây để giảm tải)
logsUpdateInterval = setInterval(async () => {
  // Chỉ cập nhật khi không đang cập nhật
  if (!isUpdating) {
    try {
      const data = await chrome.storage.local.get(['logs']);
      if (data.logs) {
        updateLogs(data.logs);
      }
    } catch (error) {
      // Nếu có lỗi, dừng interval
      console.error('Lỗi cập nhật logs:', error);
      clearInterval(logsUpdateInterval);
    }
  }
}, 3000);

// Cleanup khi đóng popup
window.addEventListener('unload', () => {
  if (logsUpdateInterval) {
    clearInterval(logsUpdateInterval);
  }
});

// Ngăn popup reload khi có thay đổi storage
window.addEventListener('beforeunload', (e) => {
  if (logsUpdateInterval) {
    clearInterval(logsUpdateInterval);
  }
});

// Cập nhật thống kê ban đầu
checkCurrentDomain();
updateStats();