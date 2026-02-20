// OKX Wallet Auto Approve v2.0.0 - Injected Script
// 注入到页面上下文，暴露 window.coldWallet API 供 Dashboard 调用

(function () {
  'use strict';

  console.log('[OKX Auto Approve] v2.0 注入脚本已加载');

  // ================================================================
  // 1. 检测 OKX 钱包
  // ================================================================

  let walletDetected = false;

  function detectOKXWallet() {
    if (window.okxwallet || window.okex) {
      if (!walletDetected) {
        walletDetected = true;
        console.log('[OKX Auto Approve] 检测到 OKX 钱包');
        window.postMessage({ type: 'OKX_WALLET_DETECTED' }, '*');
      }
      return true;
    }
    return false;
  }

  // 立即检测
  detectOKXWallet();

  // 轮询等待钱包注入（最长 15 秒）
  if (!walletDetected) {
    const checkInterval = setInterval(() => {
      if (detectOKXWallet()) {
        clearInterval(checkInterval);
      }
    }, 500);
    setTimeout(() => clearInterval(checkInterval), 15000);
  }

  // ================================================================
  // 2. window.coldWallet API — 供 Dashboard WalletAutomationBridge 调用
  // ================================================================

  // 存储待处理的签名 Promise
  const pendingSignatures = new Map();

  // 监听来自 content.js 的签名结果
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const { type, payload } = event.data || {};

    if (type === 'COLD_WALLET_SIGN_RESULT' && payload) {
      const pending = pendingSignatures.get(payload.id);
      if (pending) {
        if (payload.error) {
          pending.reject(new Error(payload.error));
        } else {
          pending.resolve(payload.signature);
        }
        pendingSignatures.delete(payload.id);
      }
    }

    if (type === 'COLD_WALLET_ADDRESS_RESULT' && payload) {
      const pending = pendingSignatures.get('__get_address__');
      if (pending) {
        if (payload.error) {
          pending.reject(new Error(payload.error));
        } else {
          pending.resolve(payload);
        }
        pendingSignatures.delete('__get_address__');
      }
    }

    if (type === 'COLD_WALLET_SWITCH_CHAIN_RESULT' && payload) {
      const pending = pendingSignatures.get('__switch_chain__');
      if (pending) {
        if (payload.error && !payload.success) {
          pending.reject(new Error(payload.error));
        } else {
          pending.resolve(payload);
        }
        pendingSignatures.delete('__switch_chain__');
      }
    }

    if (type === 'COLD_WALLET_PONG' && payload) {
      const pending = pendingSignatures.get('__ping__');
      if (pending) {
        pending.resolve(payload);
        pendingSignatures.delete('__ping__');
      }
    }
  });

  // 生成唯一请求 ID
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
  }

  // 创建带超时的 Promise
  function createPendingPromise(key, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      pendingSignatures.set(key, { resolve, reject });

      setTimeout(() => {
        if (pendingSignatures.has(key)) {
          pendingSignatures.delete(key);
          reject(new Error(`操作超时 (${timeoutMs / 1000}s)`));
        }
      }, timeoutMs);
    });
  }

  // ---- 定义 window.coldWallet 接口 ----
  window.coldWallet = {
    // 插件名称和版本
    name: 'OKX Auto Approve Bridge',
    version: '2.0.0',

    /**
     * 签名交易 — 被 Dashboard WalletAutomationBridge 调用
     * @param {Object} txPayload - 交易数据 { to, value, data, chainId, gas, ... }
     * @returns {Promise<string>} 签名结果
     */
    async signTransaction(txPayload) {
      const id = generateId();
      console.log('[coldWallet] signTransaction 请求:', id, txPayload);

      // 发送给 content.js 处理（content.js 有 chrome API 访问权限）
      window.postMessage({
        type: 'COLD_WALLET_SIGN_REQUEST',
        payload: { id, txPayload, chain: txPayload.chainId }
      }, '*');

      return createPendingPromise(id, 120000);
    },

    /**
     * 发送交易（签名 + 广播）
     * @param {Object} txPayload - 交易数据
     * @returns {Promise<string>} 交易哈希
     */
    async sendTransaction(txPayload) {
      console.log('[coldWallet] sendTransaction 请求:', txPayload);
      const provider = window.okxwallet || window.ethereum;
      if (!provider) throw new Error('未检测到 OKX 钱包');

      return provider.request({
        method: 'eth_sendTransaction',
        params: [txPayload]
      });
    },

    /**
     * 获取当前连接的钱包地址
     * @returns {Promise<{address: string, chainType: string}>}
     */
    async getAddress() {
      console.log('[coldWallet] getAddress 请求');

      // 先尝试直接调用（更快）
      const provider = window.okxwallet || window.ethereum;
      if (provider) {
        try {
          const accounts = await provider.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            return { address: accounts[0], chainType: 'evm' };
          }
        } catch (e) {
          // fallback to message channel
        }
      }

      // 通过消息通道获取（会触发连接弹窗）
      window.postMessage({ type: 'COLD_WALLET_GET_ADDRESS', payload: {} }, '*');
      return createPendingPromise('__get_address__', 30000);
    },

    /**
     * 切换链
     * @param {number} chainId - 目标链 ID
     * @returns {Promise<{success: boolean, chainId: number}>}
     */
    async switchChain(chainId) {
      console.log('[coldWallet] switchChain 请求:', chainId);
      window.postMessage({
        type: 'COLD_WALLET_SWITCH_CHAIN',
        payload: { chainId }
      }, '*');
      return createPendingPromise('__switch_chain__', 30000);
    },

    /**
     * 个人签名（用于消息签名）
     * @param {string} message - 待签名消息
     * @param {string} address - 签名地址
     * @returns {Promise<string>} 签名结果
     */
    async personalSign(message, address) {
      console.log('[coldWallet] personalSign 请求');
      const provider = window.okxwallet || window.ethereum;
      if (!provider) throw new Error('未检测到 OKX 钱包');

      return provider.request({
        method: 'personal_sign',
        params: [message, address]
      });
    },

    /**
     * 检查插件是否在线
     * @returns {Promise<{version: string, enabled: boolean, autoApprove: boolean}>}
     */
    async ping() {
      window.postMessage({ type: 'COLD_WALLET_PING', payload: {} }, '*');
      return createPendingPromise('__ping__', 5000);
    },

    /**
     * 检查 OKX 钱包是否已安装
     * @returns {boolean}
     */
    isWalletInstalled() {
      return !!(window.okxwallet || window.okex);
    },

    /**
     * 获取当前链 ID
     * @returns {Promise<number>}
     */
    async getChainId() {
      const provider = window.okxwallet || window.ethereum;
      if (!provider) throw new Error('未检测到 OKX 钱包');
      const chainIdHex = await provider.request({ method: 'eth_chainId' });
      return parseInt(chainIdHex, 16);
    },

    /**
     * 监听钱包事件
     * @param {string} event - 事件名 ('chainChanged', 'accountsChanged')
     * @param {Function} handler - 回调
     */
    on(event, handler) {
      const provider = window.okxwallet || window.ethereum;
      if (provider && provider.on) {
        provider.on(event, handler);
      }
    }
  };

  // 通知 Dashboard 插件已就绪
  window.dispatchEvent(new CustomEvent('coldWalletReady', {
    detail: { version: '2.0.0', name: 'OKX Auto Approve Bridge' }
  }));

  console.log('[OKX Auto Approve] window.coldWallet API 已暴露');

  // ================================================================
  // 3. 拦截钱包请求（日志记录）
  // ================================================================

  function interceptWalletRequests() {
    const provider = window.okxwallet;
    if (!provider || provider.__intercepted) return;

    const originalRequest = provider.request.bind(provider);
    provider.request = async function (...args) {
      const method = args[0]?.method || args[0];
      console.log('[OKX Auto Approve] 钱包请求:', method, args);

      const result = await originalRequest(...args);
      console.log('[OKX Auto Approve] 钱包响应:', method, result);
      return result;
    };
    provider.__intercepted = true;
  }

  // 钱包可能延迟注入，需要等待
  if (window.okxwallet) {
    interceptWalletRequests();
  } else {
    const waitForWallet = setInterval(() => {
      if (window.okxwallet) {
        interceptWalletRequests();
        clearInterval(waitForWallet);
      }
    }, 1000);
    setTimeout(() => clearInterval(waitForWallet), 15000);
  }
})();
