"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function VulcanizerHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.vulcanizer} {...props} />;
}
