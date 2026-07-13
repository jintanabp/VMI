import type { PromoTier, Sku, StockItem, Store } from "@prisma/client";
import type { PromoTierInput, PromoTierKind } from "@/lib/calculations";

export interface StockRowComputed {
  storeId: string;
  skuId: string;
  skuCode: string;
  skuName: string;
  /** บาร์โค้ดจาก item_barcode_map_v2 (ให้ร้านค้าที่ไม่รู้จัก SKU) */
  barcode?: string;
  /** Section (product group) จาก Dim_Product */
  section?: string;
  /** แบรนด์สินค้า */
  brand?: string;
  stock: number;
  avgSales: number;
  /** ยอดขายเฉลี่ยต่อวัน 7 วัน (avg_qty_out_L7 ดิบ) สำหรับแสดงในคอลัมน์ "ขายเฉลี่ย 7 วัน" */
  avgQtyOutL7?: number;
  /** ไม่มียอดขายเลยใน 30 วันล่าสุด (ทั้ง L7 และ L30 = 0/ว่าง) — ใช้ mark ในตาราง */
  noSales30?: boolean;
  minDays: number;
  maxDays: number;
  /** ที่มาของ min/max: sku = แก้รายตัว, section = ตามแบรนด์, default = 7/15 */
  thresholdSource?: "sku" | "section" | "default";
  minStock: number;
  maxStock: number;
  stockCvd: number | null;
  suggestOrder: number;
  currentPromo: string | null;
  nextPromo: string | null;
  nextPromoQty: number | null;
  qtyToNext: number | null;
  currentPromoKind?: PromoTierKind | null;
  nextPromoKind?: PromoTierKind | null;
  hasPromoLadder?: boolean;
  /** รหัส ASSORTEDPRODUCTGROUP จาก C4 (ว่าง = โปรราย SKU เดียว) */
  promoGroup?: string | null;
  /** จำนวน SKU ในกลุ่มจาก master C4 */
  promoGroupMembers?: number;
  promoTiers: PromoTierInput[];
  unitPrice?: number | null;
  /** ส่วนลด C4 ต่อหีบ (บาท) ตามจำนวนแนะนำ */
  discountBahtPerCase?: number | null;
  /** ส่วนลด C4 ต่อหีบ (%) ตามจำนวนแนะนำ */
  discountPctPerCase?: number | null;
  netUnitPrice?: number | null;
  lineTotal?: number | null;
  priceExpired?: boolean;
  needsOrder: boolean;
  /** แหล่งข้อมูล warehouse (จาก stock_cover_day.from_db) */
  fromDb?: string;
  /** SKU เพิ่งเข้าใหม่ในข้อมูล Fabric (ภายใน NEW_PRODUCT_DAYS) */
  isNew?: boolean;
  /** อยู่ใน blocklist และถึงกำหนดหยุดสั่งแล้ว (effectiveFrom <= now) */
  blocked?: boolean;
  /** เหตุผลที่หยุดสั่ง */
  blockReason?: string | null;
  /** วันเวลาเริ่มหยุดสั่ง (ISO) — อาจเป็นอนาคต */
  blockEffectiveFrom?: string | null;
}

export type StockItemWithSku = StockItem & { sku: Sku & { promoTiers: PromoTier[] } };
export type StoreWithStock = Store & { stockItems: StockItemWithSku[] };

export interface StockRepository {
  getStores(): Promise<Store[]>;
  getStoreByCode(code: string): Promise<Store | null>;
  getStoreStock(storeId: string): Promise<StockRowComputed[]>;
  updateStockThresholds(
    storeId: string,
    skuId: string,
    data: { minDays?: number; maxDays?: number }
  ): Promise<void>;
}

export interface OrderItemInput {
  skuId: string;
  suggestedQty: number;
  finalQty: number;
  cvdEstimate: number | null;
}

export interface OrderRepository {
  createOrder(storeId: string, items: OrderItemInput[]): Promise<{ id: string }>;
  listOrders(filters?: {
    salesRepEmail?: string;
    salesRepEmails?: string[];
    salesRepId?: string;
    salesmanCodes?: string[];
    vdaCodes?: string[];
    storeCode?: string;
    status?: string;
    storeId?: string;
  }): Promise<unknown[]>;
  getOrderById(id: string): Promise<unknown | null>;
  approveOrder(id: string): Promise<unknown>;
  rejectOrder(id: string, reason?: string): Promise<unknown>;
  updateOrderItemQty(
    orderId: string,
    itemId: string,
    finalQty: number
  ): Promise<void>;
}

export interface DataProvider {
  stock: StockRepository;
  orders: OrderRepository;
}
