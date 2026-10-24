import type { Metadata } from "next";
import { ScheduleClient } from "@/components/admin/schedule/schedule-client";
import { tehranParts } from "@/lib/time";
import { requireAdminPage } from "@/server/auth/current";

export const metadata: Metadata = { title: "مدیریت زمان‌بندی و تعطیلی‌ها" };

export default async function SchedulePage() {
  await requireAdminPage();
  return <ScheduleClient todayKey={tehranParts().dateKey} />;
}
