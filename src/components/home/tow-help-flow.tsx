"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function TowHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.tow} {...props} />;
}
