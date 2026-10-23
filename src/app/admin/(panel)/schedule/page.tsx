import type { Metadata } from "next";
import { ScheduleClient } from "@/components/admin/schedule/schedule-client";
import { tehranParts } from "@/lib/time";

export const metadata: Metadata = { title: "مدیریت زمان‌بندی و تعطیلی‌ها" };

export default function SchedulePage() {
  return <ScheduleClient todayKey={tehranParts().dateKey} />;
}
