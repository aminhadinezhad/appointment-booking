"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { AdminPageHeader } from "@/components/admin/admin-shell";
import { Avatar, FilterChips, Pagination } from "@/components/admin/common";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { apiFetch, errorMessage, toQuery } from "@/lib/api-client";
import { toFaDigits } from "@/lib/digits";
import { formatDateTime } from "@/lib/time";
import type { Page, UserListItem } from "@/lib/types";

const STATUS = [
  { key: "ALL", label: "همه" },
  { key: "ACTIVE", label: "فعال" },
  { key: "INACTIVE", label: "غیرفعال" },
] as const;

export default function AdminUsersPage() {
  const [search, setSearch] = React.useState("");
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState<(typeof STATUS)[number]["key"]>("ALL");
  const [page, setPage] = React.useState(1);

  React.useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const params = { q: q || undefined, status, page, pageSize: 20 };
  const query = useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => apiFetch<Page<UserListItem>>(`/api/admin/users${toQuery(params)}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <AdminPageHeader title="فهرست کاربران" description={query.data ? `${toFaDigits(query.data.total)} کاربر` : undefined} />
      <Card className="mb-4 space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="جست‌وجوی نام یا شماره موبایل..." className="pr-9" aria-label="جست‌وجو" />
        </div>
        <FilterChips
          label="وضعیت کاربر"
          options={STATUS}
          value={status}
          onChange={(s) => {
            setStatus(s);
            setPage(1);
          }}
        />
      </Card>

      {query.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <EmptyState title="کاربری یافت نشد" />
      ) : (
        <>
          <ul className="grid gap-3 xl:grid-cols-2">
            {query.data.items.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/users/${u.id}`}>
                  <Card className="flex items-center gap-3 p-4 transition-colors hover:border-primary/40">
                    <Avatar name={u.fullName} gender={u.gender} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{u.fullName}</p>
                      <p className="ltr text-right text-xs text-muted-foreground">{toFaDigits(u.phone ?? "")}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        عضویت: {formatDateTime(u.createdAt)} · {toFaDigits(u.bookingsCount)} رزرو
                      </p>
                    </div>
                    <Badge variant={u.isActive ? "success" : "destructive"}>{u.isActive ? "فعال" : "غیرفعال"}</Badge>
                    <ChevronLeft className="size-4 text-muted-foreground" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={query.data.pageSize} total={query.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
