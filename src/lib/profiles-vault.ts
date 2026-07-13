/**
 * Dual-account vault: one Motorist + one Repair Pro profile per device.
 * Each type has its own signup / login. Session activates one at a time.
 */

import type { AccountType, UserProfile } from "@/lib/types";

export const PROFILES_VAULT_KEY = "oga-mecho-profiles-v2";
/** Legacy single-profile key (migrated on read) */
export const LEGACY_PROFILE_KEY = "oga-mecho-profile";

export type ProfilesVault = {
  motorist?: UserProfile;
  professional?: UserProfile;
};

export function readProfilesVault(): ProfilesVault {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PROFILES_VAULT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProfilesVault;
      return {
        motorist:
          parsed.motorist?.accountType === "motorist"
            ? parsed.motorist
            : undefined,
        professional:
          parsed.professional?.accountType === "professional"
            ? parsed.professional
            : undefined,
      };
    }
    // Migrate legacy single profile
    const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacy) {
      const p = JSON.parse(legacy) as UserProfile;
      const vault: ProfilesVault = {};
      if (p.accountType === "motorist") vault.motorist = p;
      if (p.accountType === "professional") vault.professional = p;
      writeProfilesVault(vault);
      return vault;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function writeProfilesVault(vault: ProfilesVault) {
  try {
    localStorage.setItem(PROFILES_VAULT_KEY, JSON.stringify(vault));
    // Keep legacy key in sync with active-type mirror when needed by old readers
    const active =
      vault.professional && vault.motorist
        ? null
        : vault.professional ?? vault.motorist;
    if (active) {
      localStorage.setItem(LEGACY_PROFILE_KEY, JSON.stringify(active));
    }
  } catch {
    /* ignore */
  }
}

export function saveProfileToVault(profile: UserProfile): ProfilesVault {
  const vault = readProfilesVault();
  if (profile.accountType === "motorist") vault.motorist = profile;
  else vault.professional = profile;
  writeProfilesVault(vault);
  return vault;
}

export function getVaultProfile(
  type: AccountType
): UserProfile | undefined {
  const vault = readProfilesVault();
  return type === "motorist" ? vault.motorist : vault.professional;
}

export function hasVaultAccount(type: AccountType): boolean {
  return Boolean(getVaultProfile(type));
}

/**
 * Find accounts matching email + password for login.
 * Same person may have both types with different credentials.
 */
export function findProfilesForLogin(
  email: string,
  password: string
): UserProfile[] {
  const em = email.trim().toLowerCase();
  const vault = readProfilesVault();
  const hits: UserProfile[] = [];
  for (const p of [vault.motorist, vault.professional]) {
    if (!p) continue;
    if (
      p.email.trim().toLowerCase() === em &&
      p.password === password
    ) {
      hits.push(p);
    }
  }
  return hits;
}
