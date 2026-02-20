// OKX Wallet Auto Approve - Popup Script
// v2.0.0: 新增白名单/黑名单 UI

document.addEventListener('DOMContentLoaded', async () => {
  // 获取配置
  const { config } = await chrome.storage.local.get('config');
  
  // 更新 UI
  if (config) {
    document.getElementById('enabled').checked = config.enabled;
    document.getElementById('autoApprove').checked = config.autoApprove;
    document.getElementById('approveDelay').value = config.approveDelay || 500;
    document.getElementById('approveCount').textContent = config.approveCount || 0;
    
    // v2.0.0 新增：白名单/黑名单 UI
    document.getElementById('whitelistMode').checked = config.whitelistMode || false;
    document.getElementById('whitelist').value = (config.whitelist || []).join('\n');
    document.getElementById('blacklist').value = (config.blacklist || []).join('\n');
    
    // 更新状态
    updateStatus(config.enabled);
    
    // 更新最后确认时间
    if (config.lastApproveTime) {
      const lastTime = new Date(config.lastApproveTime);
      const now = new Date();
      const diffMinutes = Math.floor((now - lastTime) / 1000 / 60);
      
      if (diffMinutes < 1) {
        document.getElementById('lastApprove').textContent = '刚刚';
      } else if (diffMinutes < 60) {
        document.getElementById('lastApprove').textContent = `${diffMinutes}分钟前`;
      } else if (diffMinutes < 1440) {
        document.getElementById('lastApprove').textContent = `${Math.floor(diffMinutes / 60)}小时前`;
      } else {
        document.getElementById('lastApprove').textContent = `${Math.floor(diffMinutes / 1440)}天前`;
      }
    }
  }
  
  // 监听状态变化
  document.getElementById('enabled').addEventListener('change', async (e) => {
    config.enabled = e.target.checked;
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
    updateStatus(config.enabled);
  });
  
  document.getElementById('autoApprove').addEventListener('change', async (e) => {
    config.autoApprove = e.target.checked;
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
  });
  
  document.getElementById('approveDelay').addEventListener('change', async (e) => {
    config.approveDelay = parseInt(e.target.value);
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
  });
  
  // v2.0.0 新增：白名单模式开关
  document.getElementById('whitelistMode').addEventListener('change', async (e) => {
    config.whitelistMode = e.target.checked;
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
  });
  
  // v2.0.0 新增：保存白名单
  document.getElementById('saveWhitelist').addEventListener('click', async () => {
    const text = document.getElementById('whitelist').value;
    // 按换行符分割，过滤空行和去除空格
    config.whitelist = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
    showSaveSuccess('whitelistSaved');
  });
  
  // v2.0.0 新增：保存黑名单
  document.getElementById('saveBlacklist').addEventListener('click', async () => {
    const text = document.getElementById('blacklist').value;
    // 按换行符分割，过滤空行和去除空格
    config.blacklist = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    await chrome.runtime.sendMessage({ action: 'updateConfig', config });
    showSaveSuccess('blacklistSaved');
  });
  
  // 更新状态显示
  function updateStatus(enabled) {
    const statusEl = document.getElementById('status');
    if (enabled) {
      statusEl.textContent = '运行中';
      statusEl.className = 'status active';
    } else {
      statusEl.textContent = '已禁用';
      statusEl.className = 'status inactive';
    }
  }
  
  // 显示保存成功提示
  function showSaveSuccess(elementId) {
    const el = document.getElementById(elementId);
    el.style.display = 'inline';
    setTimeout(() => {
      el.style.display = 'none';
    }, 2000);
  }
});
