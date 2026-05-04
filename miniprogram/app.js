const config = require('./config.js');

App({
  onLaunch() {
    if (!config.h5BaseUrl || config.h5BaseUrl.includes('YOUR_H5')) {
      console.warn('[海龟汤] 请在 miniprogram/config.js 中配置 h5BaseUrl（https 部署地址）');
    }
  },
  globalData: {
    h5BaseUrl: config.h5BaseUrl,
  },
});
