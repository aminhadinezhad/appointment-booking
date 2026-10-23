import { audit } from "../audit";
import { db, type Tx } from "../db";

export const DEFAULT_BOOKABLE_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const DEFAULT_MAX_ADVANCE_DAYS = 60;

export interface BookingSettings {
  bookableHours: number[];
  maxAdvanceDays: number;
}

export async function getSettings(client: Tx = db): Promise<BookingSettings> {
  const row = await client.settings.findUnique({ where: { id: 1 } });
  if (!row) return { bookableHours: DEFAULT_BOOKABLE_HOURS, maxAdvanceDays: DEFAULT_MAX_ADVANCE_DAYS };
  return { bookableHours: [...row.bookableHours].sort((a, b) => a - b), maxAdvanceDays: row.maxAdvanceDays };
}

export async function updateSettings(input: BookingSettings, actorId: string): Promise<BookingSettings> {
  return db.$transaction(async (tx) => {
    const before = await getSettings(tx);
    const row = await tx.settings.upsert({
      where: { id: 1 },
      update: { bookableHours: input.bookableHours, maxAdvanceDays: input.maxAdvanceDays },
      create: { id: 1, bookableHours: input.bookableHours, maxAdvanceDays: input.maxAdvanceDays },
    });
    await audit(tx, {
      actorId,
      action: "SETTINGS_UPDATED",
      entity: "Settings",
      entityId: "1",
      details: { before: { ...before }, after: { ...input } },
    });
    return { bookableHours: row.bookableHours, maxAdvanceDays: row.maxAdvanceDays };
  });
}
