import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import NiftiReviewFile from "@/features/nifti-review/NiftiReviewFile";

import "./NiftiReviewVR.css";

export default function NiftiReviewVR({
  vr,
  file,
  fileList,
  onSelectFile,
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

  // A row of the file queue: the same reset as next/previous. The file already
  // on screen is ignored, so clicking it doesn't reset its options.
  function handleSelectFile(selectedFile) {
    if (String(selectedFile) === String(file)) return;
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onSelectFile(selectedFile);
  }

  return (
    <>
      {file && (
        <NiftiReviewFile
          // routeName="nifti-review-vr"
          vr={vr}
          file={file}
          fileList={fileList}
          onSelectFile={handleSelectFile}
          onNext={handleNext}
          onPrevious={handlePrevious}
          hasNext={hasNext}
          hasPrevious={hasPrevious}
        />
      )}
    </>
  );
}
