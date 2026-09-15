"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function DiagnosticsHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.diagnostics} {...props} />;
}
