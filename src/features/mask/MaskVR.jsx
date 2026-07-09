import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch, useSelector } from "react-redux";
import { resetOptions, setOption } from "@/features/optionSlice";
import MaskIEC from "@/features/mask/MaskIEC";

import "./MaskVR.css";

export default function MaskVR({
  vr,
  iec,
  noIecs,
  iecList,
  maskingStatus,
  dicomType,
  dicomTypeOptions,
  onNext,
  onPrevious,
  onSelectIec,
}) {
  const dispatch = useDispatch();
  // Block navigation while an exam is still loading, so we never tear a
  // half-loaded exam down mid-stream. Every navigation path — hotkeys, the nav
  // buttons, the queue, and the post-accept/skip advance — routes through
  // these handlers, so this one guard covers them all.
  const loading = useSelector((state) => state.options.loading);
  useHotkeys("tab", handleNext);
  useHotkeys("right", handleNext);
  useHotkeys("left", handlePrevious);

  function handleNext() {
    if (loading) return;
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onNext();
  }

  function handlePrevious() {
    if (loading) return;
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onPrevious();
  }

  function handleSelectIec(selectedIec) {
    if (loading) return;
    // Same preset reset as next/previous — queue clicks are navigation too.
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onSelectIec(selectedIec);
  }

  return (
    <MaskIEC
      vr={vr}
      iec={iec}
      noIecs={noIecs}
      iecList={iecList}
      maskingStatus={maskingStatus}
      dicomType={dicomType}
      dicomTypeOptions={dicomTypeOptions}
      onNext={handleNext}
      onPrevious={handlePrevious}
      onSelectIec={handleSelectIec}
    />
  );
}
