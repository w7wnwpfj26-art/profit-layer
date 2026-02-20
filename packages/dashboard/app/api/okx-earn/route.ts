import { NextResponse } from "next/server";
import { 
  queryOKXEarnProducts, 
  queryAllNetworksProducts, 
  formatAsPoolData,
  type OKXEarnQueryParams 
} from "../../lib/okx-earn";

// GET: 获取 OKX Earn 产品列表
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  const network = searchParams.get("network") || undefined;
  const investType = searchParams.get("type") as OKXEarnQueryParams["investType"] || undefined;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const sortBy = (searchParams.get("sortBy") || "TVL") as "TVL" | "RATE";
  const sortOrder = (searchParams.get("sortOrder") || "DESC") as "ASC" | "DESC";
  const allNetworks = searchParams.get("all") === "true";
  const format = searchParams.get("format"); // "pool" 转为池子格式

  try {
    let products;
    let total = 0;

    if (allNetworks) {
      // 获取所有网络的产品
      products = await queryAllNetworksProducts(limit);
      total = products.length;
    } else {
      // 获取指定网络的产品
      const result = await queryOKXEarnProducts({
        network,
        investType,
        limit,
        offset,
        sortBy,
        sortOrder,
      });
      products = result.products;
      total = result.total;
    }

    // 如果需要池子格式
    if (format === "pool") {
      const pools = products.map(formatAsPoolData);
      return NextResponse.json({
        success: true,
        pools,
        total,
        source: "okx-earn",
      });
    }

    return NextResponse.json({
      success: true,
      products,
      total,
      params: { network, investType, limit, offset },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
