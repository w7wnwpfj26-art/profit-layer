/**
 * 安全的地址截断
 */
export function truncateAddress(address: string | undefined | null): string {
  if (!address) return "未连接";
  if (address.length < 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * 通用的数字格式化
 */
export function formatCurrency(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) return "0.00";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * 表单校验器
 */
export const validators = {
  isEvmAddress: (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr),
  isPositiveNumber: (val: string) => !isNaN(Number(val)) && Number(val) >= 0,
  isValidApiKey: (key: string) => !key || (key.startsWith('sk-') && key.length > 20),
};
