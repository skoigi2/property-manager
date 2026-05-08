/** Default room/feature template seeded into a new condition-report walkthrough. */
export const DEFAULT_ROOMS: { room: string; features: string[] }[] = [
  {
    room: "Living Room",
    features: ["Walls", "Flooring", "Ceiling", "Lighting", "Windows", "Doors", "Furnishings"],
  },
  {
    room: "Kitchen",
    features: ["Walls", "Flooring", "Cabinets", "Countertops", "Sink/Taps", "Appliances", "Lighting"],
  },
  {
    room: "Master Bedroom",
    features: ["Walls", "Flooring", "Ceiling", "Lighting", "Windows", "Wardrobes"],
  },
  {
    room: "Second Bedroom",
    features: ["Walls", "Flooring", "Ceiling", "Lighting", "Windows", "Wardrobes"],
  },
  {
    room: "Bathroom",
    features: ["Walls", "Flooring", "Tiles", "Toilet", "Sink/Taps", "Shower/Bath", "Lighting"],
  },
  {
    room: "Hallway / Entrance",
    features: ["Walls", "Flooring", "Ceiling", "Lighting", "Front Door", "Locks/Keys"],
  },
  {
    room: "Balcony / Outdoors",
    features: ["Floor", "Railings", "Drainage", "Lighting"],
  },
];

export type ConditionReportItem = {
  id: string;
  room: string;
  feature: string;
  status: "PERFECT" | "GOOD" | "FAIR" | "POOR" | null;
  notes?: string;
  photoIds: string[];
};

/** Generate a fresh items[] from the default template — items have null status until set. */
export function seedItemsFromTemplate(): ConditionReportItem[] {
  const items: ConditionReportItem[] = [];
  for (const r of DEFAULT_ROOMS) {
    for (const f of r.features) {
      items.push({
        id: cryptoRandomId(),
        room: r.room,
        feature: f,
        status: null,
        notes: "",
        photoIds: [],
      });
    }
  }
  return items;
}

function cryptoRandomId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
