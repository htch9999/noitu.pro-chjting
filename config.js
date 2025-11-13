// config.js - File cấu hình extension

// ========================================
// DANH SÁCH DOMAIN ĐƯỢC PHÉP
// ========================================
// Extension CHỈ hoạt động trên các domain trong danh sách này
// Thêm/xóa domain tùy ý

const CONFIG = {
  // Danh sách domain được phép (không cần http:// hoặc https://)
  allowedDomains: [
    // Ví dụ các domain phổ biến cho game nối từ:
    'noitu.pro',
    // 'another-game.com',       // Uncomment để thêm domain mới
  ],

  // Có cho phép tất cả subdomain không?
  // Ví dụ: allowSubdomains = true → abc.noiketoi.com cũng được phép
  allowSubdomains: true,

  // Delay giữa các lượt chơi (ms) - tránh spam
  autoPlayDelay: 500,

  // Số logs tối đa lưu trữ
  maxLogs: 100,

  // Hiển thị logs trong console không?
  debugMode: true
};

// Export để sử dụng trong các file khác
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}