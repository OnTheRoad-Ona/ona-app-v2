/**
 * Field-level locks for dual-role signup forms.
 * NIN/BVN only dim when the other account already has a value.
 */
import fs from "fs";

function replaceInRange(src, startMarker, endMarker, replacements) {
  const start = src.indexOf(startMarker);
  if (start < 0) {
    console.error("START NOT FOUND:", JSON.stringify(startMarker.slice(0, 60)));
    return src;
  }
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    console.error("END NOT FOUND:", JSON.stringify(endMarker.slice(0, 60)));
    return src;
  }
  let chunk = src.slice(start, end);
  for (const [from, to] of replacements) {
    chunk = chunk.split(from).join(to);
  }
  return src.slice(0, start) + chunk + src.slice(end);
}

function fieldReplacements(lockVar) {
  return [
    [
      "identityLocked && authLockedFieldClass",
      `${lockVar} && authLockedFieldClass`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : undefined",
      `${lockVar} ? authLockedFieldStyle : undefined`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : authFieldStyle",
      `${lockVar} ? authLockedFieldStyle : authFieldStyle`,
    ],
    ["readOnly={identityLocked}", `readOnly={${lockVar}}`],
    [
      "tabIndex={identityLocked ? -1 : undefined}",
      `tabIndex={${lockVar} ? -1 : undefined}`,
    ],
    ["disabled={identityLocked}", `disabled={${lockVar}}`],
    ["if (identityLocked) return;", `if (${lockVar}) return;`],
    [
      "if (!identityLocked) setFullName(e.target.value);",
      `if (!${lockVar}) setFullName(e.target.value);`,
    ],
  ];
}

// ═══════════════════════════════════════════════
// motorist-signup.tsx (Customer dual-signup)
// ═══════════════════════════════════════════════
{
  const filePath = "src/components/auth/motorist-signup.tsx";
  let s = fs.readFileSync(filePath, "utf8");

  s = s.replace(/if \(identityLocked\) return null;/g, "if (dualSignup) return null;");
  s = s.replace(/\{identityLocked && \(/g, "{dualSignup && (");

  s = replaceInRange(
    s,
    '<Field label="Full name" required>',
    '<Field label="Phone" required>',
    fieldReplacements("nameLocked")
  );
  s = replaceInRange(
    s,
    '<Field label="Phone" required>',
    '<Field label="Email" required>',
    fieldReplacements("phoneLocked")
  );
  s = replaceInRange(
    s,
    '<Field label="Email" required>',
    "{primaryDoc ? (",
    fieldReplacements("emailLocked")
  );
  s = replaceInRange(
    s,
    "{primaryDoc ? (",
    "{bankDoc ? (",
    fieldReplacements("ninLocked")
  );
  s = replaceInRange(
    s,
    "{bankDoc ? (",
    "{identityLocked ? (",
    fieldReplacements("bvnLocked")
  );

  // Remaining → dualSignup
  s = s.replace(/identityLocked/g, "dualSignup");

  s = s.replace(
    /Name, phone, email and ID are filled from your Repair\s+Pro account and dimmed \(locked\)\./g,
    "Name, phone and email from your Repair Pro are prefilled and locked when filled. NIN and BVN stay editable if empty."
  );
  s = s.replace(/finish the Motorist steps\./g, "finish the Customer steps.");
  s = s.replace(
    "Dimmed details stay the same as Repair Pro. Same password. After signup you open as Customer.",
    "Only filled fields are locked. Empty NIN/BVN stay editable. Same password. After signup you open as Customer."
  );

  fs.writeFileSync(filePath, s);
  console.log(
    "motorist-signup: identityLocked=",
    (s.match(/identityLocked/g) || []).length,
    "ninLocked=",
    (s.match(/ninLocked/g) || []).length,
    "bvnLocked=",
    (s.match(/bvnLocked/g) || []).length
  );
}

function replaceInRange(src, startMarker, endMarker, replacements) {
  const start = src.indexOf(startMarker);
  if (start < 0) {
    console.error("START NOT FOUND:", JSON.stringify(startMarker.slice(0, 50)));
    return src;
  }
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    console.error("END NOT FOUND:", JSON.stringify(endMarker.slice(0, 50)));
    return src;
  }
  let chunk = src.slice(start, end);
  for (const [from, to] of replacements) {
    chunk = chunk.split(from).join(to);
  }
  return src.slice(0, start) + chunk + src.slice(end);
}

function fieldReplacements(lockVar) {
  return [
    [
      "identityLocked && authLockedFieldClass",
      `${lockVar} && authLockedFieldClass`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : undefined",
      `${lockVar} ? authLockedFieldStyle : undefined`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : authFieldStyle",
      `${lockVar} ? authLockedFieldStyle : authFieldStyle`,
    ],
    ["readOnly={identityLocked}", `readOnly={${lockVar}}`],
    [
      "tabIndex={identityLocked ? -1 : undefined}",
      `tabIndex={${lockVar} ? -1 : undefined}`,
    ],
    ["disabled={identityLocked}", `disabled={${lockVar}}`],
    ["if (identityLocked) return;", `if (${lockVar}) return;`],
    [
      "if (!identityLocked) setFullName(e.target.value);",
      `if (!${lockVar}) setFullName(e.target.value);`,
    ],
  ];
}

// ── pro-signup.tsx ──
{
  const filePath = "src/components/auth/pro-signup.tsx";
  let s = fs.readFileSync(filePath, "utf8");

  // State
  if (s.includes("const [identityLocked, setIdentityLocked] = useState(false);")) {
    s = s.replace(
      "const [identityLocked, setIdentityLocked] = useState(false);",
      `const [dualSignup, setDualSignup] = useState(false);
  const [nameLocked, setNameLocked] = useState(false);
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [emailLocked, setEmailLocked] = useState(false);
  const [ninLocked, setNinLocked] = useState(false);
  const [bvnLocked, setBvnLocked] = useState(false);`
    );
  }

  // Prefill effect
  if (s.includes("setIdentityLocked")) {
    const newEffect = `/**
   * Prefill from existing Customer — lock only fields that already have values.
   * Empty NIN/BVN stay fully editable (not dimmed).
   */
  useEffect(() => {
    const dualRole = fromMenu || fromProfile;
    if (!dualRole || !isAuthenticated) {
      setDualSignup(false);
      setNameLocked(false);
      setPhoneLocked(false);
      setEmailLocked(false);
      setNinLocked(false);
      setBvnLocked(false);
      return;
    }
    const vaultMot = getVaultProfile("motorist");
    const liveMot =
      userProfile?.accountType === "motorist" ? userProfile : null;
    const sessionSource =
      userProfile && userProfile.accountType !== "professional"
        ? userProfile
        : null;
    const motorist = liveMot || sessionSource || vaultMot;
    if (!motorist) {
      setDualSignup(false);
      setNameLocked(false);
      setPhoneLocked(false);
      setEmailLocked(false);
      setNinLocked(false);
      setBvnLocked(false);
      return;
    }

    setDualSignup(true);

    const name = (motorist.fullName || vaultMot?.fullName || "").trim();
    const em = (motorist.email || vaultMot?.email || "").trim();
    const nin = (motorist.idNumber || vaultMot?.idNumber || "").trim();
    const bankId = (motorist.bvn || vaultMot?.bvn || "").trim();
    const phoneRaw = (motorist.phone || vaultMot?.phone || "").trim();

    if (name) {
      setFullName(name);
      setNameLocked(true);
    } else {
      setNameLocked(false);
    }
    if (em) {
      setEmail(em);
      setEmailLocked(true);
    } else {
      setEmailLocked(false);
    }
    if (nin) {
      setIdNumber(nin);
      setNinLocked(true);
    } else {
      setNinLocked(false);
    }
    if (bankId) {
      setBvn(bankId);
      setBvnLocked(true);
    } else {
      setBvnLocked(false);
    }

    setCity(motorist.city || vaultMot?.city || "Lagos");
    setArea(motorist.area || vaultMot?.area || "");
    const pwd = (vaultMot?.password || motorist.password || "").trim();
    if (pwd) {
      setPassword(pwd);
      setConfirmPassword(pwd);
    }
    if (phoneRaw) {
      const split = splitStoredPhone(phoneRaw);
      setPhoneIso(split.iso);
      setPhoneDial(split.dial);
      setPhoneNational(split.national);
      setPhoneLocked(true);
    } else {
      setPhoneLocked(false);
    }
  }, [userProfile, isAuthenticated, fromMenu, fromProfile]);`;

    src = src.replace(
      /useEffect\(\(\) => \{\s*const dualRole = fromMenu \|\| fromProfile;[\s\S]*?\}, \[userProfile, isAuthenticated, fromMenu, fromProfile\]\);/,
      newEffect
    );
  }

  // Field-level locks for NIN/BVN (critical!)
  if (s.includes("identityLocked") || s.includes("dualSignup && authLockedFieldClass") === false) {
    // If still identityLocked, do field replacements
    if (s.includes("identityLocked")) {
      s = replaceInRange(
        s,
        '<Field label="NIN">',
        '<Field label="BVN">',
        fieldReplacements("ninLocked")
      );
      s = replaceInRange(
        s,
        '<Field label="BVN">',
        "{identityLocked ? (",
        fieldReplacements("bvnLocked")
      );
      s = replaceInRange(
        s,
        '<Field label="Phone" required>',
        '<Field label="Email" required>',
        fieldReplacements("phoneLocked")
      );
      s = replaceInRange(
        s,
        '<Field label="Email" required>',
        '<Field label="NIN">',
        fieldReplacements("emailLocked")
      );
      // Remaining identityLocked → dualSignup
      s = s.replace(/identityLocked/g, "dualSignup");
    }
  }

  s = s.replace(/Motorist account/g, "Customer account");
  s = s.replace(
    /Name, phone, email, NIN and BVN are filled from your Customer\s+account and dimmed \(locked\)\./g,
    "Name, phone and email from your Customer account are prefilled and locked when filled. NIN and BVN stay editable if empty."
  );

  fs.writeFileSync(filePath, s);
  console.log(
    "pro-signup: identityLocked=",
    (s.match(/identityLocked/g) || []).length,
    "ninLocked=",
    (s.match(/ninLocked/g) || []).length,
    "bvnLocked=",
    (s.match(/bvnLocked/g) || []).length
  );
}

function replaceInRange(src, startMarker, endMarker, replacements) {
  const start = src.indexOf(startMarker);
  if (start < 0) {
    console.error("START NOT FOUND:", JSON.stringify(startMarker.slice(0, 50)));
    return src;
  }
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end < 0) {
    console.error("END NOT FOUND:", JSON.stringify(endMarker.slice(0, 50)));
    return src;
  }
  let chunk = src.slice(start, end);
  for (const [from, to] of replacements) {
    chunk = chunk.split(from).join(to);
  }
  return src.slice(0, start) + chunk + src.slice(end);
}

function fieldReplacements(lockVar) {
  return [
    [
      "identityLocked && authLockedFieldClass",
      `${lockVar} && authLockedFieldClass`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : undefined",
      `${lockVar} ? authLockedFieldStyle : undefined`,
    ],
    [
      "identityLocked ? authLockedFieldStyle : authFieldStyle",
      `${lockVar} ? authLockedFieldStyle : authFieldStyle`,
    ],
    ["readOnly={identityLocked}", `readOnly={${lockVar}}`],
    [
      "tabIndex={identityLocked ? -1 : undefined}",
      `tabIndex={${lockVar} ? -1 : undefined}`,
    ],
    ["disabled={identityLocked}", `disabled={${lockVar}}`],
    ["if (identityLocked) return;", `if (${lockVar}) return;`],
    [
      "if (!identityLocked) setFullName(e.target.value);",
      `if (!${lockVar}) setFullName(e.target.value);`,
    ],
  ];
}
