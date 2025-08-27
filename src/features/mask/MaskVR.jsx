import React, { useState, useEffect } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useDispatch } from 'react-redux';
import { resetOptions, setOption } from '@/features/optionSlice';
import MaskIEC from '@/features/mask/MaskIEC';

import "./MaskVR.css";

export default function MaskVR({ vr, iec, onNext, onPrevious }) {
  const dispatch = useDispatch();
  useHotkeys("tab", handleNext);
  useHotkeys("right", handleNext);
  useHotkeys("left", handlePrevious);

  function handleNext() {
    // Reset preset to force recalculation for next IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: 'preset', value: null }));
    onNext();
  }

  function handlePrevious() {
    // Reset preset to force recalculation for previous IEC
    dispatch(resetOptions());
    dispatch(setOption({ key: 'preset', value: null }));
    onPrevious();
  }

  return (
    <>
      {iec && (
        <MaskIEC
          vr={vr}
          iec={iec}
          onNext={handleNext}
          onPrevious={handlePrevious}
        />
      )}
    </>
  );
}