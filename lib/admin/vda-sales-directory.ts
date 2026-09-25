import { getSalesmanRegistry } from "@/lib/fabric";
import { getVdaAosBillRegistry, getVdaKeys } from "@/lib/fabric/vda-aos-bill";

export interface SalesmanVdaRow {
  code: string;
  name: string;
  email: string;
  employeeNo: string;
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
  /** รหัสมีในทะเบียน VDA แต่ยังไม่มีอีเมลใดผูกไว้ (ไม่มีทั้งใน cross_salesman และที่แอดมินกำหนด) */
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

/** อีเมลอ้างอิงที่แอดมินกำหนดให้รหัสเซลล์ (SalesmanEmailAssignment ที่ active) */
export interface ManualEmailAssignment {
  email: string;
  salesmanCode: string;
}

function manualEmailsByCode(manual: ManualEmailAssignment[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const m of manual) {
    const code = m.salesmanCode.trim().toUpperCase();
    out.set(code, [...(out.get(code) ?? []), m.email.trim().toLowerCase()]);
  }
  return out;
}

function buildPeopleRows(
  salesmen: SalesmanVdaRow[],
  vdaReg: ReturnType<typeof getVdaAosBillRegistry>,
  salesmanReg: ReturnType<typeof getSalesmanRegistry>,
  manualByCode: Map<string, string[]>
): PersonVdaRow[] {
  const byEmail = new Map<string, PersonVdaRow>();

  const ensurePerson = (email: string, name: string) => {
    const key = email.toLowerCase();
    if (!byEmail.has(key)) {
      byEmail.set(key, {
        email,
        name,
        codes: [],
        allVdas: [],
        multipleCodes: false,
        hasVdaAccess: false,
      });
    }
    const person = byEmail.get(key)!;
    if (name) person.name = name;
    return person;
  };

  const upsertCode = (person: PersonVdaRow, code: string, vdas: string[]) => {
    const norm = code.trim().toUpperCase();
    let row = person.codes.find((c) => c.code === norm);
    if (!row) {
      row = { code: norm, vdas: [] };
      person.codes.push(row);
    }
    const merged = new Set([...row.vdas, ...vdas.map((v) => v.toLowerCase())]);
    row.vdas = [...merged].sort();
  };

  for (const s of salesmen) {
    const person = ensurePerson(s.email, s.name);
    upsertCode(person, s.code, s.vdas);
  }

  if (vdaReg.isLoaded) {
    for (const vda of vdaReg.listVdaCodes()) {
      for (const code of vdaReg.getSalesmanCodesForVda(vda)) {
        const assignment = salesmanReg.getCurrentByCode(code);
        const codeVdas = vdaReg.getVdasForSalesman(code);
        const manualEmails = manualByCode.get(code.trim().toUpperCase()) ?? [];
        // อีเมลที่แอดมินกำหนด = อีเมลอ้างอิงของรหัสนี้ (ใช้แทน cross_salesman ได้)
        for (const email of manualEmails) {
          const person = ensurePerson(
            email,
            byEmail.get(email)?.name || (assignment ? salesmanReg.getDisplayName(assignment) : email)
          );
          upsertCode(person, code, codeVdas);
        }
        if (assignment?.email) {
          const person = ensurePerson(
            assignment.email.toLowerCase(),
            salesmanReg.getDisplayName(assignment)
          );
          upsertCode(person, code, codeVdas);
        } else if (manualEmails.length === 0) {
          const person = ensurePerson(`__unmapped__:${code}`, `รหัส ${code}`);
          person.unmapped = true;
          upsertCode(person, code, codeVdas);
        }
      }
    }
  }

  for (const person of byEmail.values()) {
    person.codes.sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true })
    );
    const vdaSet = new Set<string>();
    for (const c of person.codes) {
      for (const v of c.vdas) vdaSet.add(v);
    }
    person.allVdas = [...vdaSet].sort();
    person.hasVdaAccess = person.allVdas.length > 0;
    person.multipleCodes = person.codes.length > 1;
  }

  return [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "th")
  );
}

function groupVdaPeople(
  salesmen: Array<{ code: string; name: string; email: string }>
) {
  const byEmail = new Map<
    string,
    { email: string; name: string; codes: string[] }
  >();
  for (const s of salesmen) {
    const key = s.email.toLowerCase();
    const row =
      byEmail.get(key) ??
      { email: s.email, name: s.name, codes: [] };
    if (!row.codes.includes(s.code)) row.codes.push(s.code);
    byEmail.set(key, row);
  }
  return [...byEmail.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "th")
  );
}

export function buildVdaSalesDirectory(manual: ManualEmailAssignment[] = []) {
  const manualByCode = manualEmailsByCode(manual);
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();
  const assignments = salesmanReg.listCurrentAssignments();

  const salesmen: SalesmanVdaRow[] = assignments
    .map((a) => {
      const vdas = vdaReg.getVdasForSalesman(a.code);
      return {
        code: a.code,
        name: salesmanReg.getDisplayName(a),
        email: a.email,
        employeeNo: a.employeeNo,
        vdas,
        hasVdaAccess: vdas.length > 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const salesmenWithVda = salesmen.filter((s) => s.vdas.length > 0);

  const vdaKeys = vdaReg.isLoaded ? vdaReg.listVdaCodes() : getVdaKeys();

  const vdas: VdaSalesmanRow[] = vdaKeys.map((vda) => {
    const codes = vdaReg.getSalesmanCodesForVda(vda);
    const salesmenForVda = codes.flatMap((code) => {
      const a = salesmanReg.getCurrentByCode(code);
      const rows: { code: string; name: string; email: string }[] = [];
      for (const email of manualByCode.get(code.trim().toUpperCase()) ?? []) {
        rows.push({
          code: code.trim().toUpperCase(),
          name: a ? salesmanReg.getDisplayName(a) : email,
          email,
        });
      }
      // แถวใน master ที่ไม่มีอีเมล — ข้าม (ไม่งั้นจัดกลุ่มตามอีเมลพัง)
      if (a?.email) rows.push({ code: a.code, name: salesmanReg.getDisplayName(a), email: a.email });
      return rows;
    });

    return {
      vda,
      salesmanCodes: codes,
      salesmen: salesmenForVda,
      people: groupVdaPeople(salesmenForVda),
    };
  });

  const vdasWithSalesman = vdas.filter((v) => v.salesmanCodes.length > 0);
  const people = buildPeopleRows(salesmen, vdaReg, salesmanReg, manualByCode);
  const peopleWithVda = people.filter((p) => p.hasVdaAccess);

  return {
    loaded: {
      salesmanMaster: salesmanReg.isLoaded,
      vdaAosBill: vdaReg.isLoaded,
    },
    salesmen,
    salesmenWithVda,
    people,
    peopleWithVda,
    vdas,
    vdasWithSalesman,
    stats: {
      totalSalesmen: salesmen.length,
      withVdaAccess: salesmenWithVda.length,
      withoutVdaAccess: salesmen.length - salesmenWithVda.length,
      totalPeople: people.length,
      peopleWithVda: peopleWithVda.length,
    },
  };
}

export function pickDefaultSalesmanAssignment(email: string) {
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();
  const assignments = salesmanReg.getAssignmentsByEmail(email);
  if (assignments.length === 0) return null;

  const withVda = assignments.filter(
    (a) => vdaReg.getVdasForSalesman(a.code).length > 0
  );
  const pool = withVda.length > 0 ? withVda : assignments;
  return pool.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
  )[0];
}

/**
 * เหมือน pickDefaultSalesmanAssignment แต่เริ่มจาก "ชุดรหัสที่รู้อยู่แล้ว" ไม่ใช่อีเมล
 *
 * ใช้กับรหัสที่แอดมินกำหนดทับให้อีเมลหนึ่ง (SalesmanEmailAssignment) — รหัสพวกนี้อาจไม่มี
 * แถวในไฟล์ cross_salesman ที่ผูกกับอีเมลนี้เลย จึงหา "รายละเอียดของรหัส" จาก
 * getCurrentByCode() ตรง ๆ แทนที่จะหาแถวที่อีเมลตรงกัน
 */
export function pickAssignmentForCodes(codes: string[]) {
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();
  const assignments = codes
    .map((c) => salesmanReg.getCurrentByCode(c))
    .filter((a): a is NonNullable<typeof a> => a != null);
  if (assignments.length === 0) return null;

  const withVda = assignments.filter(
    (a) => vdaReg.getVdasForSalesman(a.code).length > 0
  );
  const pool = withVda.length > 0 ? withVda : assignments;
  return pool.sort((a, b) =>
    a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
  )[0];
}

/**
 * รหัสเซลล์ทั้งหมดของคนนี้ — แอดมินกำหนดไว้ (`manualCodes` ไม่ว่าง) = ใช้เฉพาะรหัสที่กำหนด
 * แทนการจับคู่อัตโนมัติทั้งหมด ไม่ใช่เพิ่มเข้าไป (ตรงกับ buildSalesSessionWithAccess)
 */
export function getPersonSalesCodes(email: string, manualCodes?: string[]) {
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();

  if (manualCodes && manualCodes.length > 0) {
    return manualCodes.map((raw) => {
      const code = raw.trim().toUpperCase();
      const a = salesmanReg.getCurrentByCode(code);
      const vdas = vdaReg.getVdasForSalesman(code);
      return {
        code,
        name: a ? salesmanReg.getDisplayName(a) : `รหัส ${code}`,
        vdas: [...vdas].sort(),
        hasVdaAccess: vdas.length > 0,
      };
    });
  }

  return salesmanReg.getAssignmentsByEmail(email).map((a) => {
    const vdas = vdaReg.getVdasForSalesman(a.code);
    return {
      code: a.code.trim().toUpperCase(),
      name: salesmanReg.getDisplayName(a),
      vdas: [...vdas].sort(),
      hasVdaAccess: vdas.length > 0,
    };
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
  const salesmanReg = getSalesmanRegistry();
  const codes = new Set<string>();

  const isLead =
    input.role === "manager" || input.role === "supervisor";

  if (isLead) {
    if (input.salesmanCode) codes.add(input.salesmanCode.trim().toUpperCase());
    for (const c of input.scopeSalesmanCodes ?? []) {
      codes.add(c.trim().toUpperCase());
    }
  } else if (input.salesmanCode) {
    codes.add(input.salesmanCode.trim().toUpperCase());
  }

  const vdas = new Set<string>();
  for (const code of codes) {
    for (const vda of vdaReg.getVdasForSalesman(code)) {
      vdas.add(vda);
    }
  }

  const assignment = input.salesmanCode
    ? salesmanReg.getCurrentByCode(input.salesmanCode)
    : salesmanReg.getCurrentByEmail(input.email);

  const personCodes = getPersonSalesCodes(input.email, input.manualCodes);

  return {
    email: input.email,
    salesmanCode: assignment?.code ?? input.salesmanCode,
    salesmanName: assignment
      ? salesmanReg.getDisplayName(assignment)
      : input.salesmanCode
        ? `รหัส ${input.salesmanCode.trim().toUpperCase()}`
        : undefined,
    vdas: [...vdas].sort(),
    hasVdaAccess: vdas.size > 0,
    codes: personCodes,
    multipleCodes: personCodes.length > 1,
    vdaRegistryLoaded: vdaReg.isLoaded,
    salesmanMasterLoaded: salesmanReg.isLoaded,
  };
}
