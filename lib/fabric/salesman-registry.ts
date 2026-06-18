import fs from "fs";
import { readCsvFile } from "./csv";

const REQUIRED = ["Code", "email", "sYear", "sMonth"] as const;

export interface SalesmanAssignment {
  code: string;
  email: string;
  employeeNo: string;
  nameThai: string;
  nameEnglish: string;
  sYear: string;
  sMonth: string;
  divisionCode: string;
  areaCode: string;
  superCode: string;
  managerCode: string;
}

function sortKey(a: SalesmanAssignment): [string, string] {
  return [a.sYear, a.sMonth];
}

export class SalesmanRegistry {
  private byEmail = new Map<string, SalesmanAssignment[]>();
  private byCode = new Map<string, SalesmanAssignment[]>();
  private csvPath: string | null = null;

  constructor(csvPath?: string | null) {
    if (csvPath) this.load(csvPath);
  }

  load(csvPath: string): void {
    if (!fs.existsSync(csvPath)) {
      console.warn(`[SalesmanRegistry] CSV not found: ${csvPath}`);
      this.byEmail.clear();
      this.byCode.clear();
      this.csvPath = csvPath;
      return;
    }

    const { headers, rows } = readCsvFile(csvPath);
    const headerSet = new Set(headers);
    const missing = REQUIRED.filter((c) => !headerSet.has(c));
    if (missing.length > 0) {
      console.warn(
        `[SalesmanRegistry] Missing columns ${missing.join(", ")} — got ${headers.join(", ")}`
      );
      return;
    }

    const byEmail = new Map<string, SalesmanAssignment[]>();
    const byCode = new Map<string, SalesmanAssignment[]>();

    for (const row of rows) {
      const norm: Record<string, string> = {};
      for (const [k, v] of Object.entries(row)) {
        norm[k] = (v ?? "").trim();
      }

      const email = (norm.email ?? "").toLowerCase();
      const code = norm.Code ?? "";
      if (!email || !code) continue;

      const assignment: SalesmanAssignment = {
        code,
        email,
        employeeNo: norm.EmployeeNo ?? "",
        nameThai: norm.NameThai ?? "",
        nameEnglish: norm.NameEnglish ?? "",
        sYear: norm.sYear ?? "",
        sMonth: (norm.sMonth ?? "").padStart(2, "0"),
        divisionCode: norm.DivisionCode ?? "",
        areaCode: norm.AreaCode ?? "",
        superCode: norm.SuperCode ?? "",
        managerCode: norm.ManagerCode ?? "",
      };

      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email)!.push(assignment);

      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code)!.push(assignment);
    }

    for (const bucket of byEmail.values()) {
      bucket.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
    }
    for (const bucket of byCode.values()) {
      bucket.sort((a, b) => (sortKey(a) < sortKey(b) ? 1 : -1));
    }

    this.byEmail = byEmail;
    this.byCode = byCode;
    this.csvPath = csvPath;
    console.info(
      `[SalesmanRegistry] Loaded ${rows.length} rows / ${byEmail.size} emails from ${csvPath}`
    );
  }

  reload(csvPath?: string): void {
    this.load(csvPath ?? this.csvPath ?? "");
  }

  get size() {
    return this.byEmail.size;
  }

  get isLoaded() {
    return this.byEmail.size > 0;
  }

  getCurrentByEmail(email: string): SalesmanAssignment | null {
    if (!email) return null;
    const list = this.byEmail.get(email.toLowerCase());
    return list?.[0] ?? null;
  }

  getDisplayName(assignment: SalesmanAssignment): string {
    return assignment.nameThai || assignment.nameEnglish || assignment.code;
  }

  /** รายการเซลล์ล่าสุดต่ออีเมล (สำหรับ dropdown admin) */
  listCurrentAssignments(): SalesmanAssignment[] {
    const out: SalesmanAssignment[] = [];
    for (const list of this.byEmail.values()) {
      if (list[0]) out.push(list[0]);
    }
    return out.sort((a, b) =>
      this.getDisplayName(a).localeCompare(this.getDisplayName(b), "th")
    );
  }
}
