"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

function breakOutOfIframe() {
  if (typeof window === "undefined") return false;
  try {
    if (window.top && window.top !== window.self) {
      // Flutterwave finishes inside the checkout iframe — pop full app to top
      window.top.location.replace(window.location.href);
      return true;
    }
  } catch {
    try {
      if (window.top) {
        window.top.location.href = window.location.href;
        return true;
      }
    } catch {
      /* ignore */
    }
  }
  return false;
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { theme } = useApp();
  const isLight = theme === "light";

  // Flutterwave returns tx_ref / status; we also pass ref= on redirect_url
  const ref =
    params.get("ref") ||
    params.get("tx_ref") ||
    params.get("txRef") ||
    params.get("reference") ||
    params.get("trxref") ||
    "";
  const transactionId =
    params.get("transaction_id") ||
    params.get("transactionId") ||
    params.get("id") ||
    "";
  const jobId = params.get("jobId") || "";
  const flwStatus = (params.get("status") || "").toLowerCase();

  const [status, setStatus] = useState<"loading" | "ok" | "fail">("loading");
  const [message, setMessage] = useState("Verifying payment…");
  const [bookedJobId, setBookedJobId] = useState<string | null>(jobId || null);

  // Immediately leave Flutterwave iframe → full Ona shell
  useEffect(() => {
    breakOutOfIframe();
  }, []);

  useEffect(() => {
    // Still inside iframe? keep trying to escape while verifying
    if (breakOutOfIframe()) return;

    if (flwStatus === "cancelled" || flwStatus === "failed") {
      setStatus("fail");
      setMessage("Payment was cancelled or failed. You can try again from the job.");
      return;
    }
    if (!ref && !jobId && !transactionId) {
      setStatus("fail");
      setMessage("Missing payment reference.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/payments/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reference: ref || undefined,
            transactionId: transactionId || undefined,
            jobId: jobId || undefined,
          }),
        });
        const json = await res.json();
        if (cancelled) return;
        // Also force job reload reconciliation path
        if (jobId) {
          await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
            cache: "no-store",
          }).catch(() => null);
        }
        if (json?.ok) {
          setStatus("ok");
          const jid =
            json.data?.job?.id ||
            jobId ||
            json.data?.payment?.requestId ||
            null;
          setBookedJobId(jid);
          setMessage(
            "Payment held in escrow. Job is Booked. Funds release when the job is completed."
          );
          // After success, open the job in the full app (not iframe)
          if (jid) {
            const dest = `/jobs/${jid}`;
            try {
              if (window.top && window.top !== window.self) {
                window.top.location.replace(dest);
                return;
              }
            } catch {
              /* fall through */
            }
            window.setTimeout(() => {
              router.replace(dest);
            }, 600);
          }
        } else if (jobId) {
          // Verify API may fail on ref mismatch — job GET still reconciles held pay
          const jr = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
            cache: "no-store",
          });
          const jj = await jr.json().catch(() => null);
          const st = jj?.data?.job?.status;
          if (
            st === "paid_booked" ||
            st === "en_route" ||
            st === "arrived" ||
            st === "in_progress"
          ) {
            setStatus("ok");
            setBookedJobId(jobId);
            setMessage("Payment received. Job is Booked.");
            router.replace(`/jobs/${jobId}`);
            return;
          }
          setStatus("fail");
          setMessage(json?.error?.message || "Verification failed.");
        } else {
          setStatus("fail");
          setMessage(json?.error?.message || "Verification failed.");
        }
      } catch {
        if (!cancelled) {
          setStatus("fail");
          setMessage("Could not verify payment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ref, transactionId, flwStatus, jobId, router]);

  const sheet = isLight ? "bg-[#c8c9cd]" : "bg-black";
  const ink = isLight ? "text-slate-900" : "text-white";

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-3 px-6 text-center",
        sheet
      )}
    >
      {status === "loading" && (
        <Loader2 className="h-10 w-10 animate-spin text-brand" />
      )}
      {status === "ok" && (
        <CheckCircle2 className="h-12 w-12 text-emerald-500" />
      )}
      {status === "fail" && <XCircle className="h-12 w-12 text-red-500" />}
      <p className={cn("text-[15px] font-bold", ink)}>{message}</p>
      {ref ? (
        <p className="text-[11px] text-brand">Ref · {ref}</p>
      ) : null}
      {status === "ok" && bookedJobId ? (
        <button
          type="button"
          onClick={() => {
            const dest = `/jobs/${bookedJobId}`;
            try {
              if (window.top && window.top !== window.self) {
                window.top.location.replace(dest);
                return;
              }
            } catch {
              /* */
            }
            router.replace(dest);
          }}
          className="mt-2 rounded-xl border-0 bg-[#FF6B35] px-4 py-2.5 text-[13px] font-bold text-white"
        >
          Open booked job
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => {
          try {
            if (window.top && window.top !== window.self) {
              window.top.location.replace("/requests");
              return;
            }
          } catch {
            /* */
          }
          router.push("/requests");
        }}
        className="mt-2 rounded-xl border-0 bg-[#323231] px-4 py-2.5 text-[13px] font-bold text-white"
      >
        View requests
      </button>
      <button
        type="button"
        onClick={() => {
          try {
            if (window.top && window.top !== window.self) {
              window.top.location.replace("/payments/history");
              return;
            }
          } catch {
            /* */
          }
          router.push("/payments/history");
        }}
        className="text-[12px] font-bold text-brand"
      >
        Payment history
      </button>
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#c8c9cd]">
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        </div>
      }
    >
      <CallbackInner />
    </Suspense>
  );
}
