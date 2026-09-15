"use client";

import { HelpFlow, type HelpFlowProps } from "./help-flow";
import { helpFlowConfigs } from "./help-flow-configs";

export function PainterHelpFlow(props: HelpFlowProps) {
  return <HelpFlow config={helpFlowConfigs.painter} {...props} />;
}
