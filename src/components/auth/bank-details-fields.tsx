"use client";

/**
 * Shared bank form: select bank → code + bank name auto;
 * enter 10-digit account number → account name resolves (Flutterwave), like bank apps.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  bankAccountMatchesSignupName,
  bankNameForCode,
  checkBankAccountAvailable,
  fetchNigeriaBanks,
  NG_BANKS,
  resolveNigeriaAccountName,
  validateBankDetailsInput,
  type BankOption,
} from "@/lib/bank-details";
import { cn } from "@/lib/utils";

function selectValue(code: string, name: string) {
  if (!code) return "";
  return `${code}::${name || ""}`;
}

function parseSelectValue(raw: string): { code: string; name: string } {
  if (!raw) return { code: "", name: "" };
  const i = raw.indexOf("::");
  if (i < 0) return { code: raw, name: "" };
  return { code: raw.slice(0, i), name: raw.slice(i + 2) };
}

export type BankDetailsValue = {
  bankCode: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
};

export function BankDetailsFields({
  isLight,
  initial,
  onChange,
  className,
  /** Signup full name — account name must match ≥2 name parts */
  signupFullName,
}: {
  isLight: boolean;
  initial?: Partial<BankDetailsValue>;
  onChange?: (v: BankDetailsValue) => void;
  className?: string;
  signupFullName?: string | null;
}) {
  const [banks, setBanks] = useState<BankOption[]>(NG_BANKS);
  const [bankCode, setBankCode] = useState(initial?.bankCode || "");
  const [bankName, setBankName] = useState(initial?.bankName || "");
  const [bankAccountName, setBankAccountName] = useState(
    initial?.bankAccountName || ""
  );
  const [bankAccountNumber, setBankAccountNumber] = useState(
    initial?.bankAccountNumber || ""
  );
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState<string | null>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResolved = useRef("");

  const emit = useCallback(
    (next: BankDetailsValue) => {
      onChange?.(next);
    },
    [onChange]
  );

  useEffect(() => {
    let cancelled = false;
    void fetchNigeriaBanks()
      .then((r) => {
        if (cancelled || !r.banks.length) return;
        setBanks(r.banks);
      })
      .finally(() => {
        if (!cancelled) setLoadingBanks(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync initial from parent when profile loads
  useEffect(() => {
    if (!initial) return;
    if (initial.bankCode != null) setBankCode(initial.bankCode || "");
    if (initial.bankName != null) setBankName(initial.bankName || "");
    if (initial.bankAccountName != null)
      setBankAccountName(initial.bankAccountName || "");
    if (initial.bankAccountNumber != null)
      setBankAccountNumber(initial.bankAccountNumber || "");
  }, [
    initial?.bankCode,
    initial?.bankName,
    initial?.bankAccountName,
    initial?.bankAccountNumber,
  ]);

  // After banks load, fill bank name from code if missing
  useEffect(() => {
    if (!bankCode || bankName) return;
    const n = bankNameForCode(bankCode, banks);
    if (n) {
      setBankName(n);
      emit({
        bankCode,
        bankName: n,
        bankAccountName,
        bankAccountNumber,
      });
    }
  }, [banks, bankCode]); // eslint-disable-line react-hooks/exhaustive-deps

  const runResolve = useCallback(
    async (code: string, number: string) => {
      const key = `${code}:${number}`;
      if (lastResolved.current === key) return;
      setResolving(true);
      setResolveMsg(null);
      const res = await resolveNigeriaAccountName({
        bankCode: code,
        accountNumber: number,
      });
      setResolving(false);
      if (res.ok) {
        lastResolved.current = key;
        const match = bankAccountMatchesSignupName(
          res.accountName,
          signupFullName
        );
        if (!match.ok && signupFullName?.trim()) {
          setBankAccountName(res.accountName);
          setResolveMsg(match.error);
          emit({
            bankCode: code,
            bankName: bankName || bankNameForCode(code, banks),
            bankAccountName: res.accountName,
            bankAccountNumber: number,
          });
          return;
        }
        setBankAccountName(res.accountName);
        setResolveMsg(
          match.ok
            ? "Account name verified (matches your signup name)"
            : "Account name verified"
        );
        emit({
          bankCode: code,
          bankName: bankName || bankNameForCode(code, banks),
          bankAccountName: res.accountName,
          bankAccountNumber: number,
        });
      } else {
        setResolveMsg(res.error);
      }
    },
    [bankName, banks, emit, signupFullName]
  );

  // Auto-resolve name + uniqueness when bank + 10 digits ready
  useEffect(() => {
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    const num = bankAccountNumber.replace(/\D/g, "");
    if (!bankCode || num.length !== 10) {
      return;
    }
    resolveTimer.current = setTimeout(() => {
      void (async () => {
        await runResolve(bankCode, num);
        const uniq = await checkBankAccountAvailable({
          bankCode,
          accountNumber: num,
        });
        if (!uniq.ok) {
          setResolveMsg(uniq.error);
        }
      })();
    }, 450);
    return () => {
      if (resolveTimer.current) clearTimeout(resolveTimer.current);
    };
  }, [bankCode, bankAccountNumber, runResolve]);

  const selectVal = useMemo(
    () => selectValue(bankCode, bankName),
    [bankCode, bankName]
  );

  const field = isLight
    ? "bg-[#e2e3e7] text-slate-900"
    : "bg-[#1c1c1e] text-white";
  const muted = isLight ? "text-slate-600" : "text-white/65";
  const ink = isLight ? "text-slate-900" : "text-white";

  const onSelectBank = (raw: string) => {
    const { code, name } = parseSelectValue(raw);
    const resolvedName = name || bankNameForCode(code, banks) || "";
    setBankCode(code);
    setBankName(resolvedName);
    lastResolved.current = ""; // re-resolve if account already typed
    setResolveMsg(null);
    emit({
      bankCode: code,
      bankName: resolvedName,
      bankAccountName,
      bankAccountNumber,
    });
  };

  const onAccountNumberChange = (raw: string) => {
    const num = raw.replace(/\D/g, "").slice(0, 10);
    setBankAccountNumber(num);
    if (num.length < 10) {
      lastResolved.current = "";
      // clear verified name when number is edited incomplete
      if (bankAccountName && lastResolved.current) {
        /* keep name until new resolve */
      }
    }
    emit({
      bankCode,
      bankName,
      bankAccountName,
      bankAccountNumber: num,
    });
  };

  return (
    <div className={cn("space-y-2.5", className)}>
      <label className="block">
        <span className={cn("text-[10px] font-bold uppercase", muted)}>
          Bank {loadingBanks ? "(loading full list…)" : ""}
        </span>
        <select
          className={cn(
            "mt-1 h-11 w-full rounded-lg border-0 px-3 text-[13px] font-semibold outline-none",
            field
          )}
          value={selectVal}
          onChange={(e) => onSelectBank(e.target.value)}
        >
          <option value="">Select bank</option>
          {banks.map((b) => (
            <option
              key={`${b.code}::${b.name}`}
              value={selectValue(b.code, b.name)}
            >
              {b.name}
            </option>
          ))}
        </select>
      </label>

      {bankCode ? (
        <p className={cn("text-[12px] font-semibold", muted)}>
          Bank code:
          <span className="font-mono text-[#FF6B35]">{bankCode}</span>
        </p>
      ) : null}

      <label className="block">
        <span className={cn("text-[10px] font-bold uppercase", muted)}>
          Account number (10 digits)
        </span>
        <input
          className={cn(
            "mt-1 h-11 w-full rounded-lg border-0 px-3 text-[13px] font-semibold outline-none",
            field
          )}
          value={bankAccountNumber}
          onChange={(e) => onAccountNumberChange(e.target.value)}
          inputMode="numeric"
          placeholder="0123456789"
          autoComplete="off"
        />
      </label>

      <label className="block">
        <span className={cn("text-[10px] font-bold uppercase", muted)}>
          Account name{" "}
          {resolving ? (
            <span className="normal-case font-medium text-[#FF6B35]">
              · Looking up…
            </span>
          ) : null}
        </span>
        <input
          className={cn(
            "mt-1 h-11 w-full rounded-lg border-0 px-3 text-[13px] font-semibold outline-none",
            field,
            resolving && "opacity-80"
          )}
          value={bankAccountName}
          onChange={(e) => {
            setBankAccountName(e.target.value);
            emit({
              bankCode,
              bankName,
              bankAccountName: e.target.value,
              bankAccountNumber,
            });
          }}
          placeholder={
            bankCode && bankAccountNumber.length === 10
              ? "Resolving account name…"
              : "Select bank + enter number to auto-fill"
          }
          readOnly={resolving}
        />
        {resolveMsg ? (
          <p
            className={cn(
              "mt-1 text-[11px] font-semibold",
              resolveMsg.includes("matches your signup") ||
                resolveMsg === "Account name verified"
                ? "text-emerald-600"
                : "text-[#FF6B35]"
            )}
          >
            {resolveMsg}
          </p>
        ) : (
          <p className={cn("mt-1 text-[10px] font-medium", muted)}>
            Name loads after 10 digits. It must match at least 2 names from
            signup.
          </p>
        )}
      </label>
    </div>
  );
}

export function useBankDetailsValue(
  initial?: Partial<BankDetailsValue>
): [
  BankDetailsValue,
  (v: BankDetailsValue) => void,
  (list?: BankOption[]) => string | null,
] {
  const [value, setValue] = useState<BankDetailsValue>({
    bankCode: initial?.bankCode || "",
    bankName: initial?.bankName || "",
    bankAccountName: initial?.bankAccountName || "",
    bankAccountNumber: initial?.bankAccountNumber || "",
  });

  const validate = (list: BankOption[] = NG_BANKS) =>
    validateBankDetailsInput(value, list);

  return [value, setValue, validate];
}
