"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { apiFetch, errorMessage } from "@/lib/api-client";
import { formatJalaliLong, formatSlot } from "@/lib/dates";

export interface CancelTarget {
  id: string;
  dateKey: string;
  hour: number;
  userName: string;
}

export function CancelBookingDialog({ target, onClose }: { target: CancelTarget | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = React.useState("");
  React.useEffect(() => setReason(""), [target]);

  const mutation = useMutation({
    mutationFn: () => apiFetch(`/api/admin/bookings/${target!.id}/cancel`, { body: { reason: reason.trim() || undefined } }),
    onSuccess: () => {
      toast.success("رزرو لغو شد");
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !mutation.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>لغو رزرو توسط مدیر</DialogTitle>
          {target && (
            <DialogDescription>
              رزرو {target.userName} در {formatJalaliLong(target.dateKey)}، {formatSlot(target.hour)} لغو می‌شود. سابقه رزرو حفظ خواهد شد.
            </DialogDescription>
          )}
        </DialogHeader>
        <Field label="دلیل لغو (اختیاری، برای کاربر نمایش داده می‌شود)" htmlFor="cancel-reason">
          <Textarea id="cancel-reason" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثلاً: تعطیلی غیرمنتظره" />
        </Field>
        <DialogFooter>
          <Button variant="destructive" onClick={() => mutation.mutate()} loading={mutation.isPending}>
            لغو رزرو
          </Button>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            انصراف
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
