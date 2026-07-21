declare module "nigeria-state-lga-data" {
  export function getStates(): string[];
  export function getStatesAndCapitals(): { state: string; capital: string }[];
  export function getLgas(state: string): string[];
  export function getTowns(state: string, lga: string): string[];
  export function getCapital(state: string): string | undefined;
  export function getState(state: string): unknown;
  export function getStatesData(): unknown;
}
