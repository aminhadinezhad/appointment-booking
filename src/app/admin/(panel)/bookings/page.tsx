import type { Metadata } from "next";
import { AdminBookingsClient, type BookingFilters } from "@/components/admin/bookings-client";
import { isValidDateKey } from "@/lib/dates";

export const metadata: Metadata = { title: "مدیریت رزروها" };

const STATUSES = ["ALL", "ACTIVE", "PENDING", "HELD", "CANCELLED"] as const;

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const p = await searchParams;
  const initial: BookingFilters = {
    from: p.from && isValidDateKey(p.from) ? p.from : null,
    to: p.to && isValidDateKey(p.to) ? p.to : null,
    status: STATUSES.find((s) => s === p.status) ?? "ALL",
    q: p.q?.slice(0, 100) ?? "",
    inLocked: p.inLocked === "1",
  };
  return <AdminBookingsClient initial={initial} />;
}
