import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import MaskIEC from "@/features/mask/MaskIEC";

import "./MaskVR.css";

export default function MaskVR({
  vr,
  iec,
  noIecs,
  maskingStatus,
  dicomType,
  dicomTypeOptions,
  onNext,
  onPrevious,
  hasNext,
}) {
  // Tool options are reset by the route, and only when it actually moves to
  // another exam (see RouteMaskVR).
  useHotkeys("tab", onNext);
  useHotkeys("right", onNext);
  useHotkeys("left", onPrevious);

  return (
    <MaskIEC
      vr={vr}
      iec={iec}
      noIecs={noIecs}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={onNext}
      onPrevious={onPrevious}
      hasNext={hasNext}
    />
  );
}
