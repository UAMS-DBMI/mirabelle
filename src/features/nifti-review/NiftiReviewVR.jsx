import React, { useState, useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch, useSelector } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import NiftiReviewFile from "@/features/nifti-review/NiftiReviewFile";

import "./NiftiReviewVR.css";

export default function NiftiReviewVR({
  vr,
  file,
  fileList,
  onNext,
  onPrevious,
  onSelectFile,
}) {
  const dispatch = useDispatch();
  // Block navigation while a file is still loading, so we never tear a
  // half-loaded exam down mid-stream. Every navigation path — hotkeys, the nav
  // buttons, and the queue — routes through these handlers, so this one guard
  // covers them all.
  const loading = useSelector((state) => state.options.loading);
  useHotkeys("tab", handleNext);
  useHotkeys("right", handleNext);
  useHotkeys("left", handlePrevious);

  function handleNext() {
    if (loading) return;
    // Reset preset to force recalculation for next IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onNext();
  }

  function handlePrevious() {
    if (loading) return;
    // Reset preset to force recalculation for previous IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onPrevious();
  }

  function handleSelectFile(selectedFile) {
    if (loading) return;
    // Same preset reset as next/previous — queue clicks are navigation too.
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
          onNext={handleNext}
          onPrevious={handlePrevious}
          onSelectFile={handleSelectFile}
        />
      )}
    </>
  );
}
