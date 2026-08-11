import type { PromoTier, Sku, StockItem, Store } from "@prisma/client";
import type { PromoTierInput, PromoTierKind } from "@/lib/calculations";

/** ของแถมที่คำนวณได้จากโปรขั้นปัจจุบัน (แสดงเป็นแถวย่อยบนหน้า stock) */
export interface StockFreeGood {
  premiumProduct: string;
  premiumName: string;
  qty: number;
  unitLabel: string;
  tierFromQty: number;
  tierPremiumQty: number;
}

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
  /** ชิ้นต่อหีบ จาก PackingSize (1 = master ไม่มีค่า) */
  packSize: number;
  /** คงเหลือดิบหน่วยชิ้น (qty_available) — ใช้แสดงเศษเท่านั้น */
  stockPieces: number;
  /** จำนวนหีบเต็ม = floor(stockPieces / packSize) */
  stockCases: number;
  /** เศษที่ไม่ครบหีบ (ชิ้น) */
  stockRemainder: number;
  /** คงเหลือหน่วยหีบ (ทศนิยมได้) — ใช้คำนวณทุกสูตร */
  stock: number;
  /** ยอดขายเฉลี่ยต่อวัน หน่วยหีบ */
  avgSales: number;
  /** ยอดขายเฉลี่ยต่อวัน 7 วัน (avg_qty_out_L7) หน่วยหีบ */
  avgQtyOutL7?: number;
  /** ไม่มียอดขายเลยใน 30 วันล่าสุด (ทั้ง L7 และ L30 = 0/ว่าง) — ใช้ mark ในตาราง */
  noSales30?: boolean;
  minDays: number;
  maxDays: number;
  /** ที่มาของ min/max: sku = แก้รายตัว, section = ตามแบรนด์, default = 7/15 */
  thresholdSource?: "sku" | "section" | "default";
  /** MIN/MAX หน่วยหีบ */
  minStock: number;
  maxStock: number;
  stockCvd: number | null;
  /** จำนวนแนะนำสั่ง หน่วยหีบ (ปัดขึ้นเป็นหีบเต็ม) */
  suggestOrder: number;
  currentPromo: string | null;
  nextPromo: string | null;
  nextPromoQty: number | null;
  qtyToNext: number | null;
  currentPromoKind?: PromoTierKind | null;
  nextPromoKind?: PromoTierKind | null;
  hasPromoLadder?: boolean;
  /** จำนวนวันที่โปรที่กำลังใช้อยู่จะหมด (นับจากวันนี้ โซนไทย) — null = ไม่มีวันหมด/ไม่มีโปร */
  currentPromoEndsInDays?: number | null;
  /** รหัส ASSORTEDPRODUCTGROUP จาก C4 (ว่าง = โปรราย SKU เดียว) */
  promoGroup?: string | null;
  /** จำนวน SKU ในกลุ่มจาก master C4 */
  promoGroupMembers?: number;
  promoTiers: PromoTierInput[];
  /** ของแถมที่ได้รับจากโปรปัจจุบัน (null = ไม่ได้แถม) */
  freeGood?: StockFreeGood | null;
  unitPrice?: number | null;
  /**
   * มูลค่าสต็อกจริงของสินค้านี้ (บาท) จาก vda*_product_product.bi_stock_value
   * เป็นยอดรวมมาแล้ว — ห้ามคูณ stock ซ้ำ
   * null = คลังนี้ยังไม่มีข้อมูลต้นทุน → ผู้เรียกถอยไปคิดจาก stock × unitPrice
   */
  stockValue?: number | null;
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
  /**
   * มาจากเป้าขายเดือนนี้ (cross_target_current_month) ไม่ได้มาจาก stock_cover_day
   * = ร้านยังไม่เคยสต็อกสินค้าตัวนี้ คงเหลือ/ยอดขายจึงเป็น 0 โดยธรรมชาติ
   * ไม่ใช่ "ของหมด" — ห้ามเอาไปคิดรวมในสรุปมูลค่า/CVD ของคลัง
   */
  fromTarget?: boolean;
  /** มีโปร C4 อยู่ แต่ร้านไม่เคยสต็อก */
  fromPromo?: boolean;
  /** อยู่ใน blocklist และถึงกำหนดหยุดสั่งแล้ว (effectiveFrom <= now) */
  blocked?: boolean;
  /** เหตุผลที่หยุดสั่ง */
  blockReason?: string | null;
  /** วันเวลาเริ่มหยุดสั่ง (ISO) — อาจเป็นอนาคต */
  blockEffectiveFrom?: string | null;
  /** วันเวลาสิ้นสุดการหยุดสั่ง (ISO) — null = หยุดถาวร */
  blockEffectiveTo?: string | null;
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
  /** threshold ที่ร้านใช้ตอนสั่ง — เก็บไว้ให้ฝั่งเซลส์คำนวณสีธงตรงกัน */
  minDays?: number | null;
  maxDays?: number | null;
  /** ราคา/หีบ ที่ร้านแก้เอง (null = ไม่ได้แก้) — อย่างเดียวที่รับจาก client */
  unitPriceOverride?: number | null;
  /** สแนปช็อตราคา C4 ณ เวลาส่ง — เซิร์ฟเวอร์เติมเอง ไม่รับจาก client */
  c4UnitPrice?: number | null;
  c4DiscountBaht?: number | null;
  c4DiscountPct?: number | null;
  c4NetUnitPrice?: number | null;
  c4PriceExpired?: boolean | null;
  priceFlagged?: boolean;
  priceFlagReason?: string | null;
  /** สแนปช็อตโปร + ของแถม ณ เวลาส่ง — เซิร์ฟเวอร์เติมเอง ไม่รับจาก client */
  c4PromoLabel?: string | null;
  c4PromoKind?: string | null;
  c4PromoGroup?: string | null;
  c4PromoGroupMembers?: number | null;
  c4PooledQty?: number | null;
  c4FreeGoodCode?: string | null;
  c4FreeGoodName?: string | null;
  c4FreeGoodQty?: number | null;
  c4FreeGoodUnit?: string | null;
}

/** กลุ่ม PO ที่พร้อมบันทึกตอนอนุมัติ */
export interface PurchaseOrderInput {
  groupKey: string;
  poNumber: string;
  priceKind: string;
  itemIds: string[];
  totalQty: number;
  totalAmount: number;
  exportPath?: string | null;
  issuedBy?: string;
}

export interface OrderRepository {
  createOrder(storeId: string, items: OrderItemInput[]): Promise<{ id: string }>;
  listOrders(filters?: {
    salesRepEmail?: string;
    salesRepEmails?: string[];
    salesRepId?: string;
    vdaCodes?: string[];
    storeCode?: string;
    status?: string;
    storeId?: string;
  }): Promise<unknown[]>;
  getOrderById(id: string): Promise<unknown | null>;
  approveOrder(id: string, actorEmail?: string): Promise<unknown>;
  rejectOrder(id: string, reason?: string, actorEmail?: string): Promise<unknown>;
  updateOrderItemQty(
    orderId: string,
    itemId: string,
    finalQty: number
  ): Promise<void>;
  /** ราคาที่พนักงานตั้ง — flag คำนวณใหม่ฝั่งเซิร์ฟเวอร์ ไม่รับจาก client */
  updateOrderItemPrice(
    orderId: string,
    itemId: string,
    override: number | null,
    actorEmail: string
  ): Promise<void>;
  assignPoGroups(
    orderId: string,
    assignments: { itemId: string; poGroup: string }[]
  ): Promise<void>;
  createPurchaseOrders(
    orderId: string,
    groups: PurchaseOrderInput[]
  ): Promise<void>;
  listPurchaseOrders(orderId: string): Promise<unknown[]>;
}

export interface DataProvider {
  stock: StockRepository;
  orders: OrderRepository;
}
