import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import NiftiReviewFile from "@/features/nifti-review/NiftiReviewFile";

import "./NiftiReviewVR.css";

export default function NiftiReviewVR({ vr, file, onNext, onPrevious }) {
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
    <>
      {file && (
        <NiftiReviewFile
          vr={vr}
          file={file}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      )}
    </>
  );
}
