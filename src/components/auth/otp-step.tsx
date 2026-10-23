"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiError, errorMessage } from "@/lib/api-client";
import { toEnDigits, toFaDigits } from "@/lib/digits";

export interface OtpRequestResponse {
  expiresInSec: number;
  resendInSec: number;
  devCode?: string;
}

function useCountdown(seconds: number, resetKey: unknown) {
  const [left, setLeft] = React.useState(seconds);
  React.useEffect(() => {
    setLeft(seconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) clearInterval(timer);
    }, 500);
    return () => clearInterval(timer);
  }, [seconds, resetKey]);
  return left;
}

const mmss = (s: number) => toFaDigits(`${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`);

/** Second step of login/registration: enter the 5-digit code sent by SMS. */
export function OtpStep({
  phone,
  purpose,
  initial,
  resend,
  onEditPhone,
}: {
  phone: string;
  purpose: "LOGIN" | "REGISTER";
  initial: OtpRequestResponse;
  resend: () => Promise<OtpRequestResponse>;
  onEditPhone: () => void;
}) {
  const router = useRouter();
  const [request, setRequest] = React.useState(initial);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const resendLeft = useCountdown(request.resendInSec, request);
  const expiresLeft = useCountdown(request.expiresInSec, request);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const inFlight = React.useRef(false);

  React.useEffect(() => inputRef.current?.focus(), [request]);

  async function verify(value: string) {
    if (inFlight.current) return;
    if (!/^\d{5}$/.test(value)) {
      setError("کد تأیید ۵ رقمی است");
      return;
    }
    inFlight.current = true;
    setVerifying(true);
    setError(null);
    try {
      await apiFetch("/api/auth/otp/verify", { body: { phone, purpose, code: value } });
      toast.success(purpose === "REGISTER" ? "ثبت‌نام با موفقیت انجام شد" : "خوش آمدید");
      router.replace("/home");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.code === "OTP_TOO_MANY_ATTEMPTS" || e.code === "OTP_EXPIRED")) setCode("");
      setVerifying(false);
      inFlight.current = false;
    }
  }

  async function onResend() {
    setResending(true);
    setError(null);
    try {
      const next = await resend();
      setRequest(next);
      setCode("");
      toast.success("کد جدید ارسال شد");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setResending(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void verify(code);
      }}
      className="space-y-5"
    >
      <p className="text-center text-sm leading-7 text-muted-foreground">
        کد ۵ رقمی ارسال‌شده به شماره <span className="ltr font-semibold text-foreground">{toFaDigits(phone)}</span> را وارد کنید.{" "}
        <button type="button" onClick={onEditPhone} className="font-semibold text-primary hover:underline cursor-pointer">
          ویرایش شماره
        </button>
      </p>

      {request.devCode && (
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning-soft px-3 py-2 text-center text-xs text-warning">
          حالت آزمایشی (فقط در محیط توسعه): کد تأیید{" "}
          <button type="button" className="ltr font-bold underline cursor-pointer" onClick={() => { setCode(request.devCode!); void verify(request.devCode!); }}>
            {toFaDigits(request.devCode)}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="otp">کد تأیید</Label>
        <Input
          id="otp"
          ref={inputRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={5}
          dir="ltr"
          placeholder="- - - - -"
          className="h-14 text-center text-2xl font-bold tracking-[0.6em]"
          value={toFaDigits(code)}
          aria-invalid={!!error}
          aria-describedby={error ? "otp-error" : undefined}
          onChange={(e) => {
            const value = toEnDigits(e.target.value).replace(/\D/g, "").slice(0, 5);
            setCode(value);
            setError(null);
            if (value.length === 5) void verify(value);
          }}
        />
        {error && (
          <p id="otp-error" role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {expiresLeft > 0 ? <>اعتبار کد: {mmss(expiresLeft)}</> : "کد منقضی شده است. کد جدید دریافت کنید."}
        </p>
      </div>

      <Button type="submit" className="w-full" loading={verifying} disabled={code.length !== 5}>
        تأیید و ورود
      </Button>

      <div className="text-center text-sm">
        {resendLeft > 0 ? (
          <span className="text-muted-foreground">ارسال مجدد کد تا {mmss(resendLeft)} دیگر</span>
        ) : (
          <Button type="button" variant="link" onClick={onResend} loading={resending}>
            ارسال مجدد کد
          </Button>
        )}
      </div>
    </form>
  );
}
