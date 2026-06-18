/** แปลง Area_NameEnglish ให้สอดคล้องกับรูปแบบ region ในระบบ (เช่น C4) */
export function normalizeCustomerArea(area: string): string {
  return area.toUpperCase().replace(/\s+/g, "").trim();
}
