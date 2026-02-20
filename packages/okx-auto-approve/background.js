// OKX Wallet Auto Approve v2.0.0 - Background Script (Service Worker)
// 管理插件状态、签名队列、多链配置

// ---- 默认配置 ----
const DEFAULT_CONFIG = {
  enabled: true,
  autoApprove: true,
  approveDelay: 500,
  whitelistMode: false,
  whitelist: [],
  blacklist: [],
  approveCount: 0,
  lastApproveTime: null,
  // v2.0 新增
  dashboardUrl: 'http://localhost:3002',
  signatureQueue: [],       // 待签名交易队列
  connectedChainId: null,   // 当前连接的链 ID
  connectedAddress: null,   // 当前连接的地址
  version: '2.0.0'
};

// 支持的链配置
const SUPPORTED_CHAINS = {
  1: { name: 'Ethereum', symbol: 'ETH', icon: '⟠' },
  56: { name: 'BNB Chain', symbol: 'BNB', icon: '🔶' },
  42161: { name: 'Arbitrum', symbol: 'ETH', icon: '🔵' },
  8453: { name: 'Base', symbol: 'ETH', icon: '🔷' },
  10: { name: 'Optimism', symbol: 'ETH', icon: '🔴' },
  137: { name: 'Polygon', symbol: 'MATIC', icon: '💜' },
  43114: { name: 'Avalanche', symbol: 'AVAX', icon: '🔺' }
};

// ================================================================
// 初始化
// ================================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  const stored = await chrome.storage.local.get('config');
  if (!stored.config) {
    // 全新安装
    await chrome.storage.local.set({ config: DEFAULT_CONFIG });
    console.log('[OKX Auto Approve] v2.0 已安装');
  } else if (details.reason === 'update') {
    // 从旧版本升级：合并新字段
    const merged = { ...DEFAULT_CONFIG, ...stored.config, version: '2.0.0' };
    // 确保新字段存在
    if (!merged.signatureQueue) merged.signatureQueue = [];
    if (merged.dashboardUrl === undefined) merged.dashboardUrl = 'http://localhost:3002';
    await chrome.storage.local.set({ config: merged });
    console.log('[OKX Auto Approve] 已从旧版本升级到 v2.0');
  }
});

// ================================================================
// 消息处理
// ================================================================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  handleMessage(request, sender).then(sendResponse).catch(err => {
    console.error('[OKX Auto Approve] 消息处理错误:', err);
    sendResponse({ error: err.message });
  });
  return true; // 保持消息通道开启（异步响应）
});

async function handleMessage(request, sender) {
  const { action } = request;

  switch (action) {
    // ---- 配置相关 ----
    case 'getConfig': {
      const { config } = await chrome.storage.local.get('config');
      return { config: config || DEFAULT_CONFIG };
    }

    case 'updateConfig': {
      await chrome.storage.local.set({ config: request.config });
      return { success: true };
    }

    // ---- 自动确认记录 ----
    case 'recordApproval': {
      const { config } = await chrome.storage.local.get('config');
      const updated = {
        ...config,
        approveCount: (config.approveCount || 0) + 1,
        lastApproveTime: new Date().toISOString()
      };
      await chrome.storage.local.set({ config: updated });
      return { success: true, count: updated.approveCount };
    }

    // ---- 签名队列管理 ----
    case 'addSignatureRequest': {
      const { config } = await chrome.storage.local.get('config');
      const queue = config.signatureQueue || [];
      queue.push({
        ...request.request,
        createdAt: new Date().toISOString()
      });
      // 最多保留 50 条记录
      if (queue.length > 50) queue.splice(0, queue.length - 50);
      await chrome.storage.local.set({ config: { ...config, signatureQueue: queue } });
      return { success: true };
    }

    case 'updateSignatureStatus': {
      const { config } = await chrome.storage.local.get('config');
      const queue = (config.signatureQueue || []).map(item => {
        if (item.id === request.id) {
          return {
            ...item,
            status: request.status,
            signature: request.signature,
            error: request.error,
            updatedAt: new Date().toISOString()
          };
        }
        return item;
      });
      await chrome.storage.local.set({ config: { ...config, signatureQueue: queue } });
      return { success: true };
    }

    case 'getSignatureQueue': {
      const { config } = await chrome.storage.local.get('config');
      return { queue: config.signatureQueue || [] };
    }

    case 'clearSignatureQueue': {
      const { config } = await chrome.storage.local.get('config');
      await chrome.storage.local.set({ config: { ...config, signatureQueue: [] } });
      return { success: true };
    }

    // ---- 白名单/黑名单管理 ----
    case 'addToWhitelist': {
      const { config } = await chrome.storage.local.get('config');
      const whitelist = config.whitelist || [];
      if (!whitelist.includes(request.domain)) {
        whitelist.push(request.domain);
      }
      await chrome.storage.local.set({ config: { ...config, whitelist } });
      return { success: true, whitelist };
    }

    case 'removeFromWhitelist': {
      const { config } = await chrome.storage.local.get('config');
      const whitelist = (config.whitelist || []).filter(d => d !== request.domain);
      await chrome.storage.local.set({ config: { ...config, whitelist } });
      return { success: true, whitelist };
    }

    case 'addToBlacklist': {
      const { config } = await chrome.storage.local.get('config');
      const blacklist = config.blacklist || [];
      if (!blacklist.includes(request.domain)) {
        blacklist.push(request.domain);
      }
      await chrome.storage.local.set({ config: { ...config, blacklist } });
      return { success: true, blacklist };
    }

    case 'removeFromBlacklist': {
      const { config } = await chrome.storage.local.get('config');
      const blacklist = (config.blacklist || []).filter(d => d !== request.domain);
      await chrome.storage.local.set({ config: { ...config, blacklist } });
      return { success: true, blacklist };
    }

    // ---- 链信息 ----
    case 'getSupportedChains': {
      return { chains: SUPPORTED_CHAINS };
    }

    case 'updateConnectedChain': {
      const { config } = await chrome.storage.local.get('config');
      await chrome.storage.local.set({
        config: {
          ...config,
          connectedChainId: request.chainId,
          connectedAddress: request.address || config.connectedAddress
        }
      });
      return { success: true };
    }

    // ---- 日志 ----
    case 'log': {
      console.log(`[OKX Auto Approve] ${request.message}`, request.data || '');
      return { success: true };
    }

    default:
      return { error: `未知操作: ${action}` };
  }
}

// ================================================================
// 标签页监听
// ================================================================

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    const isDeFiSite = /uniswap|aave|curve|compound|pancakeswap|sushiswap|balancer|yearn|lido|eigenlayer|pendle|gmx|morpho|aero/i.test(tab.url);
    if (isDeFiSite) {
      console.log('[OKX Auto Approve] 检测到 DeFi 网站:', tab.url);
    }
  }
});

// ================================================================
// Badge 状态指示
// ================================================================

async function updateBadge() {
  try {
    const { config } = await chrome.storage.local.get('config');
    if (config && config.enabled) {
      await chrome.action.setBadgeText({ text: 'ON' });
      await chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
    } else {
      await chrome.action.setBadgeText({ text: 'OFF' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
    }
  } catch (e) {
    // badge API 可能在某些上下文不可用
  }
}

// 监听配置变化来更新 badge
chrome.storage.onChanged.addListener((changes) => {
  if (changes.config) {
    updateBadge();
  }
});

// 初始化 badge
updateBadge();
