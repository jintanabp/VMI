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
  /** รหัสมีใน vda_aos แต่ไม่พบอีเมลใน cross_salesman */
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

function buildPeopleRows(
  salesmen: SalesmanVdaRow[],
  vdaReg: ReturnType<typeof getVdaAosBillRegistry>,
  salesmanReg: ReturnType<typeof getSalesmanRegistry>
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
        const email = assignment?.email?.toLowerCase() ?? `__unmapped__:${code}`;
        const name = assignment
          ? salesmanReg.getDisplayName(assignment)
          : `รหัส ${code}`;
        const person = ensurePerson(email, name);
        if (!assignment?.email) {
          person.unmapped = true;
          person.name = `รหัส ${code} — ไม่พบใน cross_salesman`;
        }
        upsertCode(person, code, vdaReg.getVdasForSalesman(code));
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

export function buildVdaSalesDirectory() {
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
    const salesmenForVda = codes
      .map((code) => {
        const a = salesmanReg.getCurrentByCode(code);
        if (!a) return null;
        return {
          code: a.code,
          name: salesmanReg.getDisplayName(a),
          email: a.email,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    return {
      vda,
      salesmanCodes: codes,
      salesmen: salesmenForVda,
      people: groupVdaPeople(salesmenForVda),
    };
  });

  const vdasWithSalesman = vdas.filter((v) => v.salesmanCodes.length > 0);
  const people = buildPeopleRows(salesmen, vdaReg, salesmanReg);
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

export function getPersonSalesCodes(email: string) {
  const salesmanReg = getSalesmanRegistry();
  const vdaReg = getVdaAosBillRegistry();

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

  const personCodes = getPersonSalesCodes(input.email);

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
