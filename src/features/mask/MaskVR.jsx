import React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDispatch } from "react-redux";
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
  useHotkeys("tab", handleNext);
  useHotkeys("right", handleNext);
  useHotkeys("left", handlePrevious);

  function handleNext() {
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onNext();
  }

  function handlePrevious() {
    dispatch(resetOptions());
    dispatch(setOption({ key: "preset", value: null }));
    onPrevious();
  }

  function handleSelectIec(selectedIec) {
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
