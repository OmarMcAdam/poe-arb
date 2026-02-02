import type { MainCurrencyId, NormalizedCurrencyDetails } from "./models";
import type { RouteKind } from "./edges";

export type VolumeResult = {
  volumeDivLeg: number | null;
  volumeOtherLeg: number | null;
  volumeMin: number | null;
};

function getVolume(details: NormalizedCurrencyDetails, id: MainCurrencyId): number | null {
  const p = details.pairs[id];
  if (!p) return null;
  const v = Number(p.volumePrimaryValue);
  if (!Number.isFinite(v) || v < 0) return null;
  return v;
}

export function computeVolumeMin(
  details: NormalizedCurrencyDetails,
  kind: RouteKind,
): VolumeResult {
  const volumeDivLeg = getVolume(details, "divine");
  const other: MainCurrencyId = kind === "exalted" ? "exalted" : "chaos";
  const volumeOtherLeg = getVolume(details, other);
  const volumeMin =
    volumeDivLeg != null && volumeOtherLeg != null
      ? Math.min(volumeDivLeg, volumeOtherLeg)
      : null;
  return { volumeDivLeg, volumeOtherLeg, volumeMin };
}
