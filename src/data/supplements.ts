export interface SupplementItem {
  key: string;
  label: string;
  time: string;
  optional?: boolean;
}

export const WORKOUT_SUPPLEMENTS: SupplementItem[] = [
  { key: "d3k2",           label: "D3 + K2 damla",           time: "Sabah" },
  { key: "omega3",         label: "Sıvı Omega-3",            time: "Sabah" },
  { key: "veganProtein",   label: "Vegan Protein 1 ölçek",   time: "15:30" },
  { key: "optionalTyrosine", label: "Tyrosine / Alpha GPC",  time: "Antrenman öncesi", optional: true },
  { key: "creatine",       label: "Creatine 5g",             time: "Spor sonrası" },
  { key: "optionalGlutamine", label: "Glutamine 5g",         time: "Spor sonrası", optional: true },
  { key: "magnimore",      label: "Magnimore Plus saşe",     time: "Gece" },
  { key: "psyllium",       label: "Psyllium 5g + 500ml su",  time: "Gece" },
];

export const REST_SUPPLEMENTS: SupplementItem[] = [
  { key: "d3k2",         label: "D3 + K2 damla",         time: "Sabah" },
  { key: "omega3",       label: "Sıvı Omega-3",          time: "Sabah" },
  { key: "veganProtein", label: "Vegan Protein 1 ölçek", time: "15:30" },
  { key: "creatine",     label: "Creatine 5g",           time: "Akşam" },
  { key: "magnimore",    label: "Magnimore Plus saşe",   time: "Gece" },
  { key: "psyllium",     label: "Psyllium 5g + 500ml su",time: "Gece" },
];

export function getSupplementsForDay(isWorkoutDay: boolean): SupplementItem[] {
  return isWorkoutDay ? WORKOUT_SUPPLEMENTS : REST_SUPPLEMENTS;
}
