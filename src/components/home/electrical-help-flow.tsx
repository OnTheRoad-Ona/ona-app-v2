"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function ElectricalHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.electrical} {...props} />;
}
