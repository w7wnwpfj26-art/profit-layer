// OKX Wallet Auto Approve - Content Script
// 注入到所有页面，检测并自动确认 OKX 钱包弹窗

(async function() {
  // 获取配置
  let config = null;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getConfig' });
    config = response.config;
  } catch (err) {
    console.error('获取配置失败:', err);
    return;
  }

  if (!config || !config.enabled) {
    return;
  }

  console.log('[OKX Auto Approve] 内容脚本已加载');

  // 注入脚本到页面上下文
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // 监听来自注入脚本的消息
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data.type === 'OKX_WALLET_DETECTED') {
      console.log('[OKX Auto Approve] 检测到 OKX 钱包');
    }
  });

  // OKX 钱包弹窗选择器（仅使用标准 CSS 选择器，:contains 在 querySelector 中无效）
  const OKX_SELECTORS = {
    confirmButtons: [
      'button[data-testid="confirm-footer-button"]',
      'button[class*="confirm"]',
      '.okxweb3-connect-dialog button[type="button"]',
      '[class*="okx"] button[class*="primary"]',
      '[class*="okx"] button[class*="confirm"]'
    ],
    // 按按钮文本匹配的关键词（用于在 document 中查找按钮）
    confirmButtonTexts: ['确认', 'Confirm', 'Approve', '签名', 'Sign', '批准', '同意']
  };

  // 在根节点下按文本查找确认按钮（兼容无 class 的 OKX 弹窗）
  function findConfirmButtonByText(root) {
    const buttons = (root || document).querySelectorAll('button');
    const text = (t) => (t && (t.textContent || t.innerText || '')).trim();
    for (const btn of buttons) {
      const label = text(btn);
      if (!label) continue;
      const match = OKX_SELECTORS.confirmButtonTexts.some(
        keyword => label.toLowerCase().includes(keyword.toLowerCase())
      );
      if (match && btn.offsetParent !== null) {
        const rect = btn.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return btn;
      }
    }
    return null;
  }

  // 检查是否是黑名单网站
  function isBlacklisted() {
    if (!config.blacklist || config.blacklist.length === 0) return false;
    const currentUrl = window.location.href;
    return config.blacklist.some(domain => currentUrl.includes(domain));
  }

  // 检查是否是白名单网站（如果启用白名单模式）
  function isWhitelisted() {
    if (!config.whitelistMode) return true;
    if (!config.whitelist || config.whitelist.length === 0) return false;
    const currentUrl = window.location.href;
    return config.whitelist.some(domain => currentUrl.includes(domain));
  }

  // 查找并点击确认按钮
  async function findAndClickConfirmButton() {
    if (isBlacklisted()) {
      console.log('[OKX Auto Approve] 当前网站在黑名单中，跳过');
      return false;
    }

    if (!isWhitelisted()) {
      console.log('[OKX Auto Approve] 当前网站不在白名单中，跳过');
      return false;
    }

    // 遍历所有可能的选择器
    for (const selector of OKX_SELECTORS.confirmButtons) {
      try {
        // 在主文档中查找
        let button = document.querySelector(selector);
        
        // 如果主文档中没找到，尝试在 iframe 中查找
        if (!button) {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            try {
              const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (iframeDoc) {
                button = iframeDoc.querySelector(selector);
                if (button) break;
              }
            } catch (e) {
              // 跨域 iframe 无法访问，跳过
            }
          }
        }

        if (button && button.offsetParent !== null) {
          // 检查按钮是否可见和可点击
          const rect = button.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            // 延迟点击，模拟人类行为
            await new Promise(resolve => setTimeout(resolve, config.approveDelay || 500));
            
            // 点击按钮
            button.click();
            
            console.log(`[OKX Auto Approve] 已自动点击确认按钮: ${selector}`);
            
            // 记录批准
            chrome.runtime.sendMessage({ 
              action: 'recordApproval'
            });
            
            // 通知用户
            showNotification('✅ 已自动确认交易');
            
            return true;
          }
        }
      } catch (err) {
        // 继续尝试其他选择器
      }
    }
    
    return false;
  }

  // 显示通知
  function showNotification(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 500;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    // 添加动画
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // 使用 MutationObserver 监听 DOM 变化
  const observer = new MutationObserver(async (mutations) => {
    if (!config.autoApprove) return;

    // 检查是否出现了 OKX 弹窗
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        // 延迟一小段时间，确保弹窗完全渲染
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 尝试找到并点击确认按钮
        const clicked = await findAndClickConfirmButton();
        if (clicked) {
          break;
        }
      }
    }
  });

  // 开始观察
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 定期检查（作为后备方案）
  setInterval(async () => {
    if (config.autoApprove) {
      await findAndClickConfirmButton();
    }
  }, 1000);

  console.log('[OKX Auto Approve] 监听器已启动');
})();
d() {
    if (!config.whitelistMode) return true;
    if (!config.whitelist || config.whitelist.length === 0) return false;
    const currentUrl = window.location.href;
    return config.whitelist.some(domain => currentUrl.includes(domain));
  }

  // 查找并点击确认按钮
  async function findAndClickConfirmButton() {
    if (isBlacklisted()) {
      return false;
    }
    if (!isWhitelisted()) {
      return false;
    }

    // 搜索范围：主文档 + 所有可访问的 iframe
    const searchRoots = [document];
    const iframes = document.querySelectorAll('iframe');
    for (const iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (iframeDoc) searchRoots.push(iframeDoc);
      } catch (e) {
        // 跨域 iframe 无法访问
      }
    }

    for (const root of searchRoots) {
      // 1. 先尝试 CSS 选择器
      for (const selector of CSS_SELECTORS) {
        try {
          const button = root.querySelector(selector);
          if (button && isButtonVisible(button)) {
            await clickWithDelay(button, selector);
            return true;
          }
        } catch (e) {
          // 选择器可能不合法，跳过
        }
      }

      // 2. 再尝试 textContent 匹配
      const button = findButtonByText(root);
      if (button && isButtonVisible(button)) {
        await clickWithDelay(button, `text:"${button.textContent.trim()}"`);
        return true;
      }
    }

    return false;
  }

  // 检查按钮是否可见可点击
  function isButtonVisible(button) {
    if (button.offsetParent === null) return false;
    const rect = button.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  // 延迟点击
  async function clickWithDelay(button, selectorInfo) {
    await new Promise(resolve => setTimeout(resolve, config.approveDelay || 500));
    button.click();
    console.log(`[OKX Auto Approve] 已自动点击确认按钮: ${selectorInfo}`);

    chrome.runtime.sendMessage({ action: 'recordApproval' });
    showNotification('✅ 已自动确认交易');
  }

  // ================================================================
  // 3. 通知系统
  // ================================================================

  function showNotification(message, type = 'success') {
    const colors = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#6366f1'
    };

    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${colors[type] || colors.success};
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      z-index: 2147483647;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: 600;
      max-width: 320px;
      animation: okxSlideIn 0.3s ease-out;
      backdrop-filter: blur(8px);
    `;
    notification.textContent = message;

    // 添加动画样式（避免重复添加）
    if (!document.getElementById('okx-auto-approve-styles')) {
      const style = document.createElement('style');
      style.id = 'okx-auto-approve-styles';
      style.textContent = `
        @keyframes okxSlideIn {
          from { transform: translateX(400px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes okxSlideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(400px); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'okxSlideOut 0.3s ease-out forwards';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ================================================================
  // 4. DOM 监听 + 轮询
  // ================================================================

  const observer = new MutationObserver(async (mutations) => {
    if (!config.autoApprove) return;

    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const clicked = await findAndClickConfirmButton();
        if (clicked) break;
      }
    }
  });

  // 等待 body 可用后再启动观察
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // 轮询后备（每 2 秒）
  setInterval(async () => {
    if (config.autoApprove) {
      await findAndClickConfirmButton();
    }
  }, 2000);

  // ================================================================
  // 5. 监听配置变化（实时更新）
  // ================================================================

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.config) {
      config = changes.config.newValue;
      console.log('[OKX Auto Approve] 配置已更新:', config);
    }
  });

  console.log('[OKX Auto Approve] v2.0 监听器已启动');
})();
