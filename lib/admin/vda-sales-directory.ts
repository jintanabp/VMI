import { getVdaAosBillRegistry, getVdaKeys } from "@/lib/fabric/vda-aos-bill";

/**
 * ทะเบียน รหัสเซลล์ ↔ อีเมล ↔ VDA
 *
 * ตั้งแต่ 28 ก.ย. 2569 **ไม่ใช้ cross_salesman master แล้ว** (รหัส SXXX ที่ใช้จริงไม่มีในไฟล์นั้น):
 * - รหัส ↔ อีเมล = ตาราง `SalesmanEmailAssignment` ที่แอดมินผูกในหน้า «สิทธิ์เซลล์-VDA» เท่านั้น
 * - รหัส ↔ VDA = ทะเบียน VDA (cross_target / VDA_SALESMAN_MAP) เหมือนเดิม
 * ชื่อที่แสดงของรหัสจึงเป็น "รหัส SXXX" · ชื่อคนมาจากบัญชี Microsoft ตอน login
 */

export interface SalesmanVdaRow {
  code: string;
  name: string;
  email: string;
  vdas: string[];
  hasVdaAccess: boolean;
}

export interface PersonCodeAssignment {
  code: string;
  vdas: string[];
}

export interface PersonVdaRow {
  email: string;
  name: string;
  codes: PersonCodeAssignment[];
  allVdas: string[];
  multipleCodes: boolean;
  hasVdaAccess: boolean;
  /** รหัสมีในทะเบียน VDA แต่ยังไม่มีอีเมลใดผูกไว้ */
  unmapped?: boolean;
}

export interface VdaSalesmanRow {
  vda: string;
  salesmanCodes: string[];
  salesmen: Array<{
    code: string;
    name: string;
    email: string;
  }>;
  /** รวมคนเดียวกัน (อีเมลเดียว) ที่มีหลายรหัสใน VDA นี้ */
  people: Array<{
    email: string;
    name: string;
    codes: string[];
  }>;
}

/** อีเมลที่แอดมินผูกให้รหัสเซลล์ (SalesmanEmailAssignment ที่ active) */
export interface ManualEmailAssignment {
  id?: string;
  email: string;
  salesmanCode: string;
}

/** หนึ่งแถวต่อรหัสเซลล์ — หน้า «สิทธิ์เซลล์-VDA» */
export interface SalesCodeRow {
  code: string;
  name: string;
  /** อีเมลที่ผูกไว้ */
  manual: { id: string; email: string }[];
  vdas: string[];
}

export function normSalesCode(code: string) {
  return code.trim().toUpperCase();
}

/** ชื่อที่แสดงของรหัส — ไม่มี master ให้ดึงชื่อพนักงานแล้ว */
export function salesCodeLabel(code: string) {
  return `รหัส ${normSalesCode(code)}`;
}

/**
 * รหัสหลักจากชุดรหัสของคนหนึ่ง — รหัสที่ดูแลคลังอยู่มาก่อน แล้วเรียงตามเลข
 * (แทน pickDefaultSalesmanAssignment / pickAssignmentForCodes เดิมที่อ่าน master)
 */
export function pickPrimaryCode(codes: string[]): string | undefined {
  const vdaReg = getVdaAosBillRegistry();
  const norm = [...new Set(codes.map(normSalesCode))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  return norm.find((c) => vdaReg.getVdasForSalesman(c).length > 0) ?? norm[0];
}

function vdasOf(code: string): string[] {
  return [...getVdaAosBillRegistry().getVdasForSalesman(code)].map((v) => v.toLowerCase()).sort();
}

function buildCodeRows(manual: ManualEmailAssignment[]): SalesCodeRow[] {
  const vdaReg = getVdaAosBillRegistry();
  const codes = new Set<string>();
  if (vdaReg.isLoaded) {
    for (const vda of vdaReg.listVdaCodes()) {
      for (const c of vdaReg.getSalesmanCodesForVda(vda)) codes.add(normSalesCode(c));
    }
  }
  for (const m of manual) codes.add(normSalesCode(m.salesmanCode));

  return [...codes]
    .map((code) => ({
      code,
      name: "",
      manual: manual
        .filter((m) => normSalesCode(m.salesmanCode) === code)
        .map((m) => ({ id: m.id ?? "", email: m.email.trim().toLowerCase() })),
      vdas: vdasOf(code),
    }))
    .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
}

function manualEmailsByCode(manual: ManualEmailAssignment[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of manual) {
    const code = normSalesCode(m.salesmanCode);
    const email = m.email.trim().toLowerCase();
    const list = out.get(code) ?? [];
    if (!list.includes(email)) list.push(email);
    out.set(code, list);
  }
  return out;
}

function buildPeopleRows(manualByCode: Map<string, string[]>): PersonVdaRow[] {
  const vdaReg = getVdaAosBillRegistry();
  const byEmail = new Map<string, PersonVdaRow>();

  const ensurePerson = (email: string, name: string) => {
    const key = email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        // ไม่ใช้ key — "__unmapped__:S555" ต้องคงตัวพิมพ์ใหญ่ไว้ (อีเมลที่ผูกไว้เป็นตัวเล็กอยู่แล้ว)
        email,
        name,
        codes: [],
        allVdas: [],
        multipleCodes: false,
        hasVdaAccess: false,
      });
    }
    return byEmail.get(key)!;
  };

  const upsertCode = (person: PersonVdaRow, code: string) => {
    const norm = normSalesCode(code);
    if (!person.codes.some((c) => c.code === norm)) {
      person.codes.push({ code: norm, vdas: vdasOf(norm) });
    }
  };

  // ทุกอีเมลที่ผูกไว้ — รวมรหัสที่ยังไม่มีคลังด้วย (หน้าทดสอบมุมมองเซลล์ต้องกดได้)
  for (const [code, emails] of manualByCode) {
    for (const email of emails) upsertCode(ensurePerson(email, email), code);
  }

  // รหัสในทะเบียน VDA ที่ยังไม่มีใครผูกอีเมล — แสดงไว้ให้ทดสอบด้วยรหัสอย่างเดียว
  if (vdaReg.isLoaded) {
    for (const vda of vdaReg.listVdaCodes()) {
      for (const raw of vdaReg.getSalesmanCodesForVda(vda)) {
        const code = normSalesCode(raw);
        if ((manualByCode.get(code) ?? []).length > 0) continue;
        const person = ensurePerson(`__unmapped__:${code}`, salesCodeLabel(code));
        person.unmapped = true;
        upsertCode(person, code);
      }
    }
  }

  for (const person of byEmail.values()) {
    person.codes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    person.allVdas = [...new Set(person.codes.flatMap((c) => c.vdas))].sort();
    person.hasVdaAccess = person.allVdas.length > 0;
    person.multipleCodes = person.codes.length > 1;
  }

  return [...byEmail.values()].sort((a, b) => a.name.localeCompare(b.name, "th"));
}

export function buildVdaSalesDirectory(manual: ManualEmailAssignment[] = []) {
  const manualByCode = manualEmailsByCode(manual);
  const vdaReg = getVdaAosBillRegistry();

  // หนึ่งแถวต่อคู่ (รหัส, อีเมล) ที่ผูกไว้
  const salesmen: SalesmanVdaRow[] = [...manualByCode.entries()]
    .flatMap(([code, emails]) =>
      emails.map((email) => {
        const vdas = vdasOf(code);
        return { code, name: email, email, vdas, hasVdaAccess: vdas.length > 0 };
      })
    )
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  const salesmenWithVda = salesmen.filter((s) => s.vdas.length > 0);

  const vdaKeys = vdaReg.isLoaded ? vdaReg.listVdaCodes() : getVdaKeys();
  const vdas: VdaSalesmanRow[] = vdaKeys.map((vda) => {
    const codes = vdaReg.getSalesmanCodesForVda(vda);
    const rows = codes.flatMap((raw) => {
      const code = normSalesCode(raw);
      return (manualByCode.get(code) ?? []).map((email) => ({ code, name: email, email }));
    });
    const people = new Map<string, { email: string; name: string; codes: string[] }>();
    for (const r of rows) {
      const p = people.get(r.email) ?? { email: r.email, name: r.name, codes: [] };
      if (!p.codes.includes(r.code)) p.codes.push(r.code);
      people.set(r.email, p);
    }
    return { vda, salesmanCodes: codes, salesmen: rows, people: [...people.values()] };
  });
  const vdasWithSalesman = vdas.filter((v) => v.salesmanCodes.length > 0);

  const codes = buildCodeRows(manual);
  const people = buildPeopleRows(manualByCode);
  const peopleWithVda = people.filter((p) => p.hasVdaAccess);

  return {
    loaded: { vdaAosBill: vdaReg.isLoaded },
    codes,
    salesmen,
    salesmenWithVda,
    people,
    peopleWithVda,
    vdas,
    vdasWithSalesman,
    stats: {
      totalCodes: codes.length,
      withVdaAccess: codes.filter((c) => c.vdas.length > 0).length,
      totalPeople: people.length,
      peopleWithVda: peopleWithVda.length,
    },
  };
}

/**
 * รหัสเซลล์ทั้งหมดของคนนี้ = รหัสที่ผูกกับอีเมลไว้ (`linkedCodes` = session.manualCodes)
 * ไม่มีการจับคู่อัตโนมัติจาก master แล้ว — ไม่ส่ง/ส่งว่าง = ไม่มีรหัส
 * (`email` คงไว้ในลายเซ็นเพื่อให้ผู้เรียกเดิมไม่ต้องแก้)
 */
export function getPersonSalesCodes(_email: string, linkedCodes?: string[]) {
  return [...new Set((linkedCodes ?? []).map(normSalesCode))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((code) => {
      const vdas = [...getVdaAosBillRegistry().getVdasForSalesman(code)].sort();
      return { code, name: salesCodeLabel(code), vdas, hasVdaAccess: vdas.length > 0 };
    });
}

export function getSalesVdaAccessForSession(input: {
  email: string;
  salesmanCode?: string;
  scopeSalesmanCodes?: string[];
  role?: "sales" | "supervisor" | "manager" | "admin";
  manualCodes?: string[];
}) {
  const vdaReg = getVdaAosBillRegistry();
  const vdas = new Set<string>();
  if (input.salesmanCode) {
    for (const vda of vdaReg.getVdasForSalesman(input.salesmanCode)) vdas.add(vda);
  }

  const personCodes = getPersonSalesCodes(input.email, input.manualCodes);

  return {
    email: input.email,
    salesmanCode: input.salesmanCode ? normSalesCode(input.salesmanCode) : undefined,
    salesmanName: input.salesmanCode ? salesCodeLabel(input.salesmanCode) : undefined,
    vdas: [...vdas].sort(),
    hasVdaAccess: vdas.size > 0,
    codes: personCodes,
    multipleCodes: personCodes.length > 1,
    vdaRegistryLoaded: vdaReg.isLoaded,
  };
}
