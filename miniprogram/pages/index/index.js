const config = require('../../config.js');

function isConfigured(url) {
  if (!url || typeof url !== 'string') return false;
  const t = url.trim();
  if (!t.startsWith('https://')) return false;
  if (t.includes('YOUR_H5_DOMAIN')) return false;
  return true;
}

Page({
  data: {
    canOpen: false,
  },
  onLoad() {
    this.setData({ canOpen: isConfigured(config.h5BaseUrl) });
  },
  onOpenGame() {
    if (!isConfigured(config.h5BaseUrl)) {
      wx.showToast({ title: '请先配置 H5 地址', icon: 'none' });
      return;
    }
    const base = config.h5BaseUrl.replace(/\/$/, '');
    wx.navigateTo({
      url: `/pages/webview/webview?url=${encodeURIComponent(base + '/')}`,
    });
  },
});
