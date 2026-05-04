const config = require('../../config.js');

Page({
  data: {
    url: '',
  },
  onLoad(query) {
    let url = query.url ? decodeURIComponent(query.url) : '';
    if (!url && config.h5BaseUrl) {
      const base = String(config.h5BaseUrl).replace(/\/$/, '');
      if (base.startsWith('https://') && !base.includes('YOUR_H5_DOMAIN')) {
        url = base + '/';
      }
    }
    if (!url.startsWith('https://')) {
      wx.showModal({
        title: '无法打开',
        content: 'WebView 仅支持 https 地址，且需在小程序后台配置业务域名。',
        showCancel: false,
      });
      return;
    }
    this.setData({ url });
  },
});
