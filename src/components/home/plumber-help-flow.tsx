"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function PlumberHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.plumber} {...props} />;
}
