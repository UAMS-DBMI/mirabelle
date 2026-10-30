import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import DicomReviewIEC from "@/features/dicom-review/DicomReviewIEC";

import "./DicomReviewVR.css";

export default function DicomReviewVR({
  vr,
  iec,
  noIecs,
  iecList,
  onSelectIec,
  reviewStatus,
  dicomType,
  dicomTypeOptions,
  onNext,
  onPrevious,
  hasNext,
  hasPrevious,
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

  // A tile of the IEC explorer: the same reset as next/previous. The exam
  // already on screen is ignored, so clicking it doesn't reset its options.
  function handleSelectIec(selectedIec) {
    if (String(selectedIec) === String(iec)) return;
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onSelectIec(selectedIec);
  }

  // When there are no IECs or IEC isn't selected yet, show a message in the middle panel
  return (
    <DicomReviewIEC
      routeName="dicom-review-vr"
      vr={vr}
      iec={iec}
      noIecs={noIecs}
      iecList={iecList}
      onSelectIec={handleSelectIec}
      reviewStatus={reviewStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
      hasNext={hasNext}
      hasPrevious={hasPrevious}
    />
  );
}
