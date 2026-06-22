import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import MaskReviewIEC from "@/features/mask-review/MaskReviewIEC";

import "./MaskReviewVR.css";

export default function MaskReviewVR({
  vr,
  iec,
  noIecs,
  maskingStatus,
  dicomType,
  dicomTypeOptions,
  onNext,
  onPrevious,
}) {
  const dispatch = useDispatch();
  useHotkeys("tab", handleNext);
  useHotkeys("right", handleNext);
  useHotkeys("left", handlePrevious);

  function handleNext() {
    // Reset preset to force recalculation for next IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onNext();
  }

  function handlePrevious() {
    // Reset preset to force recalculation for previous IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onPrevious();
  }

  return (
    <MaskReviewIEC
      vr={vr}
      iec={iec}
      noIecs={noIecs}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
    />
  );
}
