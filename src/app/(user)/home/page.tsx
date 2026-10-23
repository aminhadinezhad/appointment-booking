import type { Metadata } from "next";
import { HomeClient } from "@/components/user/home-client";
import { isValidDateKey } from "@/lib/dates";
import { tehranParts } from "@/lib/time";
import { requireUserPage } from "@/server/auth/current";

export const metadata: Metadata = { title: "رزرو وقت" };

export default async function HomePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUserPage();
  const params = await searchParams;
  const todayKey = tehranParts().dateKey;
  const date = params.date && isValidDateKey(params.date) && params.date >= todayKey ? params.date : todayKey;
  return (
    <HomeClient
      firstName={user.fullName.split(" ")[0] ?? user.fullName}
      todayKey={todayKey}
      initialDate={date}
      rescheduleId={params.reschedule ?? null}
    />
  );
}
