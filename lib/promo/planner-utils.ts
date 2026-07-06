import type { PromoInspectorProduct, PromoInspectorTier } from "./promo-inspector";

export function activeStepIndex(
  ladder: PromoInspectorTier[],
  pooledQty: number
): number {
  let active = -1;
  for (let i = 0; i < ladder.length; i++) {
    if (pooledQty >= ladder[i].fromQty) active = i;
    else break;
  }
  return active;
}

export function calcNetCase(
  creditPrice: number | null,
  discBaht: number | null,
  discPct: number | null
): number | null {
  if (creditPrice == null) return null;
  if (discBaht != null && discBaht > 0) return Math.max(0, creditPrice - discBaht);
  if (discPct != null && discPct > 0) {
    return Math.max(0, creditPrice * (1 - discPct / 100));
  }
  return creditPrice;
}

export function pooledQtyFromStaged(
  products: PromoInspectorProduct[],
  staged: Record<string, number>
): number {
  return products.reduce(
    (sum, p) => sum + (Number(staged[p.product]) || 0),
    0
  );
}

export function blendedNetForStep(
  products: PromoInspectorProduct[],
  staged: Record<string, number>,
  step: PromoInspectorTier
): { avgNet: number | null; mixedPrice: boolean } {
  let totalQty = 0;
  let totalValue = 0;
  const nets = new Set<number>();

  for (const p of products) {
    const qty = Number(staged[p.product]) || 0;
    if (qty <= 0) continue;
    const net = calcNetCase(p.creditPrice, step.discBaht, step.discPct);
    if (net == null) continue;
    nets.add(Math.round(net * 100));
    totalQty += qty;
    totalValue += net * qty;
  }

  if (totalQty <= 0) return { avgNet: null, mixedPrice: false };
  return {
    avgNet: totalValue / totalQty,
    mixedPrice: nets.size > 1,
  };
}

export function plannerView(
  products: PromoInspectorProduct[],
  ladder: PromoInspectorTier[],
  staged: Record<string, number>
) {
  const pooled = pooledQtyFromStaged(products, staged);
  const activeIdx = activeStepIndex(ladder, pooled);
  const activeStep = activeIdx >= 0 ? ladder[activeIdx] : null;
  const nextStep =
    ladder.find((s) => s.fromQty > pooled) ?? null;
  const mix = activeStep
    ? blendedNetForStep(products, staged, activeStep)
    : { avgNet: null, mixedPrice: false };

  return { pooled, activeIdx, activeStep, nextStep, mix };
}
