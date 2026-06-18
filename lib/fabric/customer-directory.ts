import fs from "fs";
import { readCsvFile } from "./csv";

const NON_DIGIT = /\D+/g;

export interface CustomerRecord {
  code: string;
  name: string;
  nameThai: string;
  nameEnglish: string;
  displayName: string;
  address: string;
  area: string;
  cusGroup: string;
  taxId: string;
}

interface InternalCustomer extends CustomerRecord {
  search: string;
  taxDigits: string;
}

function normRow(row: Record<string, string>): InternalCustomer | null {
  const norm: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    norm[k.toLowerCase().trim()] = (v ?? "").trim();
  }

  const code =
    norm.customercode || norm.code || norm.customer_code || "";
  if (!code || code === "0") return null;

  const nameThai = norm.customer_namethai || "";
  const nameEnglish = norm.customer_nameenglish || "";
  const name =
    nameThai ||
    nameEnglish ||
    norm.name ||
    norm.customer_name ||
    "";
  const displayName =
    norm.customercode_name ||
    (code && name ? `${code} — ${name}` : code || name);
  const address =
    norm.addressname || norm.address || norm.customer_address || "";
  const area =
    norm.area_nameenglish || norm.area_namethai || norm.area || "";
  const cusGroup = norm.cusgroup || norm.customergroup || "";
  const taxId = norm.taxid || norm.tax_id || "";
  const search = [code, nameThai, nameEnglish, taxId, displayName, address, area]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const taxDigits = taxId.replace(NON_DIGIT, "");

  return {
    code,
    name,
    nameThai,
    nameEnglish,
    displayName,
    address,
    area,
    cusGroup,
    taxId,
    search,
    taxDigits,
  };
}

function toPublic(c: InternalCustomer): CustomerRecord {
  return {
    code: c.code,
    name: c.name,
    nameThai: c.nameThai,
    nameEnglish: c.nameEnglish,
    displayName: c.displayName,
    address: c.address,
    area: c.area,
    cusGroup: c.cusGroup,
    taxId: c.taxId,
  };
}

export class CustomerDirectory {
  private customers: InternalCustomer[] = [];
  private byCode = new Map<string, InternalCustomer>();
  private csvPath: string | null = null;

  constructor(csvPath?: string | null) {
    if (csvPath) this.load(csvPath);
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[CustomerDirectory] CSV not found: ${csvPath}`);
      this.customers = [];
      this.byCode.clear();
      this.csvPath = csvPath;
      return;
    }

    const { rows } = readCsvFile(csvPath);
    const loaded: InternalCustomer[] = [];
    const byCode = new Map<string, InternalCustomer>();

    for (const row of rows) {
      const c = normRow(row);
      if (!c) continue;
      loaded.push(c);
      byCode.set(c.code, c);
    }

    this.customers = loaded;
    this.byCode = byCode;
    this.csvPath = csvPath;
    console.info(`[CustomerDirectory] Loaded ${loaded.length} customers from ${csvPath}`);
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }

  get size() {
    return this.customers.length;
  }

  get isLoaded() {
    return this.customers.length > 0;
  }

  getByCode(code: string): CustomerRecord | null {
    const c = this.byCode.get(code);
    return c ? toPublic(c) : null;
  }

  search(q: string, limit = 50): CustomerRecord[] {
    if (!q.trim()) {
      return this.customers.slice(0, limit).map(toPublic);
    }

    const qLower = q.toLowerCase();
    const qDigits = q.replace(NON_DIGIT, "");
    const useDigits = qDigits.length >= 4;
    const out: CustomerRecord[] = [];

    for (const c of this.customers) {
      if (
        c.search.includes(qLower) ||
        (useDigits && c.taxDigits && c.taxDigits.includes(qDigits))
      ) {
        out.push(toPublic(c));
        if (out.length >= limit) break;
      }
    }

    return out;
  }

  listAll(limit = 500): CustomerRecord[] {
    return this.customers.slice(0, limit).map(toPublic);
  }
}
