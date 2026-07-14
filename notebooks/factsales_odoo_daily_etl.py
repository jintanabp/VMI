# =============================================================================
# factsales_odoo — ยอดขายรายวัน (daily sales) ETL สำหรับ Fabric Notebook
# -----------------------------------------------------------------------------
# เป้าหมาย: ให้ "ยอดเฉลี่ย 7/30 วัน" ที่แอปคำนวณจากไฟล์นี้ ตรงกับคอลัมน์
#           avg_qty_out_L7 / avg_qty_out_L30 ใน stock_cover_day.csv เป๊ะ ๆ
#
# 3 หลักที่ทำให้ตรงกัน (ล้อตาม StockCoverDayETL ฝั่ง billtype = "out"):
#   1) แหล่ง + นิยามเดียวกัน  : vdaN_account_invoice_line, state ∈ (open, paid),
#                               productcode = regexp_extract(name, r"\[(\d+)\]", 1)
#   2) หน้าต่างวันเดียวกัน     : [batch_date - N, batch_date - 1]
#                               คือ "ไม่รวมวันนี้" ที่ข้อมูลยังไม่ครบ →
#                               max(date_invoice) = วันสิ้นสุด L7/L30 ของ stock_cover
#   3) ปัดเศษเหมือนกัน         : round(sum(quantity), 2) cast double
#
# ผลลัพธ์: Files/exports/factsales_odoo.csv  (schema เดิม ใช้แทนที่ได้ทันที)
#   ProductCode, date_invoice, unit_qty, source
# =============================================================================

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from datetime import datetime, timedelta
from typing import List, Tuple
from functools import reduce
import pytz
import time


# ── โครง log เดียวกับ StockCoverDayETL เพื่อให้ log อ่านเป็นชุดเดียวกัน ──────────
class ActivityLog:

    SEPARATOR = "─" * 62

    def __init__(self, pipeline: str, batch_date: str):
        self._pipeline = pipeline
        self._batch_date = batch_date
        self._t0 = time.time()
        print(f"\n{self.SEPARATOR}")
        print(f" {pipeline} | {batch_date} | START")
        print(self.SEPARATOR)

    def log(self, stage: str, step: str):
        print(f" [{stage:<9}] {step}")

    def done(self):
        total = time.time() - self._t0
        print(self.SEPARATOR)
        print(f" {self._pipeline} | {self._batch_date} | DONE | {total:.1f}s")
        print(f"{self.SEPARATOR}\n")

    def fail(self, error: Exception):
        total = time.time() - self._t0
        print(self.SEPARATOR)
        print(f" {self._pipeline} | {self._batch_date} | FAIL | {total:.1f}s | {error}")
        print(f"{self.SEPARATOR}\n")


class DailySalesETL:
    """factsales_odoo — ยอดขายรายวันต่อ (productcode, วัน, ร้าน)"""

    # ครอบคลุมทั้ง window 7 และ 30 วันของ stock_cover_day (เผื่อไว้ให้แอปใช้ได้ทั้งคู่)
    LOOKBACK_DAYS: int = 30

    ACCOUNT_INVOICE_TABLES: List[str] = [
        "vda1_account_invoice_line",
        "vda2_account_invoice_line",
        "vda3_account_invoice_line",
        "vda4_account_invoice_line",
        "vda5_account_invoice_line",
    ]

    def __init__(self, spark: SparkSession, config: dict):
        self._spark = spark
        self._batch_date: str = config["batch_date"]
        self._bronze_path: str = config["bronze_path"]
        self._log = ActivityLog("factsales_odoo", self._batch_date)

    def _load_table(self, table_name: str) -> DataFrame:
        return self._spark.read.format("delta").load(f"{self._bronze_path}/{table_name}")

    def _window(self) -> Tuple:
        """ตรงกับ StockCoverDayETL._date_window: [batch - N, batch - 1]
        ไม่รวมวันนี้ (batch_date) ที่ข้อมูลยังเข้าไม่ครบ"""
        d = datetime.strptime(self._batch_date, "%Y-%m-%d").date()
        return d - timedelta(days=self.LOOKBACK_DAYS), d - timedelta(days=1)

    # ── Extract ────────────────────────────────────────────────────────────────
    def extract(self) -> DataFrame:
        cols = ["name", "quantity", "date_invoice", "state"]

        dfs = []
        for table in self.ACCOUNT_INVOICE_TABLES:
            vda = table.split("_")[0]  # vda1..vda5
            source = f"VDA_{vda[-1]}"   # vda1 -> "VDA_1" (แอป normalize เป็น vda1)
            df = (
                self._load_table(table).select(*cols)
                # นิยาม "ยอดขาย" เดียวกับ stock_cover_day (billtype = out)
                .filter(F.col("state").isin("open", "paid"))
                .withColumn(
                    "productcode",
                    F.regexp_extract(F.col("name"), r"\[(\d+)\]", 1),
                )
                .withColumn("source", F.lit(source))
                .withColumn("date_invoice", F.to_date(F.col("date_invoice"), "yyyy-MM-dd"))
                .filter(F.col("productcode") != "")
                .select("productcode", "date_invoice", "quantity", "source")
            )
            dfs.append(df)

        sales = reduce(DataFrame.unionByName, dfs)
        self._log.log("Extract", f"account_invoice_line x{len(dfs)}")
        return sales

    # ── Transform (สรุปเป็นรายวัน) ──────────────────────────────────────────────
    def transform(self, df: DataFrame) -> DataFrame:
        start_date, end_date = self._window()

        daily = (
            df.filter(
                (F.col("date_invoice") >= F.lit(start_date))
                & (F.col("date_invoice") <= F.lit(end_date))
            )
            .groupBy("productcode", "date_invoice", "source")
            # ปัดเศษเหมือน stock_cover_day เพื่อให้ผลรวม/เฉลี่ยตรงถึงทศนิยม
            .agg(F.round(F.sum("quantity"), 2).cast("double").alias("unit_qty"))
            # schema drop-in เดิม: ProductCode, date_invoice, unit_qty, source
            .select(
                F.col("productcode").alias("ProductCode"),
                "date_invoice",
                "unit_qty",
                "source",
            )
            .orderBy("date_invoice", "source", "ProductCode")
        )

        self._log.log("Transform", f"daily [{start_date} .. {end_date}]")
        return daily

    # ── Run ────────────────────────────────────────────────────────────────────
    def run(self) -> DataFrame:
        try:
            sales = self.extract()
            daily = self.transform(sales)
            self._log.done()
            return daily
        except Exception as e:
            self._log.fail(e)
            raise


# ── Driver — batch_date อิงเวลาไทย (ให้รันวันเดียวกับ stock_cover_day) ──────────
thai_tz = pytz.timezone("Asia/Bangkok")
batch_dt = datetime.now(thai_tz)
batch_date = batch_dt.strftime("%Y-%m-%d")

config = {
    "batch_date": batch_date,
    "bronze_path": "abfss://VDA_Odoo@onelake.dfs.fabric.microsoft.com/Bronze_Odoo_LH.Lakehouse/Tables/dbo",
}

etl = DailySalesETL(spark, config)  # noqa: F821  (spark ถูก inject โดย Fabric)
df_daily = etl.run()

print(f"rows: {df_daily.count()}")
df_daily.printSchema()
df_daily.show(5, truncate=False)


# =============================================================================
# Export → Files/exports/factsales_odoo.csv  (คนละ cell ได้ / ต่อท้ายได้)
# ล้อรูปแบบ export เดียวกับ stock_cover_day: coalesce(1) + rename part-file
# =============================================================================
mssparkutils.fs.mkdirs("Files/exports/")  # noqa: F821

(
    df_daily.coalesce(1)
    .write
    .mode("overwrite")
    .option("header", "true")
    .csv("Files/exports/factsales_odoo_tmp")
)

# Spark สร้าง part-00000-....csv — rename เป็นชื่อไฟล์เดียว
files = mssparkutils.fs.ls("Files/exports/factsales_odoo_tmp")  # noqa: F821
part = [f.path for f in files if f.name.startswith("part-") and f.name.endswith(".csv")][0]
mssparkutils.fs.cp(part, "Files/exports/factsales_odoo.csv", True)  # noqa: F821
mssparkutils.fs.rm("Files/exports/factsales_odoo_tmp", recurse=True)  # noqa: F821

print("OK → Files/exports/factsales_odoo.csv")
