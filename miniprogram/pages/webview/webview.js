const config = require('../../config.js');

Page({
  data: {
    url: '',
    loading: true,
    error: '',
  },

  onLoad(query) {
    let url = query.url ? decodeURIComponent(query.url) : '';
    const base = config.h5BaseUrl ? String(config.h5BaseUrl).replace(/\/$/, '') : '';

    if (url) {
      if (!url.startsWith('https://')) {
        wx.showModal({
          title: '无法打开',
          content: 'WebView 仅支持 https 地址。',
          showCancel: false,
        });
        this.setData({ loading: false, error: '地址无效' });
        return;
      }
      this.setData({ url, loading: false });
      return;
    }

    if (!base.startsWith('https://') || base.includes('YOUR_H5_DOMAIN')) {
      wx.showModal({
        title: '无法加载',
        content: '请在 miniprogram/config.js 配置有效的 h5BaseUrl（https）。',
        showCancel: false,
      });
      this.setData({
        loading: false,
        error: '未配置 h5BaseUrl',
      });
      return;
    }

    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          this.setData({ loading: false, error: '获取登录凭证失败' });
          return;
        }
        wx.request({
          url: `${base}/api/auth/weixin-mini`,
          method: 'POST',
          header: { 'Content-Type': 'application/json' },
          data: JSON.stringify({ code: loginRes.code }),
          success: (r) => {
            const status = r.statusCode;
            const body = r.data || {};
            if (status !== 200 || !body.ticket) {
              const msg =
                (typeof body.error === 'string' && body.error) ||
                (status === 503 ? '服务端未配置微信登录' : `登录失败（${status}）`);
              this.setData({ loading: false, error: msg });
              return;
            }
            const ticket = encodeURIComponent(body.ticket);
            this.setData({
              url: `${base}/?ticket=${ticket}`,
              loading: false,
              error: '',
            });
          },
          fail: () => {
            this.setData({ loading: false, error: '网络错误，请检查合法域名与部署' });
          },
        });
      },
      fail: () => {
        this.setData({ loading: false, error: 'wx.login 失败' });
      },
    });
  },
});
