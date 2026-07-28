"use client";

/**
 * Shared bank form: searchable bank combobox (country-geo list) → code auto;
 * enter 10-digit account number → account name resolves (Flutterwave).
 * Dropdown opens downward — never a full-page takeover.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  bankAccountMatchesSignupName,
  bankNameForCode,
  checkBankAccountAvailable,
  fetchCountryBanks,
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

function BankSearchSelect({
  banks,
  value,
  onChange,
  disabled,
  fieldClass,
  muted,
  ink,
  isLight,
}: {
  banks: BankOption[];
  value: string;
  onChange: (raw: string) => void;
  disabled?: boolean;
  fieldClass: string;
  muted: string;
  ink: string;
  isLight: boolean;
}) {
  const id = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = useMemo(() => {
    const { code, name } = parseSelectValue(value);
    if (!code) return null;
    return (
      banks.find((b) => b.code === code) ||
      (name ? { code, name } : null)
    );
  }, [banks, value]);

  useEffect(() => {
    if (!open) setQuery(selected?.name || "");
  }, [open, selected?.name]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return banks.slice(0, 80);
    return banks
      .filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.code.toLowerCase().includes(q)
      )
      .slice(0, 80);
  }, [banks, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  const pick = (b: BankOption) => {
    onChange(selectValue(b.code, b.name));
    setQuery(b.name);
    setOpen(false);
  };

  const listClass = isLight
    ? "absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-black/10 bg-white shadow-lg"
    : "absolute left-0 right-0 top-full z-50 mt-1 max-h-48 overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-[#1c1c1e] shadow-lg";

  return (
    <div ref={wrapRef} className="relative mt-1">
      <input
        id={id}
        type="search"
        autoComplete="off"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        placeholder="Search bank…"
        className={cn(
          "h-11 w-full rounded-lg border-0 px-3 text-[13px] font-semibold outline-none",
          fieldClass,
          disabled && "opacity-55"
        )}
        value={open ? query : selected?.name || query}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            setQuery(selected?.name || "");
          }
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value) onChange("");
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) pick(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery(selected?.name || "");
          }
        }}
      />
      {open && !disabled ? (
        <ul id={`${id}-list`} role="listbox" className={listClass}>
          {filtered.length === 0 ? (
            <li className={cn("px-3 py-2 text-[13px]", muted)}>No matches</li>
          ) : (
            filtered.map((b, i) => (
              <li key={`${b.code}::${b.name}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={b.code === selected?.code}
                  className={cn(
                    "w-full border-0 bg-transparent px-3 py-2 text-left text-[13px] font-semibold",
                    ink,
                    i === highlight
                      ? isLight
                        ? "bg-[#FF6B35]/15"
                        : "bg-white/10"
                      : isLight
                        ? "hover:bg-black/5"
                        : "hover:bg-white/10"
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(b);
                  }}
                >
                  {b.name}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function BankDetailsFields({
  isLight,
  initial,
  onChange,
  className,
  /** Signup full name — account name must match ≥2 name parts */
  signupFullName,
  /** ISO country for bank list geo-fence (default NG) */
  countryIso,
}: {
  isLight: boolean;
  initial?: Partial<BankDetailsValue>;
  onChange?: (v: BankDetailsValue) => void;
  className?: string;
  signupFullName?: string | null;
  countryIso?: string | null;
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

  const iso = (countryIso || "NG").toUpperCase().slice(0, 2);

  useEffect(() => {
    let cancelled = false;
    setLoadingBanks(true);
    void fetchCountryBanks(iso)
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
  }, [iso]);

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
        setBankAccountName(res.accountName);
        setResolveMsg(
          match.ok || !signupFullName?.trim() ? "Name verified" : null
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
    lastResolved.current = "";
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
          Bank {loadingBanks ? "(loading…)" : iso !== "NG" ? `(${iso})` : ""}
        </span>
        <BankSearchSelect
          banks={banks}
          value={selectVal}
          onChange={onSelectBank}
          disabled={loadingBanks}
          fieldClass={field}
          muted={muted}
          ink={ink}
          isLight={isLight}
        />
      </label>

      {bankCode ? (
        <p className={cn("text-[12px] font-semibold", muted)}>
          Bank code:{" "}
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
              resolveMsg === "Name verified" ||
                resolveMsg.toLowerCase().includes("verified")
                ? "text-emerald-600"
                : "text-red-500"
            )}
          >
            {resolveMsg}
          </p>
        ) : null}
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
